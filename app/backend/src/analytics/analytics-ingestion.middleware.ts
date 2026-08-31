import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { AnalyticsService } from './analytics.service';
import { computeVisitorHash } from './visitor-hash.util';
import { parseUserAgent } from './user-agent-parser.util';
import { canonicalizePublicPath } from '../pages/public-path.util';

/**
 * Middleware di ingestion analytics, privacy-first e zero-cookie. Sostituisce
 * l'ex endpoint `POST analytics/ingest/pageview` protetto da secret: qui la
 * registrazione avviene direttamente sul traffico pubblico, montato in
 * `AppModule.configure()` su `public/*path` GET (in aggiunta a
 * `AuthMiddleware`, non al suo posto — mirror di `src/auth/auth.middleware.ts`
 * per shape/JSDoc).
 *
 * Registra una pageview solo per le richieste che portano un `?path=` (la
 * risoluzione di un contenuto pubblico, `PublicPagesController.getPage`) e
 * che si concludono con un 2xx: un redirect di canonicalizzazione (`308`) o
 * un contenuto non pubblicato/inesistente (`404`) non vengono mai contati
 * (CLAUDE.md § Security, "pubblico: nessuna info su contenuto non
 * pubblicato"). Le altre rotte pubbliche (Global Tokens, tema) non sono
 * fetch di pagina e non producono un evento.
 *
 * Non blocca mai la risposta: `next()` è chiamato subito, l'inserimento vero
 * e proprio avviene in modo asincrono dentro `res.on('finish', ...)` (quindi
 * già dopo che la risposta è stata inviata al client), senza mai essere
 * atteso nel path della richiesta. Un fallimento è solo loggato, mai
 * propagato al client.
 */
@Injectable()
export class AnalyticsIngestionMiddleware implements NestMiddleware {
  private readonly logger = new Logger(AnalyticsIngestionMiddleware.name);

  /** Inietta il service che esegue l'insert vero e proprio. */
  constructor(private readonly analyticsService: AnalyticsService) {}

  /** Non blocca la richiesta: registra l'evento in modo asincrono a risposta 2xx conclusa. */
  use(req: Request, res: Response, next: NextFunction): void {
    next();

    res.on('finish', () => {
      if (res.statusCode < 200 || res.statusCode >= 300) return;

      const queryPath = typeof req.query.path === 'string' ? req.query.path : undefined;
      if (!queryPath) return;

      const path = canonicalizePublicPath(queryPath);
      const clientIp = req.ip ?? '';
      const userAgent = req.headers['user-agent'] ?? '';
      const visitorHash = computeVisitorHash(clientIp, userAgent);
      const { device, browser, os } = parseUserAgent(userAgent);
      const referrer = req.headers['referer'];

      this.analyticsService
        .recordEvent({
          path,
          visitorHash,
          device,
          browser,
          os,
          referrer: typeof referrer === 'string' ? referrer : undefined,
        })
        .catch((err: Error) => {
          this.logger.warn(`Ingestion pageview fallita (path=${path}): ${err.message}`);
        });
    });
  }
}
