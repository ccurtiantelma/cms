import { Controller, Get, Header } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { MetricsService } from './metrics.service';

/**
 * Endpoint Prometheus (ADR-15), montato solo se `AppConstants.metricsEnabled`
 * (vedi `MetricsModule` in `app.module.ts`). Path `/metrics` **fuori** dal
 * prefisso globale `api/v1` (convenzione Prometheus) e **escluso** da
 * `AuthMiddleware` (uno scraper Prometheus non ha un JWT applicativo): va
 * quindi esposto solo su rete interna/allowlist IP a livello di reverse
 * proxy se il progetto verticale lo abilita in un ambiente non fidato.
 * Escluso da Swagger (`ApiExcludeController`): non è un endpoint applicativo.
 */
@ApiExcludeController()
@Controller('metrics')
export class MetricsController {
  /** Inietta il servizio che accumula/serializza le metriche Prometheus. */
  constructor(private readonly metricsService: MetricsService) {}

  /** Espone tutte le metriche registrate nel formato testuale Prometheus. */
  @Get()
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  getMetrics(): Promise<string> {
    return this.metricsService.getMetrics();
  }
}
