import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import type { StringValue } from 'ms';
import { authenticator } from 'otplib';
import * as qrcode from 'qrcode';
import { and, eq } from 'drizzle-orm';
import { AppConstants } from '../common/app-constants';
import { AppUserRoles } from '../common/enums';
import { AuthInfo, MeResponse } from '../common/types';
import { Utils } from '../common/utils';
import { validatePasswordStrength } from '../common/password-policy';
import { AuditLogService } from '../common/audit-log.service';
import { DbService } from '../db/db.service';
import { userEntity } from '../db/schema';
import { RedisService } from '../redis/redis.service';
import { EmailQueueService } from '../queues/email-queue/email.queue.service';
import { buildActivationEmailHtml, buildPasswordResetEmailHtml } from '../mailer/templates';
import { LoginDto } from './dto/login.dto';
import { ActivateAccountDto } from './dto/activate-account.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';

/** Dati utente esposti nelle risposte di autenticazione (login/refresh/impersonificazione). */
interface AuthUserSummary {
  id: number;
  guid: string;
  name: string;
  surname: string | null;
  email: string;
  role: AppUserRoles;
  scopeId: string | null;
}

/**
 * Risposta di login/refresh/impersonificazione: `accessToken` sempre presente,
 * `refreshToken` assente durante l'impersonificazione (vedi {@link AuthService.generateAuthTokens}).
 */
export interface AuthTokensResponse {
  accessToken: string;
  refreshToken?: string;
  user: AuthUserSummary;
}

/** Risposta di login quando l'utente ha la MFA abilitata: richiede `mfa-verify` con il `tmpToken`. */
export interface MfaRequiredResponse {
  mfaRequired: true;
  tmpToken: string;
}

/** Payload del JWT di accesso, firmato/verificato direttamente con `jsonwebtoken`. */
interface JwtPayload {
  id: number;
  name: string;
  email: string;
  role: AppUserRoles;
  scopeId: string | null;
  /** JWT ID: identificatore casuale univoco per token, evita collisioni sulla chiave Redis `login:${token}`. */
  jti: string;
  /** Presente solo nei JWT di impersonificazione: id del SuperAdmin reale. */
  impersonatedBy?: number;
}

/** Valore salvato su `login:${accessToken}`: dati minimi per l'allowlist + sessionId di riferimento. */
interface LoginAllowlistEntry {
  id: number;
  role: AppUserRoles;
  name: string;
  scopeId: string | null;
  /** Assente per i token di impersonificazione (nessun tracking sessione/dispositivo). */
  sessionId?: string;
}

/**
 * Metadati di una sessione "dispositivo" (`session:${sessionId}`), persistenti tra le
 * rotazioni di access/refresh token: a differenza di `login:${token}` (TTL = durata
 * dell'access token, ~15min) e `rtk:${refreshToken}` (che ruota ad ogni refresh), il
 * `sessionId` resta stabile per tutta la durata del login (fino a `rtkExpiration`),
 * permettendo di elencare/revocare "dispositivi" invece di singoli token effimeri.
 */
interface SessionRecord {
  userId: number;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
  lastUsedAt: string;
  /** Refresh token opaco corrente della sessione, necessario a revocare `rtk:${refreshToken}`. */
  refreshToken: string;
  /** Access token JWT corrente della sessione, necessario a revocare `login:${accessToken}`. */
  accessToken: string;
}

/** Voce restituita da `GET auth/sessions`: rappresentazione pubblica di {@link SessionRecord}. */
export interface SessionSummary {
  sessionId: string;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
  lastUsedAt: string;
  /** `true` se corrisponde alla sessione della richiesta corrente. */
  current: boolean;
}

/** Contesto opzionale (ip/user-agent, sessionId da riusare in caso di refresh) per {@link AuthService.generateAuthTokens}. */
interface SessionContext {
  sessionId?: string;
  ip?: string;
  userAgent?: string;
}

