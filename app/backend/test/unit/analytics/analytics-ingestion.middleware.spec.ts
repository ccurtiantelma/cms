import { EventEmitter } from 'node:events';
import type { NextFunction, Request, Response } from 'express';
import {
  AnalyticsIngestionMiddleware,
  EXPORT_RENDER_MARKER_HEADER,
} from '../../../src/analytics/analytics-ingestion.middleware';
import { AnalyticsService } from '../../../src/analytics/analytics.service';

describe('AnalyticsIngestionMiddleware', () => {
  let recordEvent: jest.Mock;
  let middleware: AnalyticsIngestionMiddleware;

  beforeEach(() => {
    recordEvent = jest.fn().mockResolvedValue(undefined);
    middleware = new AnalyticsIngestionMiddleware({ recordEvent } as unknown as AnalyticsService);
  });

  /** Esegue il middleware e chiude la risposta con `statusCode`, come farebbe Express. */
  function run(statusCode: number, headers: Record<string, string> = {}): NextFunction {
    const req = {
      query: { path: '/chi-siamo' },
      headers: { 'user-agent': 'Mozilla/5.0', ...headers },
      ip: '203.0.113.7',
    } as unknown as Request;
    const res = Object.assign(new EventEmitter(), { statusCode }) as unknown as Response;
    const next = jest.fn();

    middleware.use(req, res, next);
    res.emit('finish');
    return next;
  }

  it('registra una pageview per una lettura pubblica riuscita, senza bloccare la richiesta', () => {
    const next = run(200);

    expect(next).toHaveBeenCalledTimes(1);
    expect(recordEvent).toHaveBeenCalledWith(expect.objectContaining({ path: '/chi-siamo' }));
  });

  it('non registra una lettura che non si conclude con 2xx', () => {
    run(404);

    expect(recordEvent).not.toHaveBeenCalled();
  });

  it("non registra i render per l'export statico: sono il worker, non un visitatore (ADR-67)", () => {
    run(200, { [EXPORT_RENDER_MARKER_HEADER]: '1' });

    expect(recordEvent).not.toHaveBeenCalled();
  });
});
