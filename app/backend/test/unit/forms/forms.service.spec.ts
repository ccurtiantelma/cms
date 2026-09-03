import { BadRequestException, NotFoundException } from '@nestjs/common';
import { FormsService } from '../../../src/forms/forms.service';
import { DbService } from '../../../src/db/db.service';
import { EmailQueueService } from '../../../src/queues/email-queue/email.queue.service';
import { BlockTreeValidatorService } from '../../../src/blocks/validator/block-tree-validator.service';
import { DEFAULT_BLOCK_REGISTRY } from '../../../src/blocks/block-registry';
import { ENVELOPE_VERSION } from '../../../src/blocks/migration/envelope-migration.engine';
import {
  computeFormHoneypotFieldName,
  computeFormSignature,
} from '../../../src/forms/form-antispam.util';
import { SubmitFormDto } from '../../../src/forms/dto/submit-form.dto';

/**
 * Unit test di `FormsService.submitForm` (ADR-46 § 4/§ 6). Copre gli 8
 * scenari elencati nel task: happy path con notifica, honeypot valorizzato,
 * firma non valida, payload non conforme ai form-field pubblicati, form non
 * trovato, e persistenza avvenuta anche senza `app_settings` (ordine
 * persistenza-poi-notifica, business-rules.md § Moduli di contatto).
 */
