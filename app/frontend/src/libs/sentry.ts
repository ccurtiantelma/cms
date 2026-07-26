/**
 * Integrazione Sentry opzionale (ADR-15) — no-op se `VITE_SENTRY_ENABLED`
 * non è `"true"`: nessuna richiesta di rete verso Sentry per i progetti che
 * non abilitano esplicitamente l'integrazione (opt-in, "non appesantire
 * progetti piccoli").
 */
import * as Sentry from '@sentry/react';

const isEnabled = import.meta.env.VITE_SENTRY_ENABLED === 'true';

/** Inizializza il client Sentry — da chiamare una sola volta all'avvio (`main.tsx`), prima del render. */
export function initSentry(): void {
  if (!isEnabled) return;

  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) {
    console.warn(
      'VITE_SENTRY_ENABLED=true ma VITE_SENTRY_DSN è assente: Sentry non verrà inizializzato.',
    );
    return;
  }

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    tracesSampleRate: 0,
  });
}

/**
 * Invia un'eccezione a Sentry — no-op se l'integrazione è disattivata.
 * Usata da `ErrorBoundary` (crash di rendering) e dall'interceptor Axios
 * (`services/api.ts`, ramo `status >= 500`), sempre in aggiunta al
 * comportamento già presente (`console.error`/`notifications.show`), mai in sostituzione.
 */
export function captureException(error: unknown, extra?: Record<string, unknown>): void {
  if (!isEnabled) return;
  Sentry.captureException(error, extra ? { extra } : undefined);
}
