import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { MailerModule } from '../../mailer/mailer.module';
import { EmailProcessor } from './email.processor';
import { EmailQueueService } from './email.queue.service';

/**
 * Coda BullMQ dedicata all'invio email asincrono. Pattern ufficiale
 * `@nestjs/bullmq`: `BullModule.registerQueue` + `@Processor`/`WorkerHost`.
 * Nessun service applicativo deve inviare email direttamente via
 * `MailerService`: passa sempre da qui (CLAUDE.md, Divieti assoluti).
 */
@Module({
  imports: [
    BullModule.registerQueue({
      name: 'email-queue',
    }),
    MailerModule,
  ],
  providers: [EmailProcessor, EmailQueueService],
  exports: [EmailQueueService],
})
export class EmailQueueModule {}
