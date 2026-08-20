import { Controller, Get, HttpStatus, Param, Res, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Response } from 'express';
import { PublicMediaService } from './public-media.service';

/**
 * Superficie pubblica di lettura dei media editoriali (`api/v1/public/media`,
 * ADR-27). Anonima (esclusa da `AuthMiddleware` in `app.module.ts`, prefisso
 * `public/*path`), sola lettura, rate limiting proprio (throttler `public`,
 * come `PublicPagesController`). Nessuna cache Redis (ADR-27 § 5): la
 * risposta porta `Cache-Control` immutabile e lo streaming avviene sempre
 * dal driver di storage.
 *
 * `@Res()` (non `passthrough`) per poter impostare gli header di sicurezza
 * (`X-Content-Type-Options`, `Content-Disposition`) e scrivere il body
 * binario direttamente, come `FilesController.download`.
 */
@ApiTags('Public Media')
@Controller('public/media')
@UseGuards(ThrottlerGuard)
export class PublicMediaController {
  /** Inietta il service di lettura pubblica dei media. */
  constructor(private readonly publicMediaService: PublicMediaService) {}

  /**
   * Serve il blob di un media editoriale pubblicato. 404 uniforme per ogni
   * caso non servibile (ADR-27 § 1): mai `403`, mai un messaggio che
   * distingua `guid` inesistente da formato non ammesso.
   */
  @Get(':guid')
  @Throttle({ public: { limit: 300, ttl: 60_000 } })
  @ApiOperation({ summary: 'Serve il blob di un media editoriale pubblicato (immagine)' })
  @ApiParam({ name: 'guid', description: 'Identificatore pubblico del file (16 esadecimali)' })
  @ApiResponse({ status: 200, description: "Blob dell'immagine, Content-Type dai byte reali" })
  @ApiResponse({
    status: 404,
    description:
      'Media inesistente, non editoriale (entity <> "page-media"), soft-eliminato, o formato non riconosciuto come raster (SVG compreso)',
  })
  async getMedia(@Param('guid') guid: string, @Res() res: Response): Promise<void> {
    const { buffer, mimeType } = await this.publicMediaService.serve(guid);
    res.setHeader('Content-Type', mimeType);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.status(HttpStatus.OK).send(buffer);
  }
}
