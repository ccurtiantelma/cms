import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import type { EmailAttachment } from '../../mailer/mailer.service';

/** Payload di un job della coda `email-queue`. */
export interface EmailJobData {
  to: string;
  subject: string;
  html: string;
  /** Destinatari in copia, opzionale. */
  cc?: string[];
  /** Allegati per percorso file (letti dal Worker al momento dell'invio), opzionale. */
  attachments?: EmailAttachment[];
}

/**
 * Punto di ingresso applicativo per l'invio email: accoda il job su BullMQ,
 * l'invio effettivo via SMTP è eseguito in modo asincrono da `EmailProcessor`.
 */
@Injectable()
export class EmailQueueService {
  private readonly logger = new Logger(EmailQueueService.name);

  /** Inietta la coda BullMQ `email-queue`. */
  constructor(
    @InjectQueue('email-queue')
    private readonly queue: Queue<EmailJobData>,
  ) {}

  /**
   * Accoda un invio email asincrono (es. attivazione account, reset password).
   * Il processor gestisce i retry con backoff esponenziale in caso di errore SMTP.
   */
  async enqueueEmail(data: EmailJobData): Promise<void> {
    await this.queue.add('send-email', data, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
      removeOnComplete: true,
      removeOnFail: false,
    });
    this.logger.log(`Email accodata per: ${data.to}`);
  }
}
