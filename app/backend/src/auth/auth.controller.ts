import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { AppConstants } from '../common/app-constants';
import { AuthInfo, MeResponse } from '../common/types';
import {
  AuthService,
  AuthTokensResponse,
  MfaRequiredResponse,
  SessionSummary,
} from './auth.service';
import { LoginDto } from './dto/login.dto';
import { MfaVerifyDto } from './dto/mfa-verify.dto';
import { ActivateAccountDto } from './dto/activate-account.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { MfaEnableDto } from './dto/mfa-enable.dto';
import { MfaDisableDto } from './dto/mfa-disable.dto';
import { GuardAdmin, GuardSuperAdmin } from './guard';

@ApiTags('Auth')
@Controller('auth')
@UseGuards(ThrottlerGuard) // rate limiting di default (throttler 'auth', 20/60s) su tutte le rotte /auth/*
export class AuthController {
  /** Inietta il servizio applicativo di autenticazione. */
  constructor(private readonly authService: AuthService) {}

  /** Imposta il cookie httpOnly firmato `rtk` e rimuove il refresh token dal body della risposta. */
  private attachRefreshCookie(res: Response, authResponse: AuthTokensResponse): AuthTokensResponse {
    if (authResponse.refreshToken) {
      res.cookie('rtk', authResponse.refreshToken, {
        httpOnly: true,
        signed: true,
        secure: AppConstants.isProduction,
        sameSite: 'lax',
        maxAge: AppConstants.rtkExpiration * 1000,
        domain: AppConstants.cookieDomain,
        path: '/',
      });
      delete authResponse.refreshToken;
    }
    return authResponse;
  }

  /** Login utente e generazione token JWT (o richiesta MFA se abilitata). */
  @Post('login')
  @Throttle({ auth: { limit: 5, ttl: 60_000 } }) // anti brute-force credenziali
  @ApiOperation({ summary: 'Login utente e generazione token JWT' })
  @ApiResponse({ status: 200, description: 'Login avvenuto con successo, oppure richiesta MFA' })
  @ApiResponse({ status: 401, description: 'Credenziali errate o account non attivato' })
  @ApiResponse({ status: 429, description: 'Troppe richieste, riprovare più tardi' })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthTokensResponse | MfaRequiredResponse> {
    const authResponse = await this.authService.login(dto, req.ip, req.headers['user-agent']);
    if ('mfaRequired' in authResponse) {
      return authResponse;
    }
    return this.attachRefreshCookie(res, authResponse);
  }

  /** Verifica codice MFA per completare il login. */
  @Post('mfa-verify')
  @Throttle({ auth: { limit: 5, ttl: 60_000 } }) // anti brute-force codice MFA
  @ApiOperation({ summary: 'Verifica codice MFA per completare il login' })
  @ApiResponse({ status: 200, description: 'MFA verificato con successo' })
  @ApiResponse({ status: 401, description: 'Token temporaneo scaduto o codice MFA non valido' })
  @ApiResponse({ status: 429, description: 'Troppe richieste, riprovare più tardi' })
  async mfaVerify(
    @Body() dto: MfaVerifyDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthTokensResponse> {
    const authResponse = await this.authService.mfaVerify(
      dto.tmpToken,
      dto.code,
      req.ip,
      req.headers['user-agent'],
    );
    return this.attachRefreshCookie(res, authResponse);
  }

  /** Rinnova l'access token usando il refresh token opaco (cookie rtk), con rotation. */
  @Post('refresh')
  @ApiOperation({ summary: "Rinnova l'access token usando il refresh token opaco (cookie rtk)" })
  @ApiResponse({ status: 200, description: 'Nuovo access token generato' })
  @ApiResponse({ status: 401, description: 'Refresh token assente, non valido o scaduto' })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ accessToken: string }> {
    const rtk = req.signedCookies?.rtk;
    if (!rtk) {
      throw new UnauthorizedException('Refresh token assente.');
    }
    const authResponse = await this.authService.refresh(rtk, req.ip, req.headers['user-agent']);
    this.attachRefreshCookie(res, authResponse);
    return { accessToken: authResponse.accessToken };
  }

