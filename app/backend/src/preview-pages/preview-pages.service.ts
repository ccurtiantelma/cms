import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { AppConstants } from '../common/app-constants';
import { PagesService, PagePreviewTokenPayload } from '../pages/pages.service';
import { PagePreviewContentDto } from './dto/page-preview-content.dto';

/** `purpose` fisso del JWT di anteprima (ADR-25 § 1): deve combaciare con quello emesso da `PagesService.issuePreviewToken`. */
const PAGE_PREVIEW_TOKEN_PURPOSE = 'page-preview' as const;

/**
 * Superficie di lettura dell'anteprima di una bozza non pubblicata
 * (ADR-25 § 3, T3). Terzo prefisso accanto ad `app/` e `public/`: non
 * richiede login (il token è la prova), e non passa da `public/` — quella
 * superficie è per costruzione solo `published` (ADR-24 § 2), fondervi
 * l'anteprima esporrebbe bozze dietro l'endpoint che serve contenuto
 * pubblico verificato a un eventuale bug di validazione.
 *
 * Ogni motivo di rifiuto (firma invalida, token scaduto, `purpose` errato,
 * Pagina inesistente o soft-eliminata) collassa sullo stesso `404`
 * indistinguibile, mai `401`/`403` (ADR-25 § 3, stessa logica del `404`
 * uniforme di ADR-24 § 3 per gli slug pubblici): un errore distinto
 * confermerebbe l'esistenza del token o della pagina a chi lo tenta a
 * caso.
 */
@Injectable()
export class PreviewPagesService {
  private readonly logger = new Logger(PreviewPagesService.name);

  /** Inietta `PagesService` per riusare la pipeline di lettura-tollerante della bozza (mai una lettura ad-hoc). */
  constructor(private readonly pagesService: PagesService) {}

  /**
   * Verifica firma + scadenza + `purpose` del token **prima** di ogni
   * lettura, poi legge `pages.draftContent` per il `pageGuid` del claim
   * attraverso {@link PagesService.findDraftForPreview}. Nessuna cache
   * Redis: ogni lettura è fresca (ADR-25 § 3), la bozza cambia in
   * continuazione.
   */
  async readByToken(token: string): Promise<PagePreviewContentDto> {
    const payload = this.verifyTokenOrThrow(token);

    const draft = await this.pagesService.findDraftForPreview(payload.pageGuid);
    if (!draft) {
      // Stesso `404` uniforme di un token invalido: nessuna distinzione
      // osservabile fra "token scaduto" e "pagina inesistente/eliminata"
      // (ADR-25 § 3).
      this.logger.warn(
        `Anteprima: token valido ma pagina guid=${payload.pageGuid} inesistente o non attiva (token prefix=${this.tokenPrefix(token)}...).`,
      );
      throw new NotFoundException();
    }

    return draft;
  }

  /**
   * Verifica sincrona del JWT con il segreto dedicato
   * (`AppConstants.pagePreviewTokenSecret`, mai quello di access/refresh) e
   * del claim `purpose`. Qualunque eccezione di `jsonwebtoken` (firma
   * invalida, scadenza, malformato) collassa sullo stesso `404`. Il token
   * non è mai loggato per intero (business-rules.md § Security), solo un
   * prefisso.
   */
  private verifyTokenOrThrow(token: string): PagePreviewTokenPayload {
    let decoded: unknown;
    try {
      decoded = jwt.verify(token, AppConstants.pagePreviewTokenSecret);
    } catch (err) {
      const reason = err instanceof Error ? err.name : 'unknown';
      this.logger.warn(
        `Anteprima: token non verificabile (${reason}, prefix=${this.tokenPrefix(token)}...).`,
      );
      throw new NotFoundException();
    }

    if (
      typeof decoded !== 'object' ||
      decoded === null ||
      (decoded as Record<string, unknown>).purpose !== PAGE_PREVIEW_TOKEN_PURPOSE ||
      typeof (decoded as Record<string, unknown>).pageGuid !== 'string'
    ) {
      this.logger.warn(
        `Anteprima: token con claim inattesi (prefix=${this.tokenPrefix(token)}...).`,
      );
      throw new NotFoundException();
    }

    return decoded as PagePreviewTokenPayload;
  }

  /** Solo un prefisso del token per il log (business-rules.md § Security), mai il valore per intero. */
  private tokenPrefix(token: string): string {
    return token.substring(0, 10);
  }
}
