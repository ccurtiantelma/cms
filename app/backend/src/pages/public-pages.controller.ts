import {
  BadRequestException,
  Controller,
  Get,
  HttpStatus,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Response } from 'express';
import { PublicPagesService } from './public-pages.service';
import { PublicPageDto } from './dto/public-page.dto';
import { canonicalizePublicPath } from './public-path.util';

/**
 * Superficie pubblica di lettura delle Pagine (`api/v1/public/pages`,
 * F03/T2, ADR-24). Anonima (esclusa da `AuthMiddleware` in `app.module.ts`),
 * sola lettura, solo contenuto `published`. Rate limiting proprio
 * (`@Throttle`, throttler `public`): l'endpoint non esiste senza — vedi
 * `app.module.ts` per la definizione del throttler.
 *
 * `@Res()` (non `passthrough`) è necessario per poter rispondere `308` con
 * `Location` sulla canonicalizzazione del percorso (ADR-24 § 4): un
 * controller Nest "normale" non redirige un endpoint JSON senza controllo
 * esplicito della response Express.
 */
@ApiTags('Public Pages')
@Controller('public/pages')
@UseGuards(ThrottlerGuard)
export class PublicPagesController {
  /** Inietta il service di risoluzione pubblica. */
  constructor(private readonly publicPagesService: PublicPagesService) {}

  /**
   * Risolve `?path=` alla Pagina pubblicata corrispondente. `path` è
   * obbligatorio; forma non canonica (maiuscole, slash finale) → `308` verso
   * la forma canonica, senza leggere il database.
   */
  @Get()
  @Throttle({ public: { limit: 300, ttl: 60_000 } })
  @ApiOperation({ summary: 'Risolve un percorso pubblico alla Pagina pubblicata corrispondente' })
  @ApiQuery({
    name: 'path',
    required: true,
    description: 'Percorso pubblico da risolvere, es. "/chi-siamo" o "/" per la home',
  })
  @ApiResponse({ status: 200, description: 'Pagina pubblicata trovata', type: PublicPageDto })
  @ApiResponse({
    status: 308,
    description: 'Percorso non in forma canonica: redirect verso la forma canonica',
  })
  @ApiResponse({
    status: 404,
    description:
      'Nessuna Pagina pubblicata a questo percorso (inesistente, non pubblicata, o non servibile)',
  })
  async getPage(@Query('path') rawPath: string, @Res() res: Response): Promise<void> {
    if (!rawPath) {
      throw new BadRequestException({
        message: 'Il parametro "path" è obbligatorio.',
        code: 'PUBLIC_PAGE_PATH_REQUIRED',
      });
    }

    const canonicalPath = canonicalizePublicPath(rawPath);
    if (canonicalPath !== rawPath) {
      // Solo trasformazione di stringa: nessuna lettura dal database in
      // questa richiesta (ADR-24 § 4).
      res
        .status(HttpStatus.PERMANENT_REDIRECT)
        .set('Location', `/api/v1/public/pages?path=${canonicalPath}`)
        .send();
      return;
    }

    const dto = await this.publicPagesService.resolveByPath(canonicalPath);
    res.status(HttpStatus.OK).json(dto);
  }
}
