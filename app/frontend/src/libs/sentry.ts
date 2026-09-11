/**
 * Integrazione Sentry opzionale (ADR-15) — no-op se `VITE_SENTRY_ENABLED`
 * non è `"true"`: nessuna richiesta di rete verso Sentry per i progetti che
 * non abilitano esplicitamente l'integrazione (opt-in, "non appesantire
 * progetti piccoli").
 *
 * L'SDK (`@sentry/react`, pesante) è caricato via `import()` dinamico e solo
 * quando l'integrazione è abilitata: da statico che era, teneva l'intero SDK
 * nel chunk d'ingresso anche per i progetti che non lo attivano mai — fuori
 * dal percorso critico per il caricamento iniziale (LCP).
 */
import type * as SentryType from '@sentry/react';

const isEnabled = import.meta.env.VITE_SENTRY_ENABLED === 'true';

let sentryModulePromise: Promise<typeof SentryType> | undefined;

/** Carica l'SDK una sola volta (cache della promise) — no-op se disattivato. */
function loadSentry(): Promise<typeof SentryType> | undefined {
  if (!isEnabled) return undefined;
  if (!sentryModulePromise) sentryModulePromise = import('@sentry/react');
  return sentryModulePromise;
}

/**
 * Inizializza il client Sentry — da chiamare una sola volta all'avvio (`main.tsx`), prima del
 * render. Ritorna una `Promise` solo per determinismo nei test (`await`); nessun chiamante
 * reale ne usa il valore di ritorno.
 */
export function initSentry(): Promise<void> {
  if (!isEnabled) return Promise.resolve();

  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) {
    console.warn(
      'VITE_SENTRY_ENABLED=true ma VITE_SENTRY_DSN è assente: Sentry non verrà inizializzato.',
    );
    return Promise.resolve();
  }

  return (
    loadSentry()?.then((Sentry) => {
      Sentry.init({
        dsn,
        environment: import.meta.env.MODE,
        tracesSampleRate: 0,
      });
    }) ?? Promise.resolve()
  );
}

/**
 * Invia un'eccezione a Sentry — no-op se l'integrazione è disattivata.
 * Usata da `ErrorBoundary` (crash di rendering) e dall'interceptor Axios
 * (`services/api.ts`, ramo `status >= 500`), sempre in aggiunta al
 * comportamento già presente (`console.error`/`notifications.show`), mai in sostituzione.
 * Ritorna una `Promise` solo per determinismo nei test — i chiamanti reali non la attendono.
 */
export function captureException(error: unknown, extra?: Record<string, unknown>): Promise<void> {
  if (!isEnabled) return Promise.resolve();
  return (
    loadSentry()?.then((Sentry) => {
      Sentry.captureException(error, extra ? { extra } : undefined);
    }) ?? Promise.resolve()
  );
}
