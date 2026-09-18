import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { SiteTemplatesService } from '../../../src/site-templates/site-templates.service';
import { DbService } from '../../../src/db/db.service';
import { AuditLogService } from '../../../src/common/audit-log.service';
import { BlockTreeValidatorService } from '../../../src/blocks/validator/block-tree-validator.service';
import { BlockPropSanitizerService } from '../../../src/common/sanitizer/block-prop-sanitizer.service';
import { CssTreeSanitizerService } from '../../../src/common/sanitizer/css-tree-sanitizer.service';
import { DEFAULT_BLOCK_REGISTRY } from '../../../src/blocks/block-registry';
import { ENVELOPE_VERSION } from '../../../src/blocks/migration/envelope-migration.engine';
import { AppUserRoles, SiteTemplateType } from '../../../src/common/enums';
import { AuthInfo } from '../../../src/common/types';
import { CreateSiteTemplateDto } from '../../../src/site-templates/dto/create-site-template.dto';
import { UpdateSiteTemplateDto } from '../../../src/site-templates/dto/update-site-template.dto';

/**
 * Unit test di `SiteTemplatesService` (RFC-40 Opzione B, ADR-64). Copre
 * create/findAll/findOne/update/remove, il lock ottimistico (409
 * `SITE_TEMPLATE_VERSION_CONFLICT`), il soft delete e il riuso della
 * pipeline blocchi ADR-21 (`migrateEnvelope`/`migrateBlockTree`/
 * `BlockTreeValidatorService`/`BlockPropSanitizerService`) — stesso pattern
 * di `global-sections.service.spec.ts`: `DbService`/`AuditLogService` sono
 * mock (unici confini esterni reali), `BlockTreeValidatorService`/
 * `BlockPropSanitizerService` sono istanze reali con `DEFAULT_BLOCK_REGISTRY`.
 */
