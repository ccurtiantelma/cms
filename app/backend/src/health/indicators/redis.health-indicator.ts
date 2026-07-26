import { Injectable } from '@nestjs/common';
import { HealthIndicatorResult, HealthIndicatorService } from '@nestjs/terminus';
import { RedisService } from '../../redis/redis.service';
import { HEALTH_CHECK_TIMEOUT_MS, withTimeout } from '../health-check.util';

/**
 * Verifica la connettività al server Redis eseguendo un PING via ioredis
 * (`RedisService`), con timeout: il client applicativo usa
 * `maxRetriesPerRequest: null` (session store), quindi con Redis down il
 * comando resterebbe altrimenti in coda a tempo indeterminato.
 */
@Injectable()
export class RedisHealthIndicator {
  /** Inietta `RedisService` e l'helper Terminus per il risultato. */
  constructor(
    private readonly redisService: RedisService,
    private readonly healthIndicatorService: HealthIndicatorService,
  ) {}

  /** Esegue il PING a Redis (con timeout) e restituisce l'esito nel formato atteso da Terminus. */
  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const indicator = this.healthIndicatorService.check(key);

    try {
      const reply = await withTimeout(
        this.redisService.ping(),
        HEALTH_CHECK_TIMEOUT_MS,
        'Redis check',
      );
      return reply === 'PONG' ? indicator.up() : indicator.down({ reply });
    } catch (err) {
      return indicator.down({ error: (err as Error).message });
    }
  }
}
