import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import * as jwt from 'jsonwebtoken';
import { AppConstants } from '../common/app-constants';
import { AuthInfo } from '../common/types';
import { RedisService } from '../redis/redis.service';

/** Sottoinsieme del payload JWT necessario a popolare `req.authInfo`. */
interface JwtPayload {
  id: number;
  role: number;
  name: string;
  scopeId: string | null;
  /** Presente solo nei JWT di impersonificazione: id del SuperAdmin reale. */
  impersonatedBy?: number;
}

/**
 * Middleware globale di autenticazione JWT (CLAUDE.md, Security Policy).
 * Verifica la presenza e la validità dell'access token nell'header
 * `Authorization: Bearer`, la sessione attiva su Redis (`login:${token}`,
 * l'allowlist di sessione) e la presenza del cookie firmato `rtk`. Se tutto
 * è valido, popola `req.authInfo` con i dati dell'utente, disponibile in
 * tutti i controller a valle. Le route pubbliche (`/auth/login`, ecc.)
 * sono escluse in `AuthModule.configure`.
 */
@Injectable()
export class AuthMiddleware implements NestMiddleware {
  /** Inietta il servizio Redis usato per verificare l'allowlist di sessione. */
  constructor(private readonly redisService: RedisService) {}

  /** Verifica JWT + allowlist Redis + cookie rtk e popola `req.authInfo`. */
  async use(req: Request, res: Response, next: NextFunction): Promise<void> {
    const auth = req.headers['authorization'];
    const rtk = req.signedCookies?.rtk;

    if (!auth?.startsWith('Bearer ')) {
      res.status(401).json({ message: 'Non autorizzato', code: 'UNAUTHORIZED' });
      return;
    }

    if (!rtk) {
      res.status(401).json({ message: 'Refresh token assente', code: 'RTK_MISSING' });
      return;
    }

    const token = auth.split(' ')[1];

    try {
      const payload = jwt.verify(token, AppConstants.securityKey) as JwtPayload;
      const session = await this.redisService.get(`login:${token}`);

      if (!session) {
        res.status(401).json({ message: 'Sessione scaduta', code: 'SESSION_EXPIRED' });
        return;
      }

      // Popola req.authInfo — disponibile in tutti i controller. Se il JWT è una
      // sessione di impersonificazione, authInfo riflette l'utente impersonato
      // (autore formale delle azioni) più impersonatedBy (SuperAdmin reale),
      // così l'AuditLogService può registrare entrambe le identità.
      req['authInfo'] = {
        userId: payload.id,
        role: payload.role,
        name: payload.name,
        scopeId: payload.scopeId,
        ...(payload.impersonatedBy ? { impersonatedBy: payload.impersonatedBy } : {}),
      } as AuthInfo;

      next();
    } catch {
      res.status(401).json({ message: 'Token non valido', code: 'INVALID_TOKEN' });
    }
  }
}
