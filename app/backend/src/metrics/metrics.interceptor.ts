import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { MetricsService } from './metrics.service';

/**
 * Registra la durata di ogni richiesta HTTP nell'istogramma
 * `http_request_duration_seconds` (ADR-15). Registrato come `APP_INTERCEPTOR`
 * solo da `MetricsModule`, quindi attivo esclusivamente quando
 * `AppConstants.metricsEnabled` è `true` — nessun overhead per i progetti
 * che non abilitano l'endpoint `/metrics`.
 */
@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  /** Inietta il servizio su cui registrare le osservazioni di durata. */
  constructor(private readonly metricsService: MetricsService) {}

  /** Misura la durata della richiesta HTTP corrente e la registra su `MetricsService`. */
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const route = request.route?.path ?? request.path;
    const startNs = process.hrtime.bigint();

    const record = (): void => {
      const durationSeconds = Number(process.hrtime.bigint() - startNs) / 1e9;
      this.metricsService.observeHttpRequest(
        request.method,
        route,
        response.statusCode,
        durationSeconds,
      );
    };

    return next.handle().pipe(tap({ next: record, error: record }));
  }
}