  /** Logout utente e invalidazione sessione. */
  @Post('logout')
  @ApiOperation({ summary: 'Logout utente e invalidazione sessione' })
  @ApiResponse({ status: 200, description: 'Logout avvenuto con successo' })
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ success: boolean }> {
    const token = req.headers['authorization']?.split(' ')[1];
    if (!token) {
      throw new UnauthorizedException('Token di autorizzazione assente.');
    }
    const authInfo = req['authInfo'] as AuthInfo;
    res.clearCookie('rtk', {
      domain: AppConstants.cookieDomain,
      path: '/',
      secure: AppConstants.isProduction,
      sameSite: 'lax',
    });
    return this.authService.logout(token, authInfo?.userId, req.ip);
  }

  /** Attiva un account utente tramite token e imposta la password. */
  @Post('activate')
  @Throttle({ auth: { limit: 5, ttl: 60_000 } }) // anti brute-force token di attivazione
  @ApiOperation({ summary: 'Attiva un account utente tramite token e imposta la password' })
  @ApiResponse({ status: 200, description: 'Account attivato e password impostata' })
  @ApiResponse({ status: 401, description: 'Token non valido o scaduto' })
  @ApiResponse({ status: 400, description: 'Password non conforme alla policy' })
  @ApiResponse({ status: 429, description: 'Troppe richieste, riprovare più tardi' })
  async activate(@Body() dto: ActivateAccountDto): Promise<{ success: boolean }> {
    return this.authService.activate(dto);
  }

  /** Richiede il recupero password inviando una email con token (risposta anti-enumerazione). */
  @Post('forgot-password')
  @Throttle({ auth: { limit: 5, ttl: 60_000 } }) // anti spam/enumerazione email
  @ApiOperation({ summary: 'Richiede il recupero password inviando una email con token' })
  @ApiResponse({
    status: 200,
    description: 'Richiesta elaborata (risposta generica per sicurezza)',
  })
  @ApiResponse({ status: 429, description: 'Troppe richieste, riprovare più tardi' })
  async forgotPassword(@Body() dto: ForgotPasswordDto): Promise<{ success: boolean }> {
    return this.authService.forgotPassword(dto);
  }

  /** Reimposta la password tramite token di recupero. */
  @Post('reset-password')
  @Throttle({ auth: { limit: 5, ttl: 60_000 } }) // anti brute-force token di recupero
  @ApiOperation({ summary: 'Reimposta la password tramite token di recupero' })
  @ApiResponse({ status: 200, description: 'Password reimpostata con successo' })
  @ApiResponse({ status: 401, description: 'Token non valido o scaduto' })
  @ApiResponse({ status: 400, description: 'Password non conforme alla policy' })
  @ApiResponse({ status: 429, description: 'Troppe richieste, riprovare più tardi' })
  async resetPassword(@Body() dto: ResetPasswordDto): Promise<{ success: boolean }> {
    return this.authService.resetPassword(dto);
  }

  /** Richiede o re-invia l'email di attivazione per un utente (Admin+). */
  @Post('request-activation')
  @UseGuards(GuardAdmin)
  @ApiOperation({ summary: "Richiede o re-invia l'email di attivazione per un utente (Admin+)" })
  @ApiResponse({ status: 200, description: 'Email di attivazione inviata con successo' })
  @ApiResponse({ status: 404, description: 'Utente non trovato' })
  @ApiResponse({ status: 400, description: 'Account già attivo' })
  async requestActivation(
    @Body() dto: ForgotPasswordDto,
    @Req() req: Request,
  ): Promise<{ success: boolean }> {
    const authInfo = req['authInfo'] as AuthInfo;
    return this.authService.requestActivation(dto, authInfo);
  }

  /** Recupera i dati dell'utente autenticato. */
  @Get('me')
  @ApiOperation({ summary: "Recupera i dati dell'utente autenticato" })
  @ApiResponse({ status: 200, description: 'Dati utente recuperati' })
  async getMe(@Req() req: Request): Promise<MeResponse> {
    const authInfo = req['authInfo'] as AuthInfo;
    return this.authService.getMe(authInfo);
  }

  /** Aggiorna nome e cognome dell'utente autenticato (pagina profilo). */
  @Patch('me')
  @ApiOperation({ summary: "Aggiorna nome e cognome dell'utente autenticato (pagina profilo)" })
  @ApiResponse({ status: 200, description: 'Dati anagrafici aggiornati con successo' })
  @ApiResponse({ status: 400, description: 'Nome o cognome non validi' })
  async updateProfile(
    @Body() dto: UpdateProfileDto,
    @Req() req: Request,
  ): Promise<{ name: string; surname: string | null }> {
    const authInfo = req['authInfo'] as AuthInfo;
    return this.authService.updateProfile(authInfo, dto);
  }

  /** Cambia la password dell'utente autenticato (pagina profilo). */
  @Patch('change-password')
  @ApiOperation({ summary: "Cambia la password dell'utente autenticato (pagina profilo)" })
  @ApiResponse({ status: 200, description: 'Password cambiata con successo' })
  @ApiResponse({ status: 401, description: 'Password attuale non corretta' })
  @ApiResponse({ status: 400, description: 'Nuova password non conforme alla policy' })
  async changePassword(
    @Body() dto: ChangePasswordDto,
    @Req() req: Request,
  ): Promise<{ success: boolean }> {
    const authInfo = req['authInfo'] as AuthInfo;
    return this.authService.changePassword(authInfo, dto);
  }

  /** Genera secret e QR code per la configurazione MFA (non persiste ancora). */
  @Post('mfa-setup')
  @ApiOperation({
    summary: 'Genera secret e QR code per la configurazione MFA (non persiste ancora)',
  })
  @ApiResponse({ status: 200, description: 'Secret e QR code generati' })
  async mfaSetup(@Req() req: Request): Promise<{ secret: string; qrCodeDataUrl: string }> {
    const authInfo = req['authInfo'] as AuthInfo;
    return this.authService.mfaSetup(authInfo);
  }

  /** Abilita la MFA per l'utente autenticato. */
  @Post('mfa-enable')
  @ApiOperation({ summary: "Abilita la MFA per l'utente autenticato" })
  @ApiResponse({ status: 200, description: 'MFA abilitata con successo' })
  @ApiResponse({ status: 400, description: 'MFA già abilitata, setup scaduto o codice non valido' })
  async mfaEnable(@Body() dto: MfaEnableDto, @Req() req: Request): Promise<{ success: boolean }> {
    const authInfo = req['authInfo'] as AuthInfo;
    return this.authService.mfaEnable(authInfo, dto.code);
  }

  /** Disabilita la MFA per l'utente autenticato. */
  @Post('mfa-disable')
  @ApiOperation({ summary: "Disabilita la MFA per l'utente autenticato" })
  @ApiResponse({ status: 200, description: 'MFA disabilitata con successo' })
  @ApiResponse({ status: 400, description: 'MFA non abilitata o codice non valido' })
  async mfaDisable(@Body() dto: MfaDisableDto, @Req() req: Request): Promise<{ success: boolean }> {
    const authInfo = req['authInfo'] as AuthInfo;
    return this.authService.mfaDisable(authInfo, dto.code);
  }

  /** Elenca le sessioni/dispositivi attivi dell'utente autenticato (pagina profilo). */
  @Get('sessions')
  @ApiOperation({ summary: "Elenca le sessioni/dispositivi attivi dell'utente autenticato" })
  @ApiResponse({ status: 200, description: 'Elenco sessioni attive' })
  async getSessions(@Req() req: Request): Promise<SessionSummary[]> {
    const authInfo = req['authInfo'] as AuthInfo;
    const token = req.headers['authorization']?.split(' ')[1];
    return this.authService.getActiveSessions(authInfo, token);
  }

  /** Revoca una sessione/dispositivo dell'utente autenticato (pagina profilo). */
  @Delete('sessions/:sessionId')
  @ApiParam({ name: 'sessionId', description: 'Identificativo opaco della sessione (16 char hex)' })
  @ApiOperation({ summary: "Revoca una sessione/dispositivo dell'utente autenticato" })
  @ApiResponse({ status: 200, description: 'Sessione revocata con successo' })
  @ApiResponse({ status: 404, description: "Sessione non trovata o non appartenente all'utente" })
  async revokeSession(
    @Param('sessionId') sessionId: string,
    @Req() req: Request,
  ): Promise<{ success: boolean }> {
    const authInfo = req['authInfo'] as AuthInfo;
    return this.authService.revokeSession(authInfo, sessionId, req.ip);
  }

  /** Avvia l'impersonificazione di un utente (SuperAdmin only), senza toccare la sessione originale. */
  @Post('impersonate/:guid')
  @UseGuards(GuardSuperAdmin)
  @ApiParam({ name: 'guid', description: "Guid pubblico (16 char) dell'utente da impersonare" })
  @ApiOperation({ summary: "Avvia l'impersonificazione di un utente (SuperAdmin only)" })
  @ApiResponse({ status: 200, description: 'Access token di impersonificazione generato' })
  @ApiResponse({
    status: 403,
    description: 'Permessi insufficienti o target è un SuperAdmin/utente disabilitato',
  })
  @ApiResponse({ status: 404, description: 'Utente target non trovato' })
  async impersonate(@Param('guid') guid: string, @Req() req: Request): Promise<AuthTokensResponse> {
    const authInfo = req['authInfo'] as AuthInfo;
    return this.authService.impersonate(guid, authInfo, req.ip);
  }

  /** Termina l'impersonificazione corrente e ripristina la sessione del SuperAdmin originale. */
  @Post('end-impersonation')
  @ApiOperation({
    summary:
      "Termina l'impersonificazione corrente e ripristina la sessione del SuperAdmin originale",
  })
  @ApiResponse({ status: 200, description: 'Sessione del SuperAdmin originale ripristinata' })
  @ApiResponse({ status: 400, description: 'Nessuna impersonificazione in corso' })
  @ApiResponse({ status: 401, description: 'Sessione del SuperAdmin originale non più valida' })
  async endImpersonation(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthTokensResponse> {
    const authInfo = req['authInfo'] as AuthInfo;
    const authResponse = await this.authService.endImpersonation(authInfo, req.ip);
    return this.attachRefreshCookie(res, authResponse);
  }
}
