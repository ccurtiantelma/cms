/**
 * `isEnabled` in `sentry.ts` si calcola all'import del modulo (da
 * `import.meta.env.VITE_SENTRY_ENABLED`): serve `vi.resetModules()` +
 * `import()` dinamico dopo `vi.stubEnv(...)` per testare sia lo stato
 * disattivato (default) sia quello attivo in test separati.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('libs/sentry (frontend, ADR-15)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.doUnmock('@sentry/react');
  });

  it('initSentry non chiama Sentry.init quando VITE_SENTRY_ENABLED è assente (default)', async () => {
    const init = vi.fn();
    vi.doMock('@sentry/react', () => ({ init, captureException: vi.fn() }));

    const { initSentry } = await import('./sentry');
    initSentry();

    expect(init).not.toHaveBeenCalled();
  });

  it('initSentry chiama Sentry.init con dsn/tracesSampleRate quando abilitato', async () => {
    vi.stubEnv('VITE_SENTRY_ENABLED', 'true');
    vi.stubEnv('VITE_SENTRY_DSN', 'https://examplePublicKey@o0.ingest.sentry.io/0');
    const init = vi.fn();
    vi.doMock('@sentry/react', () => ({ init, captureException: vi.fn() }));

    const { initSentry } = await import('./sentry');
    initSentry();

    expect(init).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: 'https://examplePublicKey@o0.ingest.sentry.io/0',
        tracesSampleRate: 0,
      }),
    );
  });

  it('captureException non chiama Sentry.captureException quando disattivato', async () => {
    const captureExceptionMock = vi.fn();
    vi.doMock('@sentry/react', () => ({ init: vi.fn(), captureException: captureExceptionMock }));

    const { captureException } = await import('./sentry');
    captureException(new Error('boom'));

    expect(captureExceptionMock).not.toHaveBeenCalled();
  });

  it("captureException inoltra l'errore (con extra) quando abilitato", async () => {
    vi.stubEnv('VITE_SENTRY_ENABLED', 'true');
    vi.stubEnv('VITE_SENTRY_DSN', 'https://examplePublicKey@o0.ingest.sentry.io/0');
    const captureExceptionMock = vi.fn();
    vi.doMock('@sentry/react', () => ({ init: vi.fn(), captureException: captureExceptionMock }));

    const { captureException } = await import('./sentry');
    const error = new Error('boom');
    captureException(error, { componentStack: 'stack' });

    expect(captureExceptionMock).toHaveBeenCalledWith(error, {
      extra: { componentStack: 'stack' },
    });
  });
});
