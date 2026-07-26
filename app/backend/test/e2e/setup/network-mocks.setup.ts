import { Logger } from '@nestjs/common';

const logger = new Logger('NetworkMocksSetup');

/**
 * Setup globale e2e — blocca ogni uscita di rete reale verso SMTP (Nodemailer,
 * `src/mailer/mailer.service.ts`), sostituendola con uno stub deterministico.
 *
 * Da referenziare in `setupFilesAfterEnv` (MAI `setupFiles`: gli `afterEach`
 * qui sotto richiedono che i globals di Jest siano già installati) della
 * config Jest e2e, così che ogni file di test della suite erediti
 * automaticamente il mock, senza doverlo dichiarare singolarmente.
 */

/** Sottoinsieme dei campi di `Mail.Options` (nodemailer) effettivamente usati da `MailerService`. */
interface MockMailOptions {
  from?: string;
  to?: string | string[];
  cc?: string[];
  subject?: string;
  html?: string;
}

/** Esito minimo di `sendMail`, sufficiente per i log e le assertion dei test e2e. */
interface MockSentMessageInfo {
  messageId: string;
  accepted: string[];
  rejected: string[];
  response: string;
}

const sendMailMock = jest.fn<Promise<MockSentMessageInfo>, [MockMailOptions]>(
  async (mailOptions) => {
    const recipients = Array.isArray(mailOptions.to)
      ? mailOptions.to
      : [mailOptions.to].filter(Boolean);
    return {
      messageId: `mock-${Date.now()}@starter-kit.test`,
      accepted: recipients as string[],
      rejected: [],
      response: '250 OK (network-mocks.setup)',
    };
  },
);

const verifyMock = jest.fn<Promise<true>, []>(async () => true);

const createTransportMock = jest.fn(() => ({
  sendMail: sendMailMock,
  verify: verifyMock,
  close: jest.fn(),
}));

jest.mock('nodemailer', () => ({
  createTransport: createTransportMock,
  getTestMessageUrl: jest.fn(() => null),
}));

/** Spy dei mock di rete registrati da questo setup, per assertion nei test e2e (es. `networkMocks.nodemailer.sendMail`). */
export const networkMocks = {
  nodemailer: {
    createTransport: createTransportMock,
    sendMail: sendMailMock,
    verify: verifyMock,
  },
};

/**
 * Azzera la call history dello spy nodemailer senza toccare eventuali altri
 * mock Jest definiti nel singolo file di test — a differenza di
 * `jest.clearAllMocks()`, che avrebbe effetti collaterali globali indesiderati.
 */
export function resetNetworkMocks(): void {
  createTransportMock.mockClear();
  sendMailMock.mockClear();
  verifyMock.mockClear();
}

afterEach(() => {
  resetNetworkMocks();
});

logger.log(
  'network-mocks.setup: nodemailer mockato globalmente per la suite e2e (nessuna uscita di rete reale).',
);
