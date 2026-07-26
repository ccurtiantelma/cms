import { ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { AllExceptionsFilter } from '../../../../src/common/filters/all-exceptions.filter';
import { captureException } from '../../../../src/common/observability/sentry.util';

jest.mock('../../../../src/common/observability/sentry.util', () => ({
  captureException: jest.fn(),
}));

/** Costruisce un `ArgumentsHost` minimale per invocare `catch()` senza avviare un'app Nest. */
function createHost(): {
  host: ArgumentsHost;
  response: { status: jest.Mock; json: jest.Mock; headersSent: boolean };
} {
  const response = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
    headersSent: false,
  };
  const request = { method: 'GET', url: '/app/users' };
  const host = {
    getType: () => 'http',
    switchToHttp: () => ({ getResponse: () => response, getRequest: () => request }),
  } as unknown as ArgumentsHost;
  return { host, response };
}

describe('AllExceptionsFilter — integrazione Sentry (unit, ADR-15)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('invia a Sentry le eccezioni 5xx', () => {
    const filter = new AllExceptionsFilter();
    const { host } = createHost();
    const exception = new Error('boom');

    filter.catch(exception, host);

    expect(captureException).toHaveBeenCalledWith(exception);
  });

  it('non invia a Sentry le eccezioni 4xx (validazione/auth, non errori applicativi)', () => {
    const filter = new AllExceptionsFilter();
    const { host } = createHost();
    const exception = new HttpException('Non autorizzato', HttpStatus.FORBIDDEN);

    filter.catch(exception, host);

    expect(captureException).not.toHaveBeenCalled();
  });
});
