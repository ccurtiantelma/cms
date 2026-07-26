import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { MetricsController } from './metrics.controller';
import { MetricsInterceptor } from './metrics.interceptor';
import { MetricsService } from './metrics.service';

/**
 * Endpoint Prometheus `GET /metrics` (ADR-15) — importato in `app.module.ts`
 * solo se `AppConstants.metricsEnabled` è `true`: se il modulo non è
 * importato, né la rotta né l'interceptor di misurazione esistono, zero
 * overhead per i progetti che non abilitano l'osservabilità.
 */
@Module({
  controllers: [MetricsController],
  providers: [MetricsService, { provide: APP_INTERCEPTOR, useClass: MetricsInterceptor }],
})
export class MetricsModule {}
