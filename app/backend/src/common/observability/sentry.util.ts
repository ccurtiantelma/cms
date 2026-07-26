import * as Sentry from '@sentry/node';
import { Logger } from '@nestjs/common';
import { AppConstants } from '../app-constants';
import { sanitizeLogData } from '../logging/winston-logger.service';

const logger = new Logger('Sentry');

/**
 * Rimuove/redige i campi di un evento Sentry che possono contenere PII/segreti
 * prima di inoltrarlo al SaaS esterno. Non tocca `event.exception`/lo
 * stacktrace: sono strutture profondamente annidate e la loro redazione
 * (oltre `MAX_DEPTH` di `sanitizeLogData`) distruggerebbe l'informazione
 * diagnostica che è l'intero scopo di Sentry.
 */
function scrubSensitiveFields(event: Sentry.ErrorEvent): Sentry.ErrorEvent {
  if (event.request) {
    // Header/cookie (es. `Authorization: Bearer`, `rtk`) non passano da
    // `sanitizeLogData`: il nome header non contiene "token"/"secret" quindi
    // non verrebbero redatti dal matching per chiave. Non servono comunque
    // al debug applicativo: rimossi del tutto invece di redatti.
    const safeRequest = { ...event.request };
    delete safeRequest.headers;
    delete safeRequest.cookies;
    event.request = sanitizeLogData(safeRequest) as Sentry.ErrorEvent['request'];
  }
  if (event.extra) {
    event.extra = sanitizeLogData(event.extra) as Sentry.ErrorEvent['extra'];
  }
  if (event.user) {
    event.user = sanitizeLogData(event.user) as Sentry.ErrorEvent['user'];
  }
  return event;
}

/**
 * Inizializza il client Sentry (ADR-15) — no-op se `AppConstants.sentryEnabled`
 * è `false` o se `SENTRY_DSN` non è configurato: nessuna richiesta di rete verso
 * Sentry viene mai effettuata per i progetti che non abilitano esplicitamente
 * l'integrazione. Da chiamare una sola volta all'avvio, prima di `bootstrap()`.
 */
export function initSentry(): void {
  if (!AppConstants.sentryEnabled) return;

  if (!AppConstants.sentryDsn) {
    logger.warn('SENTRY_ENABLED=true ma SENTRY_DSN è vuoto: Sentry non verrà inizializzato.');
    return;
  }

  Sentry.init({
    dsn: AppConstants.sentryDsn,
    environment: AppConstants.sentryEnvironment,
    tracesSampleRate: AppConstants.sentryTracesSampleRate,
    beforeSend: scrubSensitiveFields,
  });
  logger.log(`Sentry inizializzato (environment=${AppConstants.sentryEnvironment}).`);
}

/**
 * Invia un'eccezione a Sentry — no-op se l'integrazione è disattivata
 * (`AppConstants.sentryEnabled`). Usata da `AllExceptionsFilter` solo per i
 * 5xx, mai per i 4xx (stesso confine già usato per i livelli di log Winston).
 */
export function captureException(exception: unknown): void {
  if (!AppConstants.sentryEnabled) return;
  Sentry.captureException(exception);
}
