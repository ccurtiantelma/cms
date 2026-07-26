/**
 * `AppConstants` calcola i suoi campi `static readonly` all'import del modulo:
 * per testare sia lo stato disattivato (default) sia quello attivo servono
 * `jest.resetModules()` + `require` dinamico dopo aver impostato `process.env`,
 * altrimenti tutti i test condividerebbero lo stesso snapshot di configurazione.
 */
describe('sentry.util (backend, ADR-15)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  /** Mocka `@sentry/node` e ricarica `sentry.util` a fresco con il `process.env` corrente del test. */
  function loadSentryUtilWithMockedSdk(): {
    init: jest.Mock;
    captureExceptionMock: jest.Mock;
    initSentry: () => void;
    captureException: (exception: unknown) => void;
  } {
    const init = jest.fn();
    const captureExceptionMock = jest.fn();
    jest.doMock('@sentry/node', () => ({ init, captureException: captureExceptionMock }));

    // eslint-disable-next-line @typescript-eslint/no-require-imports -- serve un require dinamico dopo jest.resetModules(): AppConstants è "static readonly", va rivalutato con il process.env impostato da ogni test
    const sentryUtil = require('../../../../src/common/observability/sentry.util');
    return {
      init,
      captureExceptionMock,
      initSentry: sentryUtil.initSentry,
      captureException: sentryUtil.captureException,
    };
  }

  it('initSentry non chiama Sentry.init quando SENTRY_ENABLED è false (default)', () => {
    process.env.SENTRY_ENABLED = 'false';
    const { init, initSentry } = loadSentryUtilWithMockedSdk();

    initSentry();

    expect(init).not.toHaveBeenCalled();
  });

  it('initSentry non chiama Sentry.init quando abilitato ma SENTRY_DSN è vuoto', () => {
    process.env.SENTRY_ENABLED = 'true';
    process.env.SENTRY_DSN = '';
    const { init, initSentry } = loadSentryUtilWithMockedSdk();

    initSentry();

    expect(init).not.toHaveBeenCalled();
  });

  it('initSentry chiama Sentry.init con dsn/environment/tracesSampleRate quando correttamente abilitato', () => {
    process.env.SENTRY_ENABLED = 'true';
    process.env.SENTRY_DSN = 'https://examplePublicKey@o0.ingest.sentry.io/0';
    process.env.SENTRY_ENVIRONMENT = 'staging';
    process.env.SENTRY_TRACES_SAMPLE_RATE = '0.2';
    const { init, initSentry } = loadSentryUtilWithMockedSdk();

    initSentry();

    expect(init).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: 'https://examplePublicKey@o0.ingest.sentry.io/0',
        environment: 'staging',
        tracesSampleRate: 0.2,
      }),
    );
  });

  it('captureException non chiama Sentry.captureException quando disattivato', () => {
    process.env.SENTRY_ENABLED = 'false';
    const { captureExceptionMock, captureException } = loadSentryUtilWithMockedSdk();

    captureException(new Error('boom'));

    expect(captureExceptionMock).not.toHaveBeenCalled();
  });

  it("captureException inoltra l'eccezione a Sentry quando attivato", () => {
    process.env.SENTRY_ENABLED = 'true';
    process.env.SENTRY_DSN = 'https://examplePublicKey@o0.ingest.sentry.io/0';
    const { captureExceptionMock, captureException } = loadSentryUtilWithMockedSdk();

    const error = new Error('boom');
    captureException(error);

    expect(captureExceptionMock).toHaveBeenCalledWith(error);
  });

  it("beforeSend rimuove header/cookie, redige extra/user, non tocca lo stacktrace dell'eccezione", () => {
    process.env.SENTRY_ENABLED = 'true';
    process.env.SENTRY_DSN = 'https://examplePublicKey@o0.ingest.sentry.io/0';
    const { init, initSentry } = loadSentryUtilWithMockedSdk();

    initSentry();

    const beforeSend = init.mock.calls[0][0].beforeSend as (event: unknown) => unknown;
    const event = {
      request: {
        url: '/api/v1/app/users',
        headers: { authorization: 'Bearer secret-token' },
        cookies: { rtk: 'opaque-token' },
      },
      extra: { password: 'p4ssw0rd', note: 'ok' },
      user: { email: 'user@example.com' },
      exception: { values: [{ stacktrace: { frames: [{ function: 'realHandler' }] } }] },
    };

    const scrubbed = beforeSend(event) as typeof event;

    // Header/cookie rimossi del tutto (mai inoltrati a Sentry, non solo redatti per chiave).
    expect(scrubbed.request.headers).toBeUndefined();
    expect(scrubbed.request.cookies).toBeUndefined();
    expect(scrubbed.request.url).toBe('/api/v1/app/users');
    expect(scrubbed.extra.password).toBe('[REDACTED]');
    expect(scrubbed.extra.note).toBe('ok');
    expect(scrubbed.user.email).toBe('[REDACTED]');
    // Lo stacktrace non viene redatto: è l'informazione diagnostica che Sentry deve ricevere intatta.
    expect(scrubbed.exception.values[0].stacktrace.frames[0].function).toBe('realHandler');
  });
});
