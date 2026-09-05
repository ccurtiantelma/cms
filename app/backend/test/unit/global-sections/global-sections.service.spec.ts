import { BadRequestException, ConflictException } from '@nestjs/common';
import { GlobalSectionsService } from '../../../src/global-sections/global-sections.service';
import { DbService } from '../../../src/db/db.service';
import { AuditLogService } from '../../../src/common/audit-log.service';
import { BlockTreeValidatorService } from '../../../src/blocks/validator/block-tree-validator.service';
import { BlockPropSanitizerService } from '../../../src/common/sanitizer/block-prop-sanitizer.service';
import { ExportService } from '../../../src/export/export.service';
import { DEFAULT_BLOCK_REGISTRY } from '../../../src/blocks/block-registry';
import { ENVELOPE_VERSION } from '../../../src/blocks/migration/envelope-migration.engine';
import { GlobalSectionLayoutSlot, AppUserRoles } from '../../../src/common/enums';
import { AuthInfo } from '../../../src/common/types';
import { CreateGlobalSectionDto } from '../../../src/global-sections/dto/create-global-section.dto';
import { UpdateGlobalSectionDto } from '../../../src/global-sections/dto/update-global-section.dto';

/**
 * Unit test di `GlobalSectionsService` (ADR-55, fix invalidazione). Copre il
 * debito chiuso da ADR-55: `create`/`update`/`remove` accodano sempre
 * `ExportService.enqueueFullSiteExport()` quando `content`/`layoutSlot`/
 * `isActive` cambiano — **anche** per `layoutSlot: 'none'`, non solo
 * `header`/`footer` come prima del fix — e non toccano mai
 * `PublicGlobalSectionsCacheService` (rimosso, nessun mock/import qui: la
 * sua assenza da questo file è essa stessa parte della copertura). Copre
 * anche il divieto di ciclo per contratto (`insideGlobalSection: true`,
 * impostato solo da `runWriteContentPipeline`): un nodo `globalRef` dentro il
 * `content` di una Sezione Globale è sempre respinto, l'intero albero, mai un
 * salvataggio parziale.
 *
 * `BlockTreeValidatorService`/`BlockPropSanitizerService` sono istanze reali
 * (nessuna dipendenza esterna, stesso pattern di `forms.service.spec.ts`):
 * solo `DbService`/`AuditLogService`/`ExportService` sono mock, essendo i
 * soli confini esterni (DB, audit, coda BullMQ `static-export`).
 */
