import { Module } from '@nestjs/common';
import { MailerService } from './mailer.service';

/**
 * Modulo di solo trasporto email (Nodemailer/SMTP). Non va importato
 * direttamente dai service applicativi: l'invio passa sempre dalla coda
 * BullMQ in `src/queues/email-queue/` (CLAUDE.md, Divieti assoluti).
 */
@Module({
  providers: [MailerService],
  exports: [MailerService],
})
export class MailerModule {}
