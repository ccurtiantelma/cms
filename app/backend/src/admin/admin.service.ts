import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, count, desc, eq, gte, ilike, lte, ne, or, SQL, sql } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { SeedService } from './seed.service';
import * as schema from '../db/schema';
import { auditLogEntity, userEntity } from '../db/schema';
import { AppUserRoles } from '../common/enums';
import { AuditLogQueryParams, AuthInfo, PaginationParams } from '../common/types';
import { Pagination } from '../common/pagination';
import { Utils } from '../common/utils';
import { AuditLogService } from '../common/audit-log.service';
import { EmailQueueService } from '../queues/email-queue/email.queue.service';
import { buildActivationEmailHtml } from '../mailer/templates';
import { AppConstants } from '../common/app-constants';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

/** Colonne escluse dalle risposte utente: mai esporre hash password, secret MFA o token azione. */
const SENSITIVE_USER_COLUMNS = {
  pwd: false,
  actionToken: false,
  actionTokenExpiresAt: false,
  totpSecret: false,
  totpQrCode: false,
} as const;

type SafeUser = Omit<typeof userEntity.$inferSelect, keyof typeof SENSITIVE_USER_COLUMNS>;

/** Colonne ammesse per l'ordinamento via query string `o=`. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- union di colonne Drizzle con tipi PG eterogenei
const ORDERABLE_USER_COLUMNS: Record<string, any> = {
  name: userEntity.name,
  surname: userEntity.surname,
  email: userEntity.email,
  role: userEntity.role,
  createdAt: userEntity.createdAt,
};

/** Durata di validità (ore) del token di attivazione inviato alla creazione utente. */
const ACTIVATION_TOKEN_HOURS = 48;

/**
 * Service amministrativo: gestione utenti, audit log (Admin+) e dati demo (SuperAdmin only).
 */