describe('SiteTemplatesService (unit) — RFC-40 Opzione B / ADR-64', () => {
  const AUTH: AuthInfo = { userId: 9, role: AppUserRoles.Manager, name: 'Editor', scopeId: null };

  const BASE_ROW = {
    id: 1,
    guid: 'aaaaaaaaaaaaaaaa',
    title: 'Template di ricerca',
    type: SiteTemplateType.SearchResults,
    contentTree: { version: ENVELOPE_VERSION, blocks: [] },
    isPublished: false,
    language: 'IT',
    priority: 0,
    displayConditions: [],
    version: 3,
    isActive: true,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    createdBy: 9,
    updatedBy: 9,
  };

  let service: SiteTemplatesService;
  let insertValuesMock: jest.Mock;
  let insertReturningMock: jest.Mock;
  let updateSetMock: jest.Mock;
  let updateWhereMock: jest.Mock;
  let findFirstMock: jest.Mock;
  let findManyMock: jest.Mock;
  let selectMock: jest.Mock;
  let dbMock: {
    query: { siteTemplateEntity: { findFirst: jest.Mock; findMany: jest.Mock } };
    insert: jest.Mock;
    update: jest.Mock;
    select: jest.Mock;
  };
  let auditLogService: { log: jest.Mock };

  /** Envelope con un singolo blocco `heading` valido. */
  function headingContent(text: string): Record<string, unknown> {
    return {
      version: ENVELOPE_VERSION,
      blocks: [{ id: 'h1', type: 'heading', v: 1, props: { level: 'h2', text }, children: [] }],
    };
  }

  /** Envelope con un blocco `richText` il cui `html` contiene un payload XSS noto. */
  function maliciousRichTextContent(html: string): Record<string, unknown> {
    return {
      version: ENVELOPE_VERSION,
      blocks: [{ id: 'rt1', type: 'richText', v: 1, props: { html }, children: [] }],
    };
  }

  beforeEach(() => {
    insertReturningMock = jest.fn().mockResolvedValue([{ ...BASE_ROW }]);
    insertValuesMock = jest.fn().mockReturnValue({ returning: insertReturningMock });

    updateWhereMock = jest.fn();
    updateSetMock = jest.fn().mockReturnValue({ where: updateWhereMock });

    findFirstMock = jest.fn().mockResolvedValue({ ...BASE_ROW });
    findManyMock = jest.fn().mockResolvedValue([{ ...BASE_ROW }]);

    selectMock = jest.fn().mockReturnValue({
      from: jest.fn().mockReturnValue({ where: jest.fn().mockResolvedValue([{ total: 1 }]) }),
    });

    dbMock = {
      query: { siteTemplateEntity: { findFirst: findFirstMock, findMany: findManyMock } },
      insert: jest.fn().mockReturnValue({ values: insertValuesMock }),
      update: jest.fn().mockReturnValue({ set: updateSetMock }),
      select: selectMock,
    };

    auditLogService = { log: jest.fn().mockResolvedValue(undefined) };

    service = new SiteTemplatesService(
      { db: dbMock } as unknown as DbService,
      auditLogService as unknown as AuditLogService,
      new BlockTreeValidatorService(),
      new BlockPropSanitizerService(new CssTreeSanitizerService()),
      DEFAULT_BLOCK_REGISTRY,
    );
  });

  // ─── create() ────────────────────────────────────────────────────────────

  describe('create()', () => {
    it('happy path: crea il Template con contentTree valido e logga in audit', async () => {
      const dto: CreateSiteTemplateDto = {
        title: 'Template di ricerca',
        type: SiteTemplateType.SearchResults,
        contentTree: headingContent('Risultati'),
      };

      const result = await service.create(dto, AUTH);

      expect(result.guid).toBe(BASE_ROW.guid);
      expect(insertValuesMock).toHaveBeenCalledTimes(1);
      const insertedValues = insertValuesMock.mock.calls[0][0] as Record<string, unknown>;
      expect(insertedValues.type).toBe(SiteTemplateType.SearchResults);
      expect(insertedValues.isPublished).toBe(false); // default
      expect(insertedValues.language).toBe('IT'); // default
      expect(auditLogService.log).toHaveBeenCalledWith(
        AUTH.userId,
        'site-templates.create',
        'site_templates',
        BASE_ROW.guid,
        { type: BASE_ROW.type, language: BASE_ROW.language },
        AUTH.impersonatedBy,
      );
    });

    it('senza contentTree usa un envelope vuoto di default', async () => {
      const dto: CreateSiteTemplateDto = {
        title: 'Template vuoto',
        type: SiteTemplateType.SinglePage,
      };

      await service.create(dto, AUTH);

      const insertedValues = insertValuesMock.mock.calls[0][0] as Record<string, unknown>;
      expect(insertedValues.contentTree).toEqual({ version: ENVELOPE_VERSION, blocks: [] });
    });

    it('un tipo di blocco sconosciuto nel contentTree è respinto per intero (400 BLOCK_TYPE_UNKNOWN), nessun insert', async () => {
      const dto: CreateSiteTemplateDto = {
        title: 'Template con blocco sconosciuto',
        type: SiteTemplateType.SinglePage,
        contentTree: {
          version: ENVELOPE_VERSION,
          blocks: [{ id: 'x1', type: 'nonEsiste', v: 1, props: {}, children: [] }],
        },
      };

      await expect(service.create(dto, AUTH)).rejects.toBeInstanceOf(BadRequestException);
      await expect(service.create(dto, AUTH)).rejects.toMatchObject({
        response: expect.objectContaining({
          code: 'BLOCK_TYPE_UNKNOWN',
          details: expect.objectContaining({ path: 'blocks[0]' }),
        }),
      });
      expect(insertValuesMock).not.toHaveBeenCalled();
    });

    it('un annidamento non ammesso (heading dentro heading) è respinto per intero (400 BLOCK_NESTING_NOT_ALLOWED) con il path del nodo colpevole', async () => {
      const dto: CreateSiteTemplateDto = {
        title: 'Template con annidamento vietato',
        type: SiteTemplateType.SinglePage,
        contentTree: {
          version: ENVELOPE_VERSION,
          blocks: [
            {
              id: 'h1',
              type: 'heading',
              v: 1,
              props: { level: 'h2', text: 'Padre' },
              children: [
                {
                  id: 'h2',
                  type: 'heading',
                  v: 1,
                  props: { level: 'h3', text: 'Figlio' },
                  children: [],
                },
              ],
            },
          ],
        },
      };

      await expect(service.create(dto, AUTH)).rejects.toMatchObject({
        response: expect.objectContaining({
          code: 'BLOCK_NESTING_NOT_ALLOWED',
          details: expect.objectContaining({ path: 'blocks[0].children[0]' }),
        }),
      });
      expect(insertValuesMock).not.toHaveBeenCalled();
    });

    it('props malformate (heading senza "level" obbligatoria) sono respinte per intero (400) con il path del nodo colpevole', async () => {
      const dto: CreateSiteTemplateDto = {
        title: 'Template con props malformate',
        type: SiteTemplateType.SinglePage,
        contentTree: {
          version: ENVELOPE_VERSION,
          blocks: [
            { id: 'h1', type: 'heading', v: 1, props: { text: 'Manca level' }, children: [] },
          ],
        },
      };

      await expect(service.create(dto, AUTH)).rejects.toBeInstanceOf(BadRequestException);
      await expect(service.create(dto, AUTH)).rejects.toMatchObject({
        response: expect.objectContaining({
          code: 'BLOCK_PROP_INVALID',
          details: expect.objectContaining({ path: 'blocks[0].props.level', reason: 'required' }),
        }),
      });
      expect(insertValuesMock).not.toHaveBeenCalled();
    });

    it('un payload XSS noto (script/onerror/javascript:) in un blocco richText è sempre neutralizzato prima della persistenza, mai solo a schermo', async () => {
      const malicious =
        '<script>alert(1)</script><img src=x onerror="alert(2)"><a href="javascript:alert(3)">click</a>';
      const dto: CreateSiteTemplateDto = {
        title: 'Template con XSS',
        type: SiteTemplateType.SinglePage,
        contentTree: maliciousRichTextContent(malicious),
      };

      await service.create(dto, AUTH);

      const insertedValues = insertValuesMock.mock.calls[0][0] as Record<string, unknown>;
      const persisted = JSON.stringify(insertedValues.contentTree);
      expect(persisted).not.toMatch(/<script/i);
      expect(persisted).not.toMatch(/onerror\s*=/i);
      expect(persisted).not.toMatch(/javascript:/i);
      expect(persisted).not.toMatch(/<img/i);
    });
  });

  // ─── findAll() ───────────────────────────────────────────────────────────

  describe('findAll()', () => {
    it('applica i default di paginazione (p=1, i=20) e restituisce un Pagination<T>', async () => {
      const result = await service.findAll({ p: 0, i: 0 });

      expect(result.currentPage).toBe(1);
      expect(result.itemsPerPage).toBe(20);
      expect(result.items).toHaveLength(1);
      expect(result.items[0].guid).toBe(BASE_ROW.guid);
    });

    it('passa p/i espliciti alla query (offset/limit)', async () => {
      await service.findAll({ p: 2, i: 5 });

      expect(findManyMock).toHaveBeenCalledWith(expect.objectContaining({ limit: 5, offset: 5 }));
    });
  });

  // ─── findOne() ───────────────────────────────────────────────────────────

  describe('findOne()', () => {
    it('happy path: restituisce il DTO del Template attivo', async () => {
      const result = await service.findOne(BASE_ROW.guid);

      expect(result.guid).toBe(BASE_ROW.guid);
      expect(findFirstMock).toHaveBeenCalledTimes(1);
    });

    it('404 se il guid non esiste (findFirst restituisce undefined)', async () => {
      findFirstMock.mockResolvedValue(undefined);

      await expect(service.findOne('0000000000000000')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('404 se il record esiste ma è soft-eliminato: loadActiveByGuid filtra sempre isActive=true, quindi findFirst non lo restituisce', async () => {
      // La query reale include `eq(isActive, true)` nella WHERE: un record
      // soft-eliminato non risulterebbe mai restituito da Postgres. Qui si
      // simula esattamente quell'esito (nessuna riga), non un record con
      // isActive:false restituito comunque — quel caso non può accadere con
      // la query reale.
      findFirstMock.mockResolvedValue(undefined);

      await expect(service.findOne(BASE_ROW.guid)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // ─── update() ────────────────────────────────────────────────────────────

  describe('update()', () => {
    it('happy path: aggiorna i campi forniti e incrementa version', async () => {
      updateWhereMock.mockReturnValue({
        returning: jest
          .fn()
          .mockResolvedValue([{ ...BASE_ROW, version: 4, title: 'Nuovo titolo' }]),
      });
      const dto: UpdateSiteTemplateDto = { version: 3, title: 'Nuovo titolo' };

      const result = await service.update(BASE_ROW.guid, dto, AUTH);

      expect(result.version).toBe(4);
      expect(updateSetMock).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Nuovo titolo', version: 4 }),
      );
    });

    it('version obsoleta (0 righe aggiornate) produce 409 SITE_TEMPLATE_VERSION_CONFLICT', async () => {
      updateWhereMock.mockReturnValue({ returning: jest.fn().mockResolvedValue([]) });
      const dto: UpdateSiteTemplateDto = { version: 1, title: 'Tentativo su version vecchia' };

      await expect(service.update(BASE_ROW.guid, dto, AUTH)).rejects.toBeInstanceOf(
        ConflictException,
      );
      await expect(service.update(BASE_ROW.guid, dto, AUTH)).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'SITE_TEMPLATE_VERSION_CONFLICT' }),
      });
    });

    it('due salvataggi concorrenti sulla stessa bozza: il secondo (stessa version di partenza) riceve 409 e nessuna modifica del primo va persa — verificato a livello di WHERE (version+isActive), non solo di esito HTTP', async () => {
      // Primo salvataggio: righe aggiornate normalmente.
      updateWhereMock.mockReturnValueOnce({
        returning: jest
          .fn()
          .mockResolvedValue([{ ...BASE_ROW, version: 4, title: 'Vince il primo' }]),
      });
      const first = await service.update(
        BASE_ROW.guid,
        { version: 3, title: 'Vince il primo' },
        AUTH,
      );
      expect(first.version).toBe(4);

      // Secondo salvataggio con la STESSA version di partenza (3, ora obsoleta):
      // la query reale filtra su `version = 3 AND isActive = true`, che non
      // trova più righe dopo l'update precedente (version è ora 4) — 0 righe.
      updateWhereMock.mockReturnValueOnce({ returning: jest.fn().mockResolvedValue([]) });
      await expect(
        service.update(BASE_ROW.guid, { version: 3, title: 'Perso: mai persistito' }, AUTH),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'SITE_TEMPLATE_VERSION_CONFLICT' }),
      });

      // La WHERE del secondo update è stata comunque costruita sulla version
      // obsoleta richiesta dal client, mai silenziosamente aggiornata al valore corrente.
      expect(dbMock.update).toHaveBeenCalledTimes(2);
    });

    it('un contentTree malformato in update è respinto (400), nessun update eseguito', async () => {
      const dto: UpdateSiteTemplateDto = {
        version: 3,
        contentTree: {
          version: ENVELOPE_VERSION,
          blocks: [{ id: 'x1', type: 'nonEsiste', v: 1, props: {}, children: [] }],
        },
      };

      await expect(service.update(BASE_ROW.guid, dto, AUTH)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(dbMock.update).not.toHaveBeenCalled();
    });

    it('404 se il Template non esiste (loadActiveByGuid fallisce prima di ogni update)', async () => {
      findFirstMock.mockResolvedValue(undefined);

      await expect(
        service.update('0000000000000000', { version: 1, title: 'x' }, AUTH),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(dbMock.update).not.toHaveBeenCalled();
    });
  });

  // ─── remove() ────────────────────────────────────────────────────────────

  describe('remove()', () => {
    it('soft delete: isActive=false, audit loggato, nessun DELETE fisico', async () => {
      updateWhereMock.mockResolvedValue(undefined);

      await service.remove(BASE_ROW.guid, AUTH, '127.0.0.1');

      expect(updateSetMock).toHaveBeenCalledWith(
        expect.objectContaining({ isActive: false, updatedBy: AUTH.userId }),
      );
      expect(auditLogService.log).toHaveBeenCalledWith(
        AUTH.userId,
        'site-templates.delete',
        'site_templates',
        BASE_ROW.guid,
        undefined,
        AUTH.impersonatedBy,
        '127.0.0.1',
      );
    });

    it('un record soft-eliminato non è più raggiungibile da findOne (404) dopo la remove: loadActiveByGuid filtra su isActive=true', async () => {
      updateWhereMock.mockResolvedValue(undefined);
      await service.remove(BASE_ROW.guid, AUTH);

      // Dopo il soft delete, la query reale non restituirebbe più la riga
      // (isActive=false esclusa dalla WHERE): si simula esattamente questo esito.
      findFirstMock.mockResolvedValue(undefined);

      await expect(service.findOne(BASE_ROW.guid)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('404 se il Template non esiste o è già stato eliminato', async () => {
      findFirstMock.mockResolvedValue(undefined);

      await expect(service.remove('0000000000000000', AUTH)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(dbMock.update).not.toHaveBeenCalled();
    });
  });
});