/** Durata di validità (ore) del token di attivazione account. */
const ACTIVATION_TOKEN_HOURS = 48;
/** Durata di validità (ore) del token di reset password. */
const RESET_TOKEN_HOURS = 1;
/** TTL (secondi) della sfida MFA post-login e del secret temporaneo di setup MFA. */
const MFA_TMP_TTL_SECONDS = 300;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  /** Inietta i servizi core usati dal flusso di autenticazione. */
  constructor(
    private readonly db: DbService,
    private readonly emailQueue: EmailQueueService,
    private readonly redisService: RedisService,
    private readonly auditLogService: AuditLogService,
  ) {
    authenticator.options = { step: 30, window: 1 };
  }

  /**
   * Effettua il login con email e password. Se l'utente ha la MFA abilitata,
   * restituisce una richiesta di verifica invece dei token.
   * @throws {UnauthorizedException} Credenziali errate, account non attivato o disabilitato.
   */
  async login(
    { email, password }: LoginDto,
    ip?: string,
    userAgent?: string,
  ): Promise<AuthTokensResponse | MfaRequiredResponse> {
    const user = await this.db.db.query.userEntity.findFirst({
      where: eq(userEntity.email, email),
    });

    if (!user) {
      this.logger.warn(`Login fallito per email: ${email} - utente non trovato.`);
      throw new UnauthorizedException('Credenziali errate.');
    }

    if (!user.pwdSet) {
      this.logger.warn(`Login fallito per email: ${email} - account non attivato.`);
      throw new UnauthorizedException('Account non attivato, controlla la tua email.');
    }

    const valid = await Utils.verifyPassword(password, user.pwd);
    if (!valid) {
      this.logger.warn(`Login fallito per email: ${email} - password errata.`);
      throw new UnauthorizedException('Credenziali errate.');
    }

    if (!user.isActive) {
      this.logger.warn(`Login fallito per email: ${email} - account disabilitato.`);
      throw new UnauthorizedException('Account disabilitato.');
    }

    if (user.isMfaEnabled) {
      const tmpToken = Utils.randomString(32);
      await this.redisService.set(`mfa_tmp:${tmpToken}`, { userId: user.id }, MFA_TMP_TTL_SECONDS);
      this.logger.log(`MFA richiesta per utente ${user.id}.`);
      return { mfaRequired: true, tmpToken };
    }

    const tokens = await this.generateAuthTokens(user, undefined, { ip, userAgent });
    await this.auditLogService.log(
      user.id,
      'login',
      undefined,
      undefined,
      { metodo: 'password' },
      undefined,
      ip,
    );
    return tokens;
  }

  /**
   * Verifica il codice TOTP dopo un login con MFA abilitata e completa l'accesso.
   * @throws {UnauthorizedException} Token temporaneo scaduto o codice non valido.
   */
  async mfaVerify(
    tmpToken: string,
    code: string,
    ip?: string,
    userAgent?: string,
  ): Promise<AuthTokensResponse> {
    const session = await this.redisService.getJson<{ userId: number }>(`mfa_tmp:${tmpToken}`);
    if (!session) {
      this.logger.warn(`Verifica MFA fallita - token temporaneo scaduto: ${tmpToken}`);
      throw new UnauthorizedException('Token MFA scaduto o non valido.');
    }

    const user = await this.db.db.query.userEntity.findFirst({
      where: eq(userEntity.id, session.userId),
    });
    if (!user || !user.isMfaEnabled || !user.totpSecret) {
      this.logger.warn(
        `Verifica MFA fallita per utente ${session.userId} - utente non trovato o MFA non configurata.`,
      );
      throw new UnauthorizedException('Configurazione MFA non valida.');
    }

    const isValid = authenticator.verify({ token: code, secret: user.totpSecret });
    if (!isValid) {
      this.logger.warn(`Verifica MFA fallita per utente ${user.id} - codice TOTP non valido.`);
      throw new UnauthorizedException('Codice MFA non valido.');
    }

    await this.redisService.del(`mfa_tmp:${tmpToken}`);
    const tokens = await this.generateAuthTokens(user, undefined, { ip, userAgent });
    await this.auditLogService.log(
      user.id,
      'login',
      undefined,
      undefined,
      { metodo: 'mfa' },
      undefined,
      ip,
    );
    this.logger.log(`MFA verificata con successo per utente ${user.id}.`);
    return tokens;
  }

  /**
   * Rinnova l'access token usando il refresh token opaco salvato in Redis.
   * Effettua la rotazione: il refresh token usato e la sessione JWT precedente vengono invalidati.
   * @throws {UnauthorizedException} Refresh token non valido/scaduto o utente non valido.
   */
  async refresh(rtk: string, ip?: string, userAgent?: string): Promise<AuthTokensResponse> {
    const session = await this.redisService.getJson<{
      userId: number;
      oldToken: string;
      sessionId?: string;
    }>(`rtk:${rtk}`);
    if (!session) {
      this.logger.warn('Refresh token non valido o scaduto.');
      throw new UnauthorizedException('Refresh token non valido o scaduto.');
    }

    const user = await this.db.db.query.userEntity.findFirst({
      where: eq(userEntity.id, session.userId),
    });
    if (!user || !user.isActive) {
      this.logger.warn(`Refresh fallito: utente ${session.userId} non trovato o disabilitato.`);
      throw new UnauthorizedException('Utente non valido.');
    }

    await this.redisService.del(`rtk:${rtk}`);
    if (session.oldToken) {
      await this.redisService.del(`login:${session.oldToken}`);
    }

    this.logger.log(`Refresh token effettuato per utente ${session.userId}.`);
    // Riusa lo stesso sessionId: il "dispositivo" resta lo stesso attraverso le rotazioni di token.
    return this.generateAuthTokens(user, undefined, {
      sessionId: session.sessionId,
      ip,
      userAgent,
    });
  }

  /**
   * Invalida la sessione corrente: cancella la chiave `login:${token}` e, se
   * il token apparteneva a una sessione tracciata (non impersonificazione),
   * anche il relativo `session:${sessionId}` e `rtk:${refreshToken}` — senza
   * questa pulizia il refresh token resterebbe valido fino alla sua scadenza
   * naturale (7gg) anche dopo il logout, e la sessione comparirebbe ancora
   * come "attiva" in `GET auth/sessions`.
   */
  async logout(token: string, userId?: number, ip?: string): Promise<{ success: boolean }> {
    const allowlistEntry = await this.redisService.getJson<LoginAllowlistEntry>(`login:${token}`);
    await this.redisService.del(`login:${token}`);

    if (allowlistEntry?.sessionId) {
      await this.destroySession(allowlistEntry.sessionId, `login:${token}`);
    }

    await this.auditLogService.log(
      userId ?? null,
      'logout',
      undefined,
      undefined,
      undefined,
      undefined,
      ip,
    );
    this.logger.log(`Sessione invalidata per il token ${token.substring(0, 10)}...`);
    return { success: true };
  }

  /**
   * Elenca le sessioni "dispositivo" attive dell'utente autenticato
   * (`GET auth/sessions`, pagina Profilo). Effettua pulizia lazy delle voci
   * dell'indice `user-sessions:${userId}` la cui `session:${sessionId}` è
   * scaduta naturalmente (TTL allineato a `rtkExpiration`).
   * @param currentToken Access token della richiesta corrente, usato per marcare `current: true`.
   */
  async getActiveSessions(authInfo: AuthInfo, currentToken?: string): Promise<SessionSummary[]> {
    const sessionIds = await this.redisService.smembers(`user-sessions:${authInfo.userId}`);

    let currentSessionId: string | undefined;
    if (currentToken) {
      const currentEntry = await this.redisService.getJson<LoginAllowlistEntry>(
        `login:${currentToken}`,
      );
      currentSessionId = currentEntry?.sessionId;
    }

    const sessions: SessionSummary[] = [];
    for (const sessionId of sessionIds) {
      const record = await this.redisService.getJson<SessionRecord>(`session:${sessionId}`);
      if (!record || record.userId !== authInfo.userId) {
        await this.redisService.srem(`user-sessions:${authInfo.userId}`, sessionId);
        continue;
      }
      sessions.push({
        sessionId,
        ip: record.ip,
        userAgent: record.userAgent,
        createdAt: record.createdAt,
        lastUsedAt: record.lastUsedAt,
        current: sessionId === currentSessionId,
      });
    }

    return sessions.sort(
      (a, b) => new Date(b.lastUsedAt).getTime() - new Date(a.lastUsedAt).getTime(),
    );
  }

  /**
   * Revoca una sessione "dispositivo" dell'utente autenticato (`DELETE auth/sessions/:sessionId`):
   * invalida sia il refresh token opaco sia l'access token correnti della sessione, così
   * il dispositivo non può più né operare né rinnovare il proprio token.
   * @throws {NotFoundException} Sessione inesistente o non appartenente all'utente (nessuna
   * distinzione nel messaggio tra i due casi, per non rivelare l'esistenza di sessioni altrui).
   */
  async revokeSession(
    authInfo: AuthInfo,
    sessionId: string,
    ip?: string,
  ): Promise<{ success: boolean }> {
    const record = await this.redisService.getJson<SessionRecord>(`session:${sessionId}`);
    if (!record || record.userId !== authInfo.userId) {
      throw new NotFoundException('Sessione non trovata.');
    }

    await this.destroySession(sessionId, undefined, record);

    await this.auditLogService.log(
      authInfo.userId,
      'session.revoke',
      undefined,
      undefined,
      undefined,
      authInfo.impersonatedBy,
      ip,
    );
    this.logger.log(`Sessione ${sessionId} revocata dall'utente ${authInfo.userId}.`);
    return { success: true };
  }

  /**
   * Rimuove tutte le tracce Redis di una sessione "dispositivo": `session:${sessionId}`,
   * l'appartenenza all'indice `user-sessions:${userId}`, il `rtk:${refreshToken}` corrente
   * e — se diverso da quello già cancellato dal chiamante — il `login:${accessToken}` corrente.
   * @param skipLoginKey Chiave `login:${token}` già invalidata dal chiamante, da non ri-cancellare inutilmente.
   * @param knownRecord Record già letto dal chiamante, per evitare una lettura Redis ridondante.
   */
  private async destroySession(
    sessionId: string,
    skipLoginKey?: string,
    knownRecord?: SessionRecord,
  ): Promise<void> {
    const record =
      knownRecord ?? (await this.redisService.getJson<SessionRecord>(`session:${sessionId}`));
    if (!record) return;

    await this.redisService.del(`session:${sessionId}`);
    await this.redisService.srem(`user-sessions:${record.userId}`, sessionId);
    await this.redisService.del(`rtk:${record.refreshToken}`);

    const loginKey = `login:${record.accessToken}`;
    if (loginKey !== skipLoginKey) {
      await this.redisService.del(loginKey);
    }
  }

  /**
   * Reinvia l'email di attivazione a un utente non ancora attivo (Admin+).
   * Riusa `ForgotPasswordDto` (stessa forma `{ email }`): nessun DTO dedicato nel contratto.
   * @throws {NotFoundException} Utente non trovato.
   * @throws {BadRequestException} Account già attivo.
   */
  async requestActivation(
    dto: ForgotPasswordDto,
    authInfo: AuthInfo,
  ): Promise<{ success: boolean }> {
    const user = await this.db.db.query.userEntity.findFirst({
      where: eq(userEntity.email, dto.email),
    });

    if (!user) {
      this.logger.warn(
        `Richiesta attivazione per email non trovata: ${dto.email}, eseguita da ${authInfo.userId}.`,
      );
      throw new NotFoundException('Utente non trovato.');
    }

    if (user.pwdSet) {
      this.logger.warn(
        `Richiesta attivazione per account già attivo: ${dto.email}, eseguita da ${authInfo.userId}.`,
      );
      throw new BadRequestException("L'account è già attivo.");
    }

    await this.issueActionToken(user, ACTIVATION_TOKEN_HOURS, authInfo.userId);
    this.logger.log(`Email di attivazione (re)inviata a ${user.email} da ${authInfo.userId}.`);
    return { success: true };
  }

  /**
   * Attiva l'account con il token ricevuto via email e imposta la password iniziale.
   * @throws {UnauthorizedException} Token non valido o scaduto.
   * @throws {BadRequestException} Password non conforme alla policy.
   */
  async activate(dto: ActivateAccountDto): Promise<{ success: boolean }> {
    const user = await this.findByValidActionToken(dto.token);
    if (!user) {
      this.logger.warn(`Tentativo di attivazione con token non valido o scaduto: ${dto.token}.`);
      throw new UnauthorizedException('Token di attivazione non valido o scaduto.');
    }

    const strength = validatePasswordStrength(dto.password);
    if (!strength.valid) {
      throw new BadRequestException(strength.reasons.join(' '));
    }

    await this.db.db
      .update(userEntity)
      .set({
        pwd: await Utils.hashPassword(dto.password),
        pwdSet: true,
        actionToken: null,
        actionTokenExpiresAt: null,
        updatedAt: new Date(),
      })
      .where(eq(userEntity.id, user.id));

    this.logger.log(`Account attivato per utente ${user.email}.`);
    return { success: true };
  }

  /**
   * Invia l'email di recupero password. Risposta sempre generica per
   * prevenire l'enumerazione degli utenti, indipendentemente dall'esistenza dell'email.
   */
  async forgotPassword(dto: ForgotPasswordDto): Promise<{ success: boolean }> {
    const user = await this.db.db.query.userEntity.findFirst({
      where: eq(userEntity.email, dto.email),
    });

    if (user) {
      await this.issueActionToken(user, RESET_TOKEN_HOURS, undefined, true);
      this.logger.log(`Email di recupero password inviata a ${user.email}.`);
    } else {
      this.logger.warn(
        `Richiesta recupero password per email non trovata: ${dto.email}. Risposta generica.`,
      );
    }

    return { success: true };
  }

  /**
   * Reimposta la password con il token ricevuto via email di recupero.
   * @throws {UnauthorizedException} Token non valido o scaduto.
   * @throws {BadRequestException} Password non conforme alla policy.
   */
  async resetPassword(dto: ResetPasswordDto): Promise<{ success: boolean }> {
    const user = await this.findByValidActionToken(dto.token);
    if (!user) {
      this.logger.warn(`Tentativo di reset password con token non valido o scaduto: ${dto.token}.`);
      throw new UnauthorizedException('Token di reimpostazione non valido o scaduto.');
    }

    const strength = validatePasswordStrength(dto.password);
    if (!strength.valid) {
      throw new BadRequestException(strength.reasons.join(' '));
    }

    await this.db.db
      .update(userEntity)
      .set({
        pwd: await Utils.hashPassword(dto.password),
        pwdSet: true,
        actionToken: null,
        actionTokenExpiresAt: null,
        updatedAt: new Date(),
      })
      .where(eq(userEntity.id, user.id));

    this.logger.log(`Password reimpostata per utente ${user.email}.`);
    return { success: true };
  }

  /** Recupera i dati dell'utente autenticato per `GET /auth/me`, arricchiti con i campi letti dal DB. */
  async getMe(authInfo: AuthInfo): Promise<MeResponse> {
    const user = await this.db.db.query.userEntity.findFirst({
      where: eq(userEntity.id, authInfo.userId),
    });
    if (!user) {
      this.logger.warn(`getMe: utente ${authInfo.userId} non trovato.`);
      throw new UnauthorizedException('Utente non trovato.');
    }

    return {
      ...authInfo,
      guid: user.guid,
      surname: user.surname,
      email: user.email,
      isMfaEnabled: user.isMfaEnabled,
    };
  }

  /** Aggiorna nome/cognome dell'utente autenticato (self-service, `PATCH /auth/me`). */
  async updateProfile(
    authInfo: AuthInfo,
    dto: UpdateProfileDto,
  ): Promise<{ name: string; surname: string | null }> {
    const user = await this.db.db.query.userEntity.findFirst({
      where: eq(userEntity.id, authInfo.userId),
    });
    if (!user) {
      throw new UnauthorizedException('Utente non trovato.');
    }

    await this.db.db
      .update(userEntity)
      .set({
        name: dto.name,
        surname: dto.surname ?? null,
        updatedAt: new Date(),
        updatedBy: authInfo.userId,
      })
      .where(eq(userEntity.id, user.id));

    this.logger.log(`Dati anagrafici aggiornati dall'utente ${user.email}.`);
    return { name: dto.name, surname: dto.surname ?? null };
  }

  /**
   * Cambia la password dell'utente autenticato, richiedendo la password attuale come conferma.
   * @throws {UnauthorizedException} Password attuale errata.
   * @throws {BadRequestException} Nuova password non conforme alla policy.
   */
  async changePassword(authInfo: AuthInfo, dto: ChangePasswordDto): Promise<{ success: boolean }> {
    const user = await this.db.db.query.userEntity.findFirst({
      where: eq(userEntity.id, authInfo.userId),
    });
    if (!user) {
      throw new UnauthorizedException('Utente non trovato.');
    }

    const valid = await Utils.verifyPassword(dto.currentPassword, user.pwd);
    if (!valid) {
      this.logger.warn(`changePassword: password attuale errata per utente ${user.id}.`);
      throw new UnauthorizedException('La password attuale non è corretta.');
    }

    const strength = validatePasswordStrength(dto.newPassword);
    if (!strength.valid) {
      throw new BadRequestException(strength.reasons.join(' '));
    }

    await this.db.db
      .update(userEntity)
      .set({
        pwd: await Utils.hashPassword(dto.newPassword),
        updatedAt: new Date(),
        updatedBy: authInfo.userId,
      })
      .where(eq(userEntity.id, user.id));

    this.logger.log(`Password cambiata dall'utente ${user.email} dalla pagina profilo.`);
    return { success: true };
  }

  /** Genera secret e QR code TOTP per l'avvio della configurazione MFA (non persiste ancora). */
  async mfaSetup(authInfo: AuthInfo): Promise<{ secret: string; qrCodeDataUrl: string }> {
    const user = await this.db.db.query.userEntity.findFirst({
      where: eq(userEntity.id, authInfo.userId),
    });
    if (!user) {
      throw new UnauthorizedException('Utente non trovato.');
    }

    const secret = authenticator.generateSecret();
    const otpauthUrl = authenticator.keyuri(user.email, 'Starter Kit', secret);
    const qrCodeDataUrl = await qrcode.toDataURL(otpauthUrl);

    // Il secret non è ancora persistito su totpSecret: resta in attesa in Redis finché
    // l'utente non conferma con un codice valido su /auth/mfa-enable (che riceve solo `code`).
    await this.redisService.set(`mfa_setup:${authInfo.userId}`, { secret }, MFA_TMP_TTL_SECONDS);

    this.logger.log(`Setup MFA avviato per utente ${authInfo.userId}.`);
    return { secret, qrCodeDataUrl };
  }

  /**
   * Abilita la MFA verificando il codice contro il secret generato da `mfaSetup`.
   * @throws {BadRequestException} MFA già abilitata, setup scaduto o codice non valido.
   */
  async mfaEnable(authInfo: AuthInfo, code: string): Promise<{ success: boolean }> {
    const user = await this.db.db.query.userEntity.findFirst({
      where: eq(userEntity.id, authInfo.userId),
    });
    if (!user) {
      throw new UnauthorizedException('Utente non trovato.');
    }

    if (user.isMfaEnabled) {
      throw new BadRequestException('MFA già abilitata.');
    }

    const pending = await this.redisService.getJson<{ secret: string }>(
      `mfa_setup:${authInfo.userId}`,
    );
    if (!pending) {
      throw new BadRequestException('Setup MFA scaduto: richiedi un nuovo QR code.');
    }

    const isValid = authenticator.verify({ token: code, secret: pending.secret });
    if (!isValid) {
      throw new BadRequestException('Codice MFA non valido.');
    }

    await this.db.db
      .update(userEntity)
      .set({
        isMfaEnabled: true,
        totpSecret: pending.secret,
        updatedAt: new Date(),
        updatedBy: authInfo.userId,
      })
      .where(eq(userEntity.id, authInfo.userId));

    await this.redisService.del(`mfa_setup:${authInfo.userId}`);
    this.logger.log(`MFA abilitata per utente ${authInfo.userId}.`);
    return { success: true };
  }

  /**
   * Disabilita la MFA, richiedendo un codice TOTP valido come conferma.
   * @throws {BadRequestException} MFA non abilitata o codice non valido.
   */
  async mfaDisable(authInfo: AuthInfo, code: string): Promise<{ success: boolean }> {
    const user = await this.db.db.query.userEntity.findFirst({
      where: eq(userEntity.id, authInfo.userId),
    });
    if (!user) {
      throw new UnauthorizedException('Utente non trovato.');
    }

    if (!user.isMfaEnabled || !user.totpSecret) {
      throw new BadRequestException('MFA non abilitata.');
    }

    const isValid = authenticator.verify({ token: code, secret: user.totpSecret });
    if (!isValid) {
      throw new BadRequestException('Codice MFA non valido.');
    }

    await this.db.db
      .update(userEntity)
      .set({
        isMfaEnabled: false,
        totpSecret: null,
        updatedAt: new Date(),
        updatedBy: authInfo.userId,
      })
      .where(eq(userEntity.id, authInfo.userId));

    this.logger.log(`MFA disabilitata per utente ${authInfo.userId}.`);
    return { success: true };
  }

  /**
   * Avvia una sessione di impersonificazione (SuperAdmin only): genera un access token
   * per l'utente target con claim `impersonatedBy`, senza generare un nuovo refresh
   * token (la sessione/cookie `rtk` del SuperAdmin reale resta invariata e ripristinabile
   * da {@link endImpersonation}).
   * @throws {NotFoundException} Utente target non trovato.
   * @throws {ForbiddenException} Target SuperAdmin o disabilitato.
   */
  async impersonate(
    targetGuid: string,
    authInfo: AuthInfo,
    ip?: string,
  ): Promise<AuthTokensResponse> {
    const target = await this.db.db.query.userEntity.findFirst({
      where: eq(userEntity.guid, targetGuid),
    });

    if (!target) {
      throw new NotFoundException('Utente non trovato.');
    }

    if (target.role === AppUserRoles.SuperAdmin) {
      this.logger.warn(
        `Tentativo di impersonificazione di un SuperAdmin (target ${target.id}) da ${authInfo.userId}.`,
      );
      throw new ForbiddenException('Non è possibile impersonare un altro SuperAdmin.');
    }

    if (!target.isActive) {
      throw new ForbiddenException('Impossibile impersonare un utente disabilitato.');
    }

    const tokens = await this.generateAuthTokens(target, authInfo.userId);
    await this.auditLogService.log(
      target.id,
      'impersonation.start',
      'user',
      target.guid,
      undefined,
      authInfo.userId,
      ip,
    );
    this.logger.log(
      `SuperAdmin ${authInfo.userId} ha iniziato l'impersonificazione dell'utente ${target.id}.`,
    );
    return tokens;
  }

  /**
   * Termina l'impersonificazione corrente e riemette token normali (con refresh) per il SuperAdmin originale.
   * @throws {BadRequestException} Nessuna impersonificazione in corso.
   * @throws {UnauthorizedException} SuperAdmin originale non più valido.
   */
  async endImpersonation(authInfo: AuthInfo, ip?: string): Promise<AuthTokensResponse> {
    if (!authInfo.impersonatedBy) {
      throw new BadRequestException('Nessuna impersonificazione in corso.');
    }

    const superAdmin = await this.db.db.query.userEntity.findFirst({
      where: eq(userEntity.id, authInfo.impersonatedBy),
    });
    if (!superAdmin || !superAdmin.isActive || superAdmin.role !== AppUserRoles.SuperAdmin) {
      this.logger.error(
        `Impossibile terminare l'impersonificazione: SuperAdmin originale ${authInfo.impersonatedBy} non valido.`,
      );
      throw new UnauthorizedException('Sessione non valida.');
    }

    const tokens = await this.generateAuthTokens(superAdmin);
    await this.auditLogService.log(
      authInfo.userId,
      'impersonation.end',
      'user',
      superAdmin.guid,
      undefined,
      authInfo.impersonatedBy,
      ip,
    );
    this.logger.log(
      `Impersonificazione terminata: SuperAdmin ${authInfo.impersonatedBy} torna alla propria sessione.`,
    );
    return tokens;
  }

  /**
   * Genera un token azione (attivazione o reset password), lo persiste sull'utente
   * e accoda l'email corrispondente sulla coda BullMQ.
   */
  private async issueActionToken(
    user: typeof userEntity.$inferSelect,
    hoursValid: number,
    updatedBy?: number,
    isReset = false,
  ): Promise<void> {
    const actionToken = Utils.randomString(64);
    const actionTokenExpiresAt = new Date();
    actionTokenExpiresAt.setHours(actionTokenExpiresAt.getHours() + hoursValid);

    await this.db.db
      .update(userEntity)
      .set({
        actionToken,
        actionTokenExpiresAt,
        updatedAt: new Date(),
        ...(updatedBy ? { updatedBy } : {}),
      })
      .where(eq(userEntity.id, user.id));

    const recipientName = user.name || user.email;
    const html = isReset
      ? buildPasswordResetEmailHtml({
          recipientName,
          resetUrl: `${AppConstants.frontendUrl}/reset-password?token=${actionToken}`,
        })
      : buildActivationEmailHtml({
          recipientName,
          activationUrl: `${AppConstants.frontendUrl}/activate?token=${actionToken}`,
        });

    await this.emailQueue.enqueueEmail({
      to: user.email,
      subject: isReset ? 'Reimposta la tua password' : 'Attiva il tuo account',
      html,
    });
  }

  /** Trova un utente per `actionToken` valido (esistente e non scaduto), o `undefined`. */
  private async findByValidActionToken(
    token: string,
  ): Promise<typeof userEntity.$inferSelect | undefined> {
    const user = await this.db.db.query.userEntity.findFirst({
      where: and(eq(userEntity.actionToken, token)),
    });
    if (!user || !user.actionTokenExpiresAt || user.actionTokenExpiresAt < new Date()) {
      return undefined;
    }
    return user;
  }

  /**
   * Genera l'access token JWT e, salvo impersonificazione, un nuovo refresh token opaco.
   * Salva l'allowlist di sessione `login:${token}` su Redis con TTL derivato da `AppConstants.jwtExpiration`.
   * Traccia inoltre la sessione "dispositivo" (`session:${sessionId}`, vedi {@link upsertSession}):
   * assente durante l'impersonificazione, dove non ha senso di dominio (nessun refresh token,
   * sessione limitata a 15min, già tracciata separatamente in audit log).
   * @param impersonatedBy Id del SuperAdmin reale se questo token è di impersonificazione: in tal caso
   * non viene generato alcun refresh token, per non alterare la sessione del SuperAdmin reale.
   * @param sessionContext Ip/user-agent della richiesta corrente; `sessionId` da riusare se questo
   * token nasce da un refresh (stesso dispositivo), omesso per un login ex-novo (nuovo sessionId).
   */
  private async generateAuthTokens(
    user: typeof userEntity.$inferSelect,
    impersonatedBy?: number,
    sessionContext?: SessionContext,
  ): Promise<AuthTokensResponse> {
    const sessionId = impersonatedBy
      ? undefined
      : (sessionContext?.sessionId ?? Utils.randomString(16));

    const payload: JwtPayload = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role as AppUserRoles,
      scopeId: user.scopeId,
      // jti random: rende ogni JWT univoco anche a parità di secondo per lo stesso utente,
      // evitando che due sessioni ravvicinate condividano la stessa chiave Redis `login:${token}`.
      jti: Utils.randomString(16),
      ...(impersonatedBy ? { impersonatedBy } : {}),
    };

    const token = jwt.sign(payload, AppConstants.securityKey, {
      // jwtExpiration arriva da env come stringa generica; jsonwebtoken richiede il literal
      // type StringValue di 'ms' (es. '15m', '8h'), non verificabile staticamente.
      expiresIn: AppConstants.jwtExpiration as StringValue,
    });

    const sessionTtlSeconds = Utils.parseDurationToSeconds(AppConstants.jwtExpiration);
    const allowlistEntry: LoginAllowlistEntry = {
      id: user.id,
      role: user.role as AppUserRoles,
      name: user.name,
      scopeId: user.scopeId,
      ...(sessionId ? { sessionId } : {}),
    };
    await this.redisService.set(`login:${token}`, allowlistEntry, sessionTtlSeconds);

    const userSummary: AuthUserSummary = {
      id: user.id,
      guid: user.guid,
      name: user.name,
      surname: user.surname,
      email: user.email,
      role: user.role as AppUserRoles,
      scopeId: user.scopeId,
    };

    if (impersonatedBy) {
      this.logger.log(
        `Token di impersonificazione generato per utente ${user.id} (SuperAdmin reale: ${impersonatedBy}).`,
      );
      return { accessToken: token, user: userSummary };
    }

    const refreshToken = Utils.randomString(64);
    await this.redisService.set(
      `rtk:${refreshToken}`,
      { userId: user.id, oldToken: token, sessionId },
      AppConstants.rtkExpiration,
    );

    await this.upsertSession(sessionId as string, user.id, refreshToken, token, sessionContext);

    this.logger.log(
      `Utente ${user.id} autenticato. Access token e refresh token salvati in Redis.`,
    );
    return { accessToken: token, refreshToken, user: userSummary };
  }

  /**
   * Crea o aggiorna il record `session:${sessionId}` che rappresenta un "dispositivo" per
   * la pagina Profilo (`GET/DELETE auth/sessions`). Preserva `createdAt` del primo login se la
   * sessione esiste già (refresh), aggiornando sempre `lastUsedAt`/token correnti; ip/user-agent
   * vengono aggiornati solo se forniti dal chiamante (altrimenti restano quelli già noti).
   * TTL allineato a `rtkExpiration`: la sessione scade naturalmente insieme al refresh token.
   */
  private async upsertSession(
    sessionId: string,
    userId: number,
    refreshToken: string,
    accessToken: string,
    sessionContext?: SessionContext,
  ): Promise<void> {
    const existing = await this.redisService.getJson<SessionRecord>(`session:${sessionId}`);
    const now = new Date().toISOString();

    const record: SessionRecord = {
      userId,
      ip: sessionContext?.ip ?? existing?.ip ?? null,
      userAgent: sessionContext?.userAgent ?? existing?.userAgent ?? null,
      createdAt: existing?.createdAt ?? now,
      lastUsedAt: now,
      refreshToken,
      accessToken,
    };

    await this.redisService.set(`session:${sessionId}`, record, AppConstants.rtkExpiration);
    await this.redisService.sadd(`user-sessions:${userId}`, sessionId);
    await this.redisService.expire(`user-sessions:${userId}`, AppConstants.rtkExpiration);
  }
}
