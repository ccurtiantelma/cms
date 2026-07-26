import { CallHandler, ExecutionContext } from '@nestjs/common';
import { of } from 'rxjs';
import { MetricsInterceptor } from '../../../src/metrics/metrics.interceptor';
import { MetricsService } from '../../../src/metrics/metrics.service';

describe('MetricsInterceptor (unit, ADR-15)', () => {
  it('registra method/route/status_code sul MetricsService per una richiesta HTTP', (done) => {
    const observeHttpRequest = jest.fn();
    const metricsService = { observeHttpRequest } as unknown as MetricsService;
    const interceptor = new MetricsInterceptor(metricsService);

    const request = { method: 'GET', path: '/app/users', route: { path: '/app/users/:id' } };
    const response = { statusCode: 200 };
    // Mock minimale di ExecutionContext: solo i due metodi realmente usati dall'interceptor.
    const context = {
      getType: () => 'http',
      switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }),
    } as unknown as ExecutionContext;
    const callHandler: CallHandler = { handle: () => of('ok') };

    interceptor.intercept(context, callHandler).subscribe(() => {
      expect(observeHttpRequest).toHaveBeenCalledWith(
        'GET',
        '/app/users/:id',
        200,
        expect.any(Number),
      );
      done();
    });
  });

  it('non registra nulla per contesti non-HTTP (es. gateway websocket)', () => {
    const observeHttpRequest = jest.fn();
    const metricsService = { observeHttpRequest } as unknown as MetricsService;
    const interceptor = new MetricsInterceptor(metricsService);

    const context = { getType: () => 'ws' } as unknown as ExecutionContext;
    const callHandler: CallHandler = { handle: () => of('ok') };

    interceptor.intercept(context, callHandler).subscribe();

    expect(observeHttpRequest).not.toHaveBeenCalled();
  });
});
