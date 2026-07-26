import { Injectable, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { MailerService } from '../../mailer/mailer.service';
import type { EmailJobData } from './email.queue.service';

/**
 * Worker BullMQ che processa i job della coda `email-queue` e delega
 * l'invio effettivo a `MailerService` (SMTP/Nodemailer).
 */
@Injectable()
@Processor('email-queue')
export class EmailProcessor extends WorkerHost {
  private readonly logger = new Logger(EmailProcessor.name);

  /** Inietta il servizio di trasporto email usato per processare i job. */
  constructor(private readonly mailerService: MailerService) {
    super();
  }

  /** Processa un job della coda `email-queue` inviando l'email via `MailerService`. */
  async process(job: Job<EmailJobData>): Promise<void> {
    const { to, subject, html, cc, attachments } = job.data || ({} as EmailJobData);

    if (!to || !subject || !html) {
      this.logger.warn(`Job ${job.id} con dati incompleti, skip (to/subject/html mancanti)`);
      return;
    }

    const result = await this.mailerService.sendEmail(to, subject, html, cc, attachments);

    if (!result.success) {
      // Lancia per far fallire l'attempt BullMQ e attivare backoff/attempt successivi.
      throw new Error(`Invio email fallito per ${to}: ${result.error || 'errore sconosciuto'}`);
    }
  }
}