@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  /** Inietta i servizi per accesso al DB, seed dati demo, invio email e audit log. */
  constructor(
    private readonly db: DbService,
    private readonly seedService: SeedService,
    private readonly emailQueue: EmailQueueService,
    private readonly auditLogService: AuditLogService,
  ) {}

  // ─── Sistema (SuperAdmin only) ───────────────────────────────────────────

  /** Carica i dati demo richiamando la stessa logica usata da `npm run seed`. */
  async seedDemo(authInfo: AuthInfo, ip?: string): Promise<Record<string, number>> {
    this.logger.log('Avvio caricamento dati demo da endpoint admin.');
    const summary = await this.seedService.run();
    await this.auditLogService.log(
      authInfo.userId,
      'system.seed-demo',
      'system',
      undefined,
      summary,
      authInfo.impersonatedBy,
      ip,
    );
    return summary;
  }

  /**
   * Cancella tutti gli eventi di audit log e tutti gli utenti tranne il SuperAdmin,
   * in un'unica transazione FK-safe (l'audit log referenzia `users`, va cancellato per primo).
   * Azione irreversibile, SuperAdmin only.
   */
  async resetDemo(authInfo: AuthInfo, ip?: string): Promise<Record<string, number>> {
    this.logger.warn('Avvio reset completo dei dati demo (azione irreversibile).');
    const summary: Record<string, number> = {};

    await this.db.db.transaction(async (tx) => {
      const auditRes = await tx.delete(schema.auditLogEntity);
      summary.auditLog = auditRes.rowCount ?? 0;

      const usersRes = await tx
        .delete(schema.userEntity)
        .where(sql`${schema.userEntity.role} != ${AppUserRoles.SuperAdmin}`);
      summary.users = usersRes.rowCount ?? 0;
    });

    this.logger.warn(`Reset demo completato: ${JSON.stringify(summary)}`);
    await this.auditLogService.log(
      authInfo.userId,
      'system.reset-demo',
      'system',
      undefined,
      summary,
      authInfo.impersonatedBy,
      ip,
    );
    return summary;
  }

  // ─── Gestione utenti (Admin+) ────────────────────────────────────────────

  /**
   * Verifica che il chiamante possa vedere/gestire un utente con il ruolo indicato.
   * Regola critica: un Admin (non SuperAdmin) non può vedere né gestire utenti SuperAdmin.
   */
  private assertTargetRoleManageable(targetRole: number, authInfo: AuthInfo): void {
    if (targetRole <= AppUserRoles.SuperAdmin && authInfo.role > AppUserRoles.SuperAdmin) {
      throw new ForbiddenException('Non puoi gestire utenti con ruolo SuperAdmin.');
    }
  }

  /**
   * Lista paginata degli utenti. Il SuperAdmin non è mai incluso: non è un utente
   * amministrabile da questa UI, nemmeno per il chiamante SuperAdmin stesso.
   * `Utils.applyScopeFilter` è comunque applicato per coerenza con CLAUDE.md, anche se
   * l'accesso è già ristretto a `GuardAdmin` (soglia pari a `elevatedThreshold` di default:
   * per i chiamanti che possono raggiungere questo endpoint, il filtro è sempre no-op).
   */
  async findAllUsers(authInfo: AuthInfo, params: PaginationParams): Promise<Pagination<SafeUser>> {
    const page = params.p && params.p > 0 ? params.p : 1;
    const perPage = params.i && params.i > 0 ? params.i : 20;

    const scope = Utils.applyScopeFilter(authInfo);
    const conditions: (SQL | undefined)[] = [ne(userEntity.role, AppUserRoles.SuperAdmin)];
    if (scope !== null) conditions.push(eq(userEntity.scopeId, scope));
    if (params.q) {
      conditions.push(
        or(
          ilike(userEntity.name, `%${params.q}%`),
          ilike(userEntity.surname, `%${params.q}%`),
          ilike(userEntity.email, `%${params.q}%`),
        ),
      );
    }
    const where = conditions.length ? and(...conditions) : undefined;

    const orderColumn = (params.o && ORDERABLE_USER_COLUMNS[params.o]) || userEntity.name;
    const orderBy = params.d === 'desc' ? desc(orderColumn) : asc(orderColumn);

    const [items, [{ total }]] = await Promise.all([
      this.db.db.query.userEntity.findMany({
        where,
        columns: SENSITIVE_USER_COLUMNS,
        orderBy,
        limit: perPage,
        offset: (page - 1) * perPage,
      }),
      this.db.db.select({ total: count() }).from(userEntity).where(where),
    ]);

    return new Pagination(items as SafeUser[], total, page, perPage);
  }

  /** Dettaglio di un utente. Lancia `ForbiddenException` se il target è SuperAdmin e il chiamante non lo è. */
  async findOneUser(guid: string, authInfo: AuthInfo): Promise<SafeUser> {
    const user = await this.db.db.query.userEntity.findFirst({
      where: eq(userEntity.guid, guid),
      columns: SENSITIVE_USER_COLUMNS,
    });
    if (!user) throw new NotFoundException('Utente non trovato.');

    this.assertTargetRoleManageable((user as SafeUser).role, authInfo);
    return user as SafeUser;
  }

  /**
   * Crea un nuovo utente: invia sempre l'email di attivazione (pwdSet=false),
   * l'utente imposta la password al primo accesso tramite il link ricevuto.
   * Regola critica: un Admin (non SuperAdmin) non può creare utenti SuperAdmin.
   */
  async createUser(dto: CreateUserDto, authInfo: AuthInfo, ip?: string): Promise<{ guid: string }> {
    this.assertTargetRoleManageable(dto.role, authInfo);

    const existing = await this.db.db.query.userEntity.findFirst({
      where: eq(userEntity.email, dto.email),
    });
    if (existing) {
      throw new BadRequestException('Esiste già un utente con questa email.');
    }

    // Password segnaposto non utilizzabile: l'utente la imposta tramite il link di attivazione.
    const pwd = await Utils.hashPassword(Utils.randomString(32));
    const actionToken = Utils.randomString(64);
    const actionTokenExpiresAt = new Date();
    actionTokenExpiresAt.setHours(actionTokenExpiresAt.getHours() + ACTIVATION_TOKEN_HOURS);

    const [user] = await this.db.db
      .insert(userEntity)
      .values({
        name: dto.name,
        surname: dto.surname ?? null,
        email: dto.email,
        pwd,
        role: dto.role,
        scopeId: dto.scopeId ?? null,
        pwdSet: false,
        actionToken,
        actionTokenExpiresAt,
        createdBy: authInfo.userId,
        updatedBy: authInfo.userId,
      })
      .returning({ id: userEntity.id, guid: userEntity.guid });

    await this.emailQueue.enqueueEmail({
      to: dto.email,
      subject: 'Attiva il tuo account',
      html: buildActivationEmailHtml({
        recipientName: dto.name,
        activationUrl: `${AppConstants.frontendUrl}/activate?token=${actionToken}`,
      }),
    });

    this.logger.log(`Utente ${user.id} creato da ${authInfo.userId}.`);
    await this.auditLogService.log(
      authInfo.userId,
      'user.create',
      'user',
      user.guid,
      { email: dto.email, role: dto.role },
      authInfo.impersonatedBy,
      ip,
    );
    return { guid: user.guid };
  }

  /**
   * Aggiorna i dati di un utente (nome, cognome, email, ruolo, scopeId).
   * Regola critica: un Admin (non SuperAdmin) non può vedere/aggiornare utenti SuperAdmin
   * né promuovere un utente a SuperAdmin.
   */
  async updateUser(
    guid: string,
    dto: UpdateUserDto,
    authInfo: AuthInfo,
    ip?: string,
  ): Promise<{ guid: string }> {
    const target = await this.db.db.query.userEntity.findFirst({
      where: eq(userEntity.guid, guid),
    });
    if (!target) throw new NotFoundException('Utente non trovato.');

    this.assertTargetRoleManageable(target.role, authInfo);
    if (dto.role !== undefined) {
      this.assertTargetRoleManageable(dto.role, authInfo);
    }

    if (dto.email && dto.email !== target.email) {
      const existing = await this.db.db.query.userEntity.findFirst({
        where: eq(userEntity.email, dto.email),
      });
      if (existing) throw new BadRequestException('Esiste già un utente con questa email.');
    }

    await this.db.db
      .update(userEntity)
      .set({
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.surname !== undefined && { surname: dto.surname }),
        ...(dto.email !== undefined && { email: dto.email }),
        ...(dto.role !== undefined && { role: dto.role }),
        ...(dto.scopeId !== undefined && { scopeId: dto.scopeId }),
        updatedAt: new Date(),
        updatedBy: authInfo.userId,
      })
      .where(eq(userEntity.id, target.id));

    this.logger.log(`Utente ${target.id} aggiornato da ${authInfo.userId}.`);
    await this.auditLogService.log(
      authInfo.userId,
      'user.update',
      'user',
      target.guid,
      { ...dto },
      authInfo.impersonatedBy,
      ip,
    );
    return { guid: target.guid };
  }

  /** Abilita/disabilita un utente (soft, senza eliminarlo) invertendo `isActive`. */
  async toggleActiveUser(
    guid: string,
    authInfo: AuthInfo,
    ip?: string,
  ): Promise<{ guid: string; isActive: boolean }> {
    const target = await this.db.db.query.userEntity.findFirst({
      where: eq(userEntity.guid, guid),
    });
    if (!target) throw new NotFoundException('Utente non trovato.');

    this.assertTargetRoleManageable(target.role, authInfo);

    const isActive = !target.isActive;
    await this.db.db
      .update(userEntity)
      .set({ isActive, updatedAt: new Date(), updatedBy: authInfo.userId })
      .where(eq(userEntity.id, target.id));

    this.logger.log(
      `Utente ${target.id} ${isActive ? 'riattivato' : 'disabilitato'} da ${authInfo.userId}.`,
    );
    await this.auditLogService.log(
      authInfo.userId,
      'user.toggle-active',
      'user',
      target.guid,
      { isActive },
      authInfo.impersonatedBy,
      ip,
    );
    return { guid: target.guid, isActive };
  }

  /** Resetta l'MFA di un utente: `isMfaEnabled=false`, `totpSecret=null`. Potrà ri-configurarla al prossimo login. */
  async resetMfaUser(guid: string, authInfo: AuthInfo, ip?: string): Promise<{ success: boolean }> {
    const target = await this.db.db.query.userEntity.findFirst({
      where: eq(userEntity.guid, guid),
    });
    if (!target) throw new NotFoundException('Utente non trovato.');

    this.assertTargetRoleManageable(target.role, authInfo);

    await this.db.db
      .update(userEntity)
      .set({
        isMfaEnabled: false,
        totpSecret: null,
        totpQrCode: null,
        updatedAt: new Date(),
        updatedBy: authInfo.userId,
      })
      .where(eq(userEntity.id, target.id));

    this.logger.log(`MFA resettata per utente ${target.id} da ${authInfo.userId}.`);
    await this.auditLogService.log(
      authInfo.userId,
      'user.reset-mfa',
      'user',
      target.guid,
      undefined,
      authInfo.impersonatedBy,
      ip,
    );
    return { success: true };
  }

  // ─── Audit log (Admin+, sola lettura) ────────────────────────────────────

  /** Lista paginata degli eventi di audit log, con filtri opzionali (`userId, action, from, to`). */
  async findAuditLog(
    params: AuditLogQueryParams,
  ): Promise<Pagination<typeof auditLogEntity.$inferSelect>> {
    const page = params.p && params.p > 0 ? params.p : 1;
    const perPage = params.i && params.i > 0 ? params.i : 20;

    const conditions: (SQL | undefined)[] = [];
    if (params.userId) conditions.push(eq(auditLogEntity.userId, params.userId));
    if (params.action) conditions.push(ilike(auditLogEntity.action, `%${params.action}%`));
    if (params.from) conditions.push(gte(auditLogEntity.createdAt, new Date(params.from)));
    if (params.to) conditions.push(lte(auditLogEntity.createdAt, new Date(params.to)));
    const where = conditions.length ? and(...conditions) : undefined;

    const [items, [{ total }]] = await Promise.all([
      this.db.db.query.auditLogEntity.findMany({
        where,
        orderBy: desc(auditLogEntity.createdAt),
        limit: perPage,
        offset: (page - 1) * perPage,
      }),
      this.db.db.select({ total: count() }).from(auditLogEntity).where(where),
    ]);

    return new Pagination(items, total, page, perPage);
  }
}
