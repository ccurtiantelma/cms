import { HealthIndicatorService } from '@nestjs/terminus';
import type { Queue } from 'bullmq';
import { BullMqHealthIndicator } from '../../../src/health/indicators/bullmq.health-indicator';

describe('BullMqHealthIndicator (unit)', () => {
  const buildIndicator = (client: Promise<{ status: string }>): BullMqHealthIndicator => {
    const queue = { client } as unknown as Queue;
    return new BullMqHealthIndicator(queue, new HealthIndicatorService());
  };

  it('restituisce "up" quando la connessione della coda è "ready"', async () => {
    const indicator = buildIndicator(Promise.resolve({ status: 'ready' }));

    const result = await indicator.isHealthy('bullmq');

    expect(result).toEqual({ bullmq: { status: 'up', queue: 'email-queue' } });
  });

  it('restituisce "down" quando la connessione della coda non è "ready"', async () => {
    const indicator = buildIndicator(Promise.resolve({ status: 'reconnecting' }));

    const result = await indicator.isHealthy('bullmq');

    expect(result).toEqual({
      bullmq: { status: 'down', queue: 'email-queue', connectionStatus: 'reconnecting' },
    });
  });

  it('restituisce "down" con il messaggio d\'errore quando la connessione va in timeout', async () => {
    const indicator = buildIndicator(
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('BullMQ check: timeout dopo 3000ms')), 5),
      ),
    );

    const result = await indicator.isHealthy('bullmq');

    expect(result).toEqual({
      bullmq: { status: 'down', queue: 'email-queue', error: 'BullMQ check: timeout dopo 3000ms' },
    });
  });
});
