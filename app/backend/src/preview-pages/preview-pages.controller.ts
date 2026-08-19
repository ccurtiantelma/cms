import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PreviewPagesService } from './preview-pages.service';
import { PagePreviewContentDto } from './dto/page-preview-content.dto';

/**
 * Superficie di lettura dell'anteprima di una bozza non pubblicata
 * (`api/v1/preview/pages/:token`, ADR-25 § 3, T3). Terzo prefisso accanto
 * ad `app/` e `public/`: escluso da `AuthMiddleware` in `app.module.ts`
 * (anonima per costruzione, il token stesso è la prova — non `app/`), e
 * separato da `public/pages` (quella superficie serve per contratto solo
 * `published`, ADR-24 § 2 — non `public/`). Nessuna cache Redis su questa
 * rotta: ogni lettura è fresca sul draft corrente.
 */
@ApiTags('Preview Pages')
@Controller('preview/pages')
export class PreviewPagesController {
  /** Inietta il service di verifica token + lettura della bozza. */
  constructor(private readonly previewPagesService: PreviewPagesService) {}

  /**
   * Verifica il token (firma, scadenza, `purpose`) e restituisce il
   * contenuto della bozza corrente della Pagina referenziata dal claim.
   * Ogni motivo di rifiuto collassa sullo stesso `404` uniforme, mai
   * `401`/`403` (ADR-25 § 3).
   */
  @Get(':token')
  @ApiOperation({ summary: 'Legge la bozza corrente di una Pagina tramite token di anteprima' })
  @ApiParam({
    name: 'token',
    description: 'JWT di anteprima emesso da POST app/pages/:guid/preview-token',
  })
  @ApiResponse({
    status: 200,
    description: 'Bozza corrente della Pagina',
    type: PagePreviewContentDto,
  })
  @ApiResponse({
    status: 404,
    description:
      'Token invalido, scaduto, purpose errato, o pagina inesistente/soft-eliminata (404 uniforme, mai 401/403)',
  })
  async getByToken(@Param('token') token: string): Promise<PagePreviewContentDto> {
    return this.previewPagesService.readByToken(token);
  }
}