describe('FormsService (unit)', () => {
  const FORM_KEY = 'contatti';
  const PAGE_ROW = {
    id: 42,
    guid: 'p1p1p1p1p1p1p1p1',
    status: 'published',
    isActive: true,
    publishedRevisionId: 900,
  };

  let service: FormsService;
  let dbMock: {
    query: {
      pageEntity: { findMany: jest.Mock };
      pageRevisionEntity: { findFirst: jest.Mock };
      appSettingEntity: { findFirst: jest.Mock };
      formSubmissionEntity: { findMany: jest.Mock };
    };
    insert: jest.Mock;
    select: jest.Mock;
  };
  let insertValuesMock: jest.Mock;
  let insertReturningMock: jest.Mock;
  let emailQueueService: { enqueueEmail: jest.Mock };

  /** Albero pubblicato di riferimento: un `form` con un `form-field` obbligatorio e un `form-submit`. */
  function buildPublishedFormContent(): Record<string, unknown> {
    return {
      version: ENVELOPE_VERSION,
      blocks: [
        {
          id: 'section-1',
          type: 'section',
          props: {},
          children: [
            {
              id: 'form-1',
              type: 'form',
              props: { formKey: FORM_KEY },
              children: [
                {
                  id: 'field-1',
                  type: 'form-field',
                  props: { fieldType: 'text', name: 'nome', label: 'Nome', required: true },
                  children: [],
                },
                {
                  id: 'submit-1',
                  type: 'form-submit',
                  props: {},
                  children: [],
                },
              ],
            },
          ],
        },
      ],
    };
  }

  function buildDto(values: Record<string, unknown>): SubmitFormDto {
    const dto = new SubmitFormDto();
    dto.signature = computeFormSignature(FORM_KEY);
    dto.values = values;
    return dto;
  }

  beforeEach(() => {
    insertReturningMock = jest.fn().mockResolvedValue([{ guid: 'sub0000000000001' }]);
    insertValuesMock = jest.fn().mockReturnValue({ returning: insertReturningMock });

    dbMock = {
      query: {
        pageEntity: { findMany: jest.fn().mockResolvedValue([PAGE_ROW]) },
        pageRevisionEntity: {
          findFirst: jest.fn().mockResolvedValue({ content: buildPublishedFormContent() }),
        },
        appSettingEntity: { findFirst: jest.fn().mockResolvedValue(undefined) },
        formSubmissionEntity: { findMany: jest.fn() },
      },
      insert: jest.fn().mockReturnValue({ values: insertValuesMock }),
      select: jest.fn(),
    };

    emailQueueService = { enqueueEmail: jest.fn().mockResolvedValue(undefined) };

    service = new FormsService(
      { db: dbMock } as unknown as DbService,
      emailQueueService as unknown as EmailQueueService,
      new BlockTreeValidatorService(),
      DEFAULT_BLOCK_REGISTRY,
    );
  });

  it("persiste l'Invio e accoda la notifica con destinatari letti da app_settings (happy path)", async () => {
    dbMock.query.appSettingEntity.findFirst.mockResolvedValue({
      value: { recipients: ['a@example.com', 'b@example.com'], notifySubject: 'Nuovo contatto' },
    });
    const dto = buildDto({ nome: 'Mario' });

    await service.submitForm(
      FORM_KEY,
      dto,
      { signature: dto.signature, values: dto.values },
      '1.2.3.4',
      'jest-agent',
    );

    expect(dbMock.insert).toHaveBeenCalledTimes(1);
    expect(insertValuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        formKey: FORM_KEY,
        pageId: PAGE_ROW.id,
        payload: { nome: 'Mario' },
      }),
    );
    expect(emailQueueService.enqueueEmail).toHaveBeenCalledTimes(1);
    expect(emailQueueService.enqueueEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'a@example.com',
        cc: ['b@example.com'],
        subject: 'Nuovo contatto',
      }),
    );
  });

  it('non usa mai il payload client come fonte dei destinatari', async () => {
    dbMock.query.appSettingEntity.findFirst.mockResolvedValue({
      value: { recipients: ['reale@example.com'], notifySubject: 'Oggetto' },
    });
    const dto = buildDto({ nome: 'Mario', recipients: ['attacker@evil.com'] });
    // `recipients` non è un `name` di form-field atteso: verrà rifiutato come
    // campo extra, non silenziosamente ignorato — verifichiamo comunque che,
    // isolando solo i campi attesi, l'email non abbia mai potuto raggiungerlo.
    await expect(
      service.submitForm(
        FORM_KEY,
        dto,
        { signature: dto.signature, values: dto.values },
        '1.2.3.4',
        'ua',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(emailQueueService.enqueueEmail).not.toHaveBeenCalled();
  });

  it('scarta silenziosamente senza persistere se il campo honeypot è valorizzato', async () => {
    const honeypotName = computeFormHoneypotFieldName(FORM_KEY);
    const dto = buildDto({ nome: 'Mario' });
    const rawBody = { signature: dto.signature, values: dto.values, [honeypotName]: 'bot-filled' };

    await expect(
      service.submitForm(FORM_KEY, dto, rawBody, '1.2.3.4', 'bot-agent'),
    ).resolves.toBeUndefined();

    expect(dbMock.insert).not.toHaveBeenCalled();
    expect(dbMock.query.pageEntity.findMany).not.toHaveBeenCalled();
    expect(emailQueueService.enqueueEmail).not.toHaveBeenCalled();
  });

  it('scarta silenziosamente senza persistere se la firma HMAC non corrisponde', async () => {
    const dto = new SubmitFormDto();
    dto.signature = 'firma-non-valida';
    dto.values = { nome: 'Mario' };

    await expect(
      service.submitForm(
        FORM_KEY,
        dto,
        { signature: dto.signature, values: dto.values },
        '1.2.3.4',
        'ua',
      ),
    ).resolves.toBeUndefined();

    expect(dbMock.insert).not.toHaveBeenCalled();
    expect(emailQueueService.enqueueEmail).not.toHaveBeenCalled();
  });

  it('rifiuta con 400 un payload con un campo obbligatorio mancante, senza persistere nulla', async () => {
    const dto = buildDto({});

    await expect(
      service.submitForm(
        FORM_KEY,
        dto,
        { signature: dto.signature, values: dto.values },
        '1.2.3.4',
        'ua',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(dbMock.insert).not.toHaveBeenCalled();
  });

  it('rifiuta con 400 un payload con un campo extra non dichiarato dai form-field pubblicati', async () => {
    const dto = buildDto({ nome: 'Mario', campoInventato: 'x' });

    await expect(
      service.submitForm(
        FORM_KEY,
        dto,
        { signature: dto.signature, values: dto.values },
        '1.2.3.4',
        'ua',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(dbMock.insert).not.toHaveBeenCalled();
  });

  it('risponde 404 se nessuna Pagina pubblicata contiene un blocco form con questo formKey', async () => {
    dbMock.query.pageEntity.findMany.mockResolvedValue([]);
    const dto = buildDto({ nome: 'Mario' });

    await expect(
      service.submitForm(
        FORM_KEY,
        dto,
        { signature: dto.signature, values: dto.values },
        '1.2.3.4',
        'ua',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(dbMock.insert).not.toHaveBeenCalled();
  });

  it("persiste comunque l'Invio se app_settings è assente, ma non accoda alcuna notifica (persistenza prima della notifica)", async () => {
    dbMock.query.appSettingEntity.findFirst.mockResolvedValue(undefined);
    const dto = buildDto({ nome: 'Mario' });

    await service.submitForm(
      FORM_KEY,
      dto,
      { signature: dto.signature, values: dto.values },
      '1.2.3.4',
      'ua',
    );

    expect(dbMock.insert).toHaveBeenCalledTimes(1);
    expect(emailQueueService.enqueueEmail).not.toHaveBeenCalled();
  });
});
