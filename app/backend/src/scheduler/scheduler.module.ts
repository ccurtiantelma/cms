import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { BullModule } from '@nestjs/bullmq';
import { QueueHealthTask } from './tasks/queue-health.task';

/**
 * Infrastruttura per cron dichiarativi (ADR-11), basata su `@nestjs/schedule`.
 * `BullModule.registerQueue` è ripetuto solo per iniettare le `Queue` in
 * `QueueHealthTask` (stesso pattern di `health.module.ts`): riusa la
 * connessione Redis condivisa di `BullModule.forRoot()` (`app.module.ts`), non
 * ne apre una nuova.
 */
@Module({
  imports: [
    ScheduleModule.forRoot(),
    BullModule.registerQueue({ name: 'email-queue' }, { name: 'files-cleanup-queue' }),
  ],
  providers: [QueueHealthTask],
})
export class SchedulerModule {}
