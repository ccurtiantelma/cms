import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { HealthCheck, HealthCheckResult, HealthCheckService } from '@nestjs/terminus';
import { BullMqHealthIndicator } from './indicators/bullmq.health-indicator';
import { DrizzleHealthIndicator } from './indicators/drizzle.health-indicator';
import { RedisHealthIndicator } from './indicators/redis.health-indicator';

/**
 * Health check applicativo (`GET /api/v1/health`), basato su `@nestjs/terminus`.
 * Verifica database, Redis e coda BullMQ; risponde `200` se tutti i check sono
 * `up`, `503` altrimenti — adatto come readiness probe (k8s/Docker Swarm) o per
 * uptime monitoring esterno.
 */
@ApiTags('Health')
@Controller('health')
export class HealthController {
  /** Inietta il servizio di orchestrazione Terminus e i singoli indicatori. */
  constructor(
    private readonly health: HealthCheckService,
    private readonly drizzleIndicator: DrizzleHealthIndicator,
    private readonly redisIndicator: RedisHealthIndicator,
    private readonly bullMqIndicator: BullMqHealthIndicator,
  ) {}

  /** Esegue tutti i check registrati (database, redis, bullmq) in parallelo. */
  @Get()
  @HealthCheck()
  @ApiOperation({
    summary: 'Health check applicativo (verifica connettività DB, Redis e coda BullMQ)',
  })
  @ApiResponse({ status: 200, description: 'Tutte le dipendenze esterne sono raggiungibili' })
  @ApiResponse({ status: 503, description: 'Almeno una dipendenza esterna non è raggiungibile' })
  check(): Promise<HealthCheckResult> {
    return this.health.check([
      () => this.drizzleIndicator.isHealthy('database'),
      () => this.redisIndicator.isHealthy('redis'),
      () => this.bullMqIndicator.isHealthy('bullmq'),
    ]);
  }
}
