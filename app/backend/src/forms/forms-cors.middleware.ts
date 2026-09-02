import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';

/**
 * CORS scoped alla sola rotta di submit dei Form (ADR-46 § 5, RFC-46 D5).
 * La policy globale (`main.ts`, `app.enableCors(...)`) resta invariata:
 * allowlist fissa `[frontendUrl, publicSiteUrl]` + host di sviluppo,
 * `credentials: true` per i cookie di sessione admin. Un sito esportato
 * staticamente (ADR-45) può girare su un dominio non noto al deploy del
 * backend: solo questa rotta pubblica e anonima apre `Access-Control-Allow-Origin: *`,
 * **mai** `Access-Control-Allow-Credentials` (nessun cookie httpOnly di
 * sessione attraversa questa rotta — un wildcard con credenziali sarebbe
 * comunque respinto dai browser per specifica, ma va dichiarato per iscritto
 * che non si tenta, RFC-46 D5). Montato in `AppModule.configure()` **solo**
 * su `public/forms/:formId/submit`, mai globalmente.
 */
@Injectable()
export class FormsCorsMiddleware implements NestMiddleware {
  /** Imposta l'header CORS aperto solo per questa richiesta, mai le credenziali. */
  use(req: Request, res: Response, next: NextFunction): void {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }

    next();
  }
}
