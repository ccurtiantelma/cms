import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { AppConstants } from '../common/app-constants';

/**
 * Allegato email passato per **percorso file** (non per buffer): il Worker
 * BullMQ legge il file dal filesystem al momento dell'invio SMTP, evitando
 * di trasportare buffer binari pesanti attraverso la coda Redis.
 */
export interface EmailAttachment {
  /** Nome con cui l'allegato compare nell'email. */
  filename: string;
  /** Percorso assoluto del file sul filesystem del processo che invia. */
  path: string;
}

export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  accepted?: string[];
  rejected?: string[];
  response?: string;
  error?: string;
}

/**
 * Trasporto email via Nodemailer/SMTP. Solo trasporto: nessuna logica di
 * business, nessuna coda — configurazione letta esclusivamente da
 * `AppConstants` (mai `process.env` diretto, CLAUDE.md).
 */
@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);
  private readonly transporter: nodemailer.Transporter;

  /** Configura il transporter Nodemailer SMTP a partire da `AppConstants`. */
  constructor() {
    const smtpSecure = AppConstants.smtpPort === 465;

    this.transporter = nodemailer.createTransport({
      host: AppConstants.smtpHost,
      port: AppConstants.smtpPort,
      secure: smtpSecure,
      // MailHog e altri server SMTP di sviluppo non richiedono auth: se le
      // credenziali non sono configurate, omettiamo l'oggetto `auth` per
      // evitare che nodemailer tenti comunque AUTH PLAIN e fallisca.
      ...(AppConstants.smtpUser && AppConstants.smtpPass
        ? { auth: { user: AppConstants.smtpUser, pass: AppConstants.smtpPass } }
        : {}),
      tls: { rejectUnauthorized: false },
    });

    this.logger.log(
      `Transporter SMTP configurato: host=${AppConstants.smtpHost} port=${AppConstants.smtpPort} secure=${smtpSecure}`,
    );
  }

  /** Verifica la connessione SMTP (usato dall'health check). */
  async verifyConnection(): Promise<boolean> {
    try {
      await this.transporter.verify();
      return true;
    } catch (err) {
      this.logger.error(`Verifica connessione SMTP fallita: ${(err as Error).message}`);
      return false;
    }
  }

  /**
   * Invia una email via SMTP, con supporto CC e allegati per percorso file.
   * @param to Destinatario principale.
   * @param subject Oggetto.
   * @param html Corpo HTML (usato anche come corpo testuale in fallback).
   * @param cc Destinatari in copia, opzionale.
   * @param attachments Allegati per percorso file, opzionale.
   */
  async sendEmail(
    to: string,
    subject: string,
    html: string,
    cc?: string[],
    attachments?: EmailAttachment[],
  ): Promise<SendEmailResult> {
    try {
      const mailOptions: nodemailer.SendMailOptions = {
        from: AppConstants.smtpFrom,
        to,
        subject,
        text: html,
        html,
      };

      if (cc && cc.length > 0) mailOptions.cc = cc;
      if (attachments && attachments.length > 0) mailOptions.attachments = attachments;

      this.logger.log(`Invio email a=[${to}] cc=[${cc?.join(', ') || ''}] subject="${subject}"`);

      const info = await this.transporter.sendMail(mailOptions);
      const success = Array.isArray(info.accepted)
        ? info.accepted.length > 0 && (!info.rejected || info.rejected.length === 0)
        : true;

      return {
        success,
        messageId: info.messageId,
        accepted: info.accepted as string[] | undefined,
        rejected: info.rejected as string[] | undefined,
        response: info.response,
      };
    } catch (err) {
      const message = (err as Error).message;
      this.logger.error(`Errore nell'invio email a ${to}: ${message}`);
      return { success: false, error: message };
    }
  }
}
