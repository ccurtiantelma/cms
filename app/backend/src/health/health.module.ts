import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { BullMqHealthIndicator } from './indicators/bullmq.health-indicator';
import { DrizzleHealthIndicator } from './indicators/drizzle.health-indicator';
import { RedisHealthIndicator } from './indicators/redis.health-indicator';

/**
 * Modulo health check (`GET /api/v1/health`). `DbService`/`RedisService` sono
 * già globali (`DbModule`/`RedisModule`), non serve reimportarli qui.
 * `BullModule.registerQueue({ name: 'email-queue' })` è ripetuto (stesso pattern
 * di `src/queues/email-queue/`) solo per iniettare la `Queue` nell'indicatore:
 * usa la connessione Redis condivisa definita in `BullModule.forRoot()`
 * (`app.module.ts`), non ne apre una nuova.
 */
@Module({
  imports: [TerminusModule, BullModule.registerQueue({ name: 'email-queue' })],
  controllers: [HealthController],
  providers: [DrizzleHealthIndicator, RedisHealthIndicator, BullMqHealthIndicator],
})
export class HealthModule {}
