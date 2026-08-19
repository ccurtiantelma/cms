import * as jwt from 'jsonwebtoken';
import { NotFoundException } from '@nestjs/common';
import { AppConstants } from '../../../src/common/app-constants';
import { PreviewPagesService } from '../../../src/preview-pages/preview-pages.service';
import type { PagesService } from '../../../src/pages/pages.service';
import type { PagePreviewContentDto } from '../../../src/preview-pages/dto/page-preview-content.dto';

/**
 * Unit test di `PreviewPagesService.readByToken` (ADR-25 § 3, T6): scadenza,
 * `purpose` errato e firma invalida devono collassare TUTTI sullo stesso
 * esito osservabile — un `NotFoundException` (404) lanciato dal service,
 * mai un'eccezione distinta e mai la sola verifica che `jwt.verify` lanci
 * internamente (quella è un dettaglio di libreria, non il contratto che
 * conta: il contratto è "il service risponde 404 in ogni caso").
 *
 * `PagesService` è mockato: solo `findDraftForPreview` è rilevante qui,
 * l'unico metodo che `PreviewPagesService` invoca (vedi `preview-pages.module.ts`).
 * Nessun `any`: il mock implementa la sola porzione di `PagesService` usata,
 * tipizzata esplicitamente e passata via cast dichiarato.
 */
describe('PreviewPagesService.readByToken (unit) — 404 uniforme su ogni motivo di rifiuto (ADR-25 § 3)', () => {
  const PAGE_GUID = 'a1b2c3d4e5f6a7b8';
  const VALID_DRAFT: PagePreviewContentDto = {
    title: 'Bozza di test',
    slug: 'bozza-di-test',
    locale: 'it-IT',
    content: { version: 1, blocks: [] },
    seo: {},
  };

  /** Mock minimo di `PagesService`: solo il metodo realmente chiamato dal service sotto test. */
  function buildPagesServiceMock(
    findDraftForPreview: (pageGuid: string) => Promise<PagePreviewContentDto | null>,
  ): PagesService {
    return { findDraftForPreview } as unknown as PagesService;
  }

  function signValidToken(overrides: Partial<{ pageGuid: string; purpose: string }> = {}): string {
    return jwt.sign(
      { pageGuid: overrides.pageGuid ?? PAGE_GUID, purpose: overrides.purpose ?? 'page-preview' },
      AppConstants.pagePreviewTokenSecret,
      { expiresIn: '15m' },
    );
  }

  // ─── Happy path ───────────────────────────────────────────────────────

  it('token valido, purpose corretto, pagina esistente: risolve col contenuto della bozza corrente', async () => {
    const pagesServiceMock = buildPagesServiceMock(async (guid) => {
      expect(guid).toBe(PAGE_GUID);
      return VALID_DRAFT;
    });
    const service = new PreviewPagesService(pagesServiceMock);

    const result = await service.readByToken(signValidToken());

    expect(result).toEqual(VALID_DRAFT);
  });

  // ─── I tre motivi di rifiuto del token, isolati ──────────────────────

  describe("ogni motivo di rifiuto collassa sullo stesso 404 uniforme, mai su un'altra eccezione", () => {
    it('token scaduto (exp nel passato): 404 uniforme, non un errore distinto di "scaduto"', async () => {
      const expiredToken = jwt.sign(
        { pageGuid: PAGE_GUID, purpose: 'page-preview' },
        AppConstants.pagePreviewTokenSecret,
        { expiresIn: '-1s' }, // già scaduto al momento della firma
      );
      const pagesServiceMock = buildPagesServiceMock(async () => VALID_DRAFT);
      const service = new PreviewPagesService(pagesServiceMock);

      await expect(service.readByToken(expiredToken)).rejects.toBeInstanceOf(NotFoundException);
      // La pipeline non deve nemmeno arrivare a leggere il draft: il rifiuto
      // avviene in fase di verifica del token, prima di ogni lettura.
    });

    it('purpose errato (token firmato correttamente ma per un altro scopo): 404 uniforme', async () => {
      const wrongPurposeToken = signValidToken({ purpose: 'access-token' });
      const pagesServiceMock = buildPagesServiceMock(async () => VALID_DRAFT);
      const service = new PreviewPagesService(pagesServiceMock);

      await expect(service.readByToken(wrongPurposeToken)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('firma invalida (stesso payload, segreto diverso): 404 uniforme', async () => {
      const tokenSignedWithWrongSecret = jwt.sign(
        { pageGuid: PAGE_GUID, purpose: 'page-preview' },
        'un-segreto-completamente-diverso-e-non-quello-di-app-constants',
        { expiresIn: '15m' },
      );
      const pagesServiceMock = buildPagesServiceMock(async () => VALID_DRAFT);
      const service = new PreviewPagesService(pagesServiceMock);

      await expect(service.readByToken(tokenSignedWithWrongSecret)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('token manomesso (payload alterato dopo la firma): 404 uniforme', async () => {
      const validToken = signValidToken();
      const [header, , signature] = validToken.split('.');
      const tamperedPayload = Buffer.from(
        JSON.stringify({ pageGuid: 'ffffffffffffffff', purpose: 'page-preview' }),
      ).toString('base64url');
      const tamperedToken = `${header}.${tamperedPayload}.${signature}`;
      const pagesServiceMock = buildPagesServiceMock(async () => VALID_DRAFT);
      const service = new PreviewPagesService(pagesServiceMock);

      await expect(service.readByToken(tamperedToken)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('token sintatticamente malformato (non un JWT): 404 uniforme', async () => {
      const pagesServiceMock = buildPagesServiceMock(async () => VALID_DRAFT);
      const service = new PreviewPagesService(pagesServiceMock);

      await expect(service.readByToken('non-e-un-jwt')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('claim pageGuid mancante/non stringa: 404 uniforme (claim inattesi)', async () => {
      const malformedClaimToken = jwt.sign(
        { purpose: 'page-preview' }, // pageGuid assente
        AppConstants.pagePreviewTokenSecret,
        { expiresIn: '15m' },
      );
      const pagesServiceMock = buildPagesServiceMock(async () => VALID_DRAFT);
      const service = new PreviewPagesService(pagesServiceMock);

      await expect(service.readByToken(malformedClaimToken)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  // ─── Pagina inesistente/soft-eliminata dietro un token altrimenti valido ─

  it('token valido ma pagina inesistente/soft-eliminata (findDraftForPreview -> null): 404 uniforme, indistinguibile dagli altri casi', async () => {
    const pagesServiceMock = buildPagesServiceMock(async () => null);
    const service = new PreviewPagesService(pagesServiceMock);

    await expect(service.readByToken(signValidToken())).rejects.toBeInstanceOf(NotFoundException);
  });
});