describe('GlobalSectionsService (unit) — ADR-55', () => {
  const AUTH: AuthInfo = { userId: 7, role: AppUserRoles.Manager, name: 'Editor', scopeId: null };

  const BASE_ROW = {
    id: 1,
    guid: 'aaaaaaaaaaaaaaaa',
    title: 'Header principale',
    slug: 'header-principale',
    layoutSlot: GlobalSectionLayoutSlot.None,
    isSticky: false,
    content: { version: ENVELOPE_VERSION, blocks: [] },
    version: 3,
    isActive: true,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    createdBy: 7,
    updatedBy: 7,
  };

  let service: GlobalSectionsService;
  let insertValuesMock: jest.Mock;
  let insertReturningMock: jest.Mock;
  let updateSetMock: jest.Mock;
  let updateWhereMock: jest.Mock;
  let findFirstMock: jest.Mock;
  let dbMock: {
    query: { globalSectionEntity: { findFirst: jest.Mock } };
    insert: jest.Mock;
    update: jest.Mock;
  };
  let auditLogService: { log: jest.Mock };
  let exportService: { enqueueFullSiteExport: jest.Mock };

  /** Costruisce l'envelope `{version, blocks}` con un singolo nodo `globalRef` (ADR-55 § 1). */
  function contentWithGlobalRef(guid = '0123456789abcdef'): Record<string, unknown> {
    return {
      version: ENVELOPE_VERSION,
      blocks: [
        { id: 'gr1', type: 'globalRef', v: 1, props: { globalSectionGuid: guid }, children: [] },
      ],
    };
  }

  /** Envelope vuoto valido, per gli scenari in cui il contenuto non è l'oggetto sotto test. */
  function emptyContent(): Record<string, unknown> {
    return { version: ENVELOPE_VERSION, blocks: [] };
  }

  beforeEach(() => {
    insertReturningMock = jest.fn().mockResolvedValue([{ ...BASE_ROW }]);
    insertValuesMock = jest.fn().mockReturnValue({ returning: insertReturningMock });

    updateWhereMock = jest.fn();
    updateSetMock = jest.fn().mockReturnValue({ where: updateWhereMock });

    findFirstMock = jest.fn().mockResolvedValue({ ...BASE_ROW });

    dbMock = {
      query: { globalSectionEntity: { findFirst: findFirstMock } },
      insert: jest.fn().mockReturnValue({ values: insertValuesMock }),
      update: jest.fn().mockReturnValue({ set: updateSetMock }),
    };

    auditLogService = { log: jest.fn().mockResolvedValue(undefined) };
    exportService = { enqueueFullSiteExport: jest.fn().mockResolvedValue(undefined) };

    service = new GlobalSectionsService(
      { db: dbMock } as unknown as DbService,
      auditLogService as unknown as AuditLogService,
      new BlockTreeValidatorService(),
      new BlockPropSanitizerService(),
      exportService as unknown as ExportService,
      DEFAULT_BLOCK_REGISTRY,
    );
  });

  // ─── create() ────────────────────────────────────────────────────────────

  describe('create()', () => {
    it('happy path: un content ordinario (nessun globalRef, vietato dentro una Sezione Globale) è persistito e accoda sempre un full-site export, anche con layoutSlot di default "none"', async () => {
      const dto: CreateGlobalSectionDto = {
        title: 'Blocco promo',
        content: {
          version: ENVELOPE_VERSION,
          blocks: [
            {
              id: 'h1',
              type: 'heading',
              v: 1,
              props: { level: 'h2', text: 'Promo' },
              children: [],
            },
          ],
        },
      };

      const result = await service.create(dto, AUTH);

      expect(result.guid).toBe(BASE_ROW.guid);
      expect(insertValuesMock).toHaveBeenCalledTimes(1);
      const insertedValues = insertValuesMock.mock.calls[0][0] as Record<string, unknown>;
      expect(insertedValues.layoutSlot).toBe(GlobalSectionLayoutSlot.None);
      expect(exportService.enqueueFullSiteExport).toHaveBeenCalledTimes(1);
    });

    it('un globalRef nel content di una Sezione Globale è sempre respinto (BLOCK_TYPE_NOT_ALLOWED_IN_GLOBAL_SECTION, divieto di ciclo per contratto, ADR-55): nessun insert, nessun export accodato — vale anche se il guid referenziato ha forma valida', async () => {
      const dto: CreateGlobalSectionDto = {
        title: 'Sezione con ciclo vietato',
        content: contentWithGlobalRef(),
      };

      // `runWriteContentPipeline` imposta sempre `insideGlobalSection: true`
      // per questo servizio (mai da PagesService): un `globalRef`, anche con
      // guid di forma valida, non è mai un content ammesso per una Sezione
      // Globale — a differenza del contenuto di una Pagina.
      await expect(service.create(dto, AUTH)).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'BLOCK_TYPE_NOT_ALLOWED_IN_GLOBAL_SECTION' }),
      });

      expect(insertValuesMock).not.toHaveBeenCalled();
      expect(exportService.enqueueFullSiteExport).not.toHaveBeenCalled();
    });

    it('un tipo di blocco sconosciuto nel content è respinto per intero (400), nessun insert parziale', async () => {
      const dto: CreateGlobalSectionDto = {
        title: 'Sezione con blocco sconosciuto',
        content: {
          version: ENVELOPE_VERSION,
          blocks: [{ id: 'x1', type: 'nonEsiste', v: 1, props: {}, children: [] }],
        },
      };

      await expect(service.create(dto, AUTH)).rejects.toBeInstanceOf(BadRequestException);
      expect(insertValuesMock).not.toHaveBeenCalled();
      expect(exportService.enqueueFullSiteExport).not.toHaveBeenCalled();
    });
  });

  // ─── update() ────────────────────────────────────────────────────────────

  describe('update()', () => {
    it('un aggiornamento di content con layoutSlot "none" (non solo header/footer) accoda comunque il full-site export (fix ADR-55)', async () => {
      updateWhereMock.mockReturnValue({
        returning: jest.fn().mockResolvedValue([{ ...BASE_ROW, version: 4, content: emptyContent() }]),
      });
      const dto: UpdateGlobalSectionDto = { version: 3, content: emptyContent() };

      await service.update(BASE_ROW.guid, dto, AUTH);

      expect(exportService.enqueueFullSiteExport).toHaveBeenCalledTimes(1);
    });

    it('un aggiornamento che tocca solo il titolo (né content né layoutSlot) NON accoda un export: solo i due campi rilevanti lo innescano', async () => {
      updateWhereMock.mockReturnValue({
        returning: jest.fn().mockResolvedValue([{ ...BASE_ROW, version: 4, title: 'Nuovo titolo' }]),
      });
      const dto: UpdateGlobalSectionDto = { version: 3, title: 'Nuovo titolo' };

      await service.update(BASE_ROW.guid, dto, AUTH);

      expect(exportService.enqueueFullSiteExport).not.toHaveBeenCalled();
    });

    it('version obsoleta (0 righe aggiornate) produce 409 GLOBAL_SECTION_VERSION_CONFLICT, nessun export accodato', async () => {
      updateWhereMock.mockReturnValue({ returning: jest.fn().mockResolvedValue([]) });
      const dto: UpdateGlobalSectionDto = { version: 1, content: emptyContent() };

      await expect(service.update(BASE_ROW.guid, dto, AUTH)).rejects.toBeInstanceOf(
        ConflictException,
      );
      await expect(service.update(BASE_ROW.guid, dto, AUTH)).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'GLOBAL_SECTION_VERSION_CONFLICT' }),
      });
      expect(exportService.enqueueFullSiteExport).not.toHaveBeenCalled();
    });

    it('un globalRef aggiunto al content in update è respinto (stesso divieto di ciclo per contratto di create), nessun update eseguito né export accodato', async () => {
      const dto: UpdateGlobalSectionDto = { version: 3, content: contentWithGlobalRef() };

      await expect(service.update(BASE_ROW.guid, dto, AUTH)).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'BLOCK_TYPE_NOT_ALLOWED_IN_GLOBAL_SECTION' }),
      });
      expect(dbMock.update).not.toHaveBeenCalled();
      expect(exportService.enqueueFullSiteExport).not.toHaveBeenCalled();
    });
  });

  // ─── remove() ────────────────────────────────────────────────────────────

  describe('remove()', () => {
    it('il soft delete accoda sempre il full-site export, anche per una riga con layoutSlot "none" (fix ADR-55: non più ristretto a header/footer)', async () => {
      updateWhereMock.mockResolvedValue(undefined);

      await service.remove(BASE_ROW.guid, AUTH, '127.0.0.1');

      expect(updateSetMock).toHaveBeenCalledWith(
        expect.objectContaining({ isActive: false, updatedBy: AUTH.userId }),
      );
      expect(exportService.enqueueFullSiteExport).toHaveBeenCalledTimes(1);
      expect(auditLogService.log).toHaveBeenCalledWith(
        AUTH.userId,
        'global-sections.delete',
        'global_sections',
        BASE_ROW.guid,
        undefined,
        AUTH.impersonatedBy,
        '127.0.0.1',
      );
    });
  });

  // ─── nessun residuo della cache Redis pubblica eliminata da ADR-55 ──────

  it('il costruttore non richiede alcuna dipendenza da cache Redis pubblica (PublicGlobalSectionsCacheService rimosso): 6 parametri esatti, ultimo il registro blocchi', () => {
    // Verifica di forma, non di comportamento: `GlobalSectionsService.length`
    // conta i parametri dichiarati dal costruttore TypeScript compilato.
    expect(GlobalSectionsService.length).toBe(6);
  });
});
