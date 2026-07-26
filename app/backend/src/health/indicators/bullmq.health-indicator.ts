import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { HealthIndicatorResult, HealthIndicatorService } from '@nestjs/terminus';
import type { Queue } from 'bullmq';
import { HEALTH_CHECK_TIMEOUT_MS, withTimeout } from '../health-check.util';

/**
 * Verifica la coda BullMQ `email-queue` controllando lo stato della connessione
 * Redis sottostante (`queue.client`, condivisa con `BullModule.forRoot()` in
 * `app.module.ts`). `IRedisClient.status` (astrazione BullMQ sull'adapter Redis
 * in uso, qui ioredis) è `'ready'` quando la connessione è attiva e autenticata
 * — stesso segnale usato internamente da BullMQ per `waitUntilReady`. `queue.client`
 * resta in attesa finché la connessione non è pronta: con Redis down andrebbe
 * altrimenti in attesa a tempo indeterminato, da cui il timeout esplicito.
 */
@Injectable()
export class BullMqHealthIndicator {
  /** Inietta la coda BullMQ `email-queue` e l'helper Terminus per il risultato. */
  constructor(
    @InjectQueue('email-queue') private readonly emailQueue: Queue,
    private readonly healthIndicatorService: HealthIndicatorService,
  ) {}

  /** Legge lo stato della connessione della coda (con timeout) e restituisce l'esito nel formato atteso da Terminus. */
  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const indicator = this.healthIndicatorService.check(key);

    try {
      const client = await withTimeout(
        this.emailQueue.client,
        HEALTH_CHECK_TIMEOUT_MS,
        'BullMQ check',
      );
      const isUp = client.status === 'ready';
      return isUp
        ? indicator.up({ queue: 'email-queue' })
        : indicator.down({ queue: 'email-queue', connectionStatus: client.status });
    } catch (err) {
      return indicator.down({ queue: 'email-queue', error: (err as Error).message });
    }
  }
}
