import {
  BadRequestException,
  Controller,
  Get,
  HttpStatus,
  Param,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Response } from 'express';
import { PublicPagesService } from './public-pages.service';
import { PublicPageDto } from './dto/public-page.dto';
import { PublicPageGuidResolutionDto } from './dto/public-page-guid-resolution.dto';
import { canonicalizePublicPath } from './public-path.util';
import { SettingsService } from '../settings/settings.service';
import { GlobalTokensDto } from '../settings/dto/global-tokens.dto';
import { ThemeConfigDto } from '../settings/dto/theme-config.dto';

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
@Controller('public')
@UseGuards(ThrottlerGuard)
export class PublicPagesController {
  /** Inietta il service di risoluzione pubblica e il service impostazioni (Global Tokens). */
  constructor(
    private readonly publicPagesService: PublicPagesService,
    private readonly settingsService: SettingsService,
  ) {}

  /**
   * Risolve `?path=` alla Pagina pubblicata corrispondente. `path` è
   * obbligatorio; forma non canonica (maiuscole, slash finale) → `308` verso
   * la forma canonica, senza leggere il database.
   */
  @Get('pages')
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

  /**
   * Risolve un `guid` di Pagina al proprio percorso pubblico canonico
   * (ADR-52 § 4, direzione inversa di `?path=`): usata dalla pipeline SSR di
   * `app/public-site` per trasformare il `pageGuid` persistito da un
   * `navMenuItem` in un `href`, solo se la Pagina referenziata è pubblicata.
   */
  @Get('pages/by-guid/:guid')
  @Throttle({ public: { limit: 300, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Risolve il guid di una Pagina pubblicata al proprio percorso pubblico canonico',
  })
  @ApiParam({ name: 'guid', description: 'Identificatore amministrativo della Pagina (16 esadecimali)' })
  @ApiResponse({
    status: 200,
    description: 'Percorso pubblico canonico della Pagina pubblicata',
    type: PublicPageGuidResolutionDto,
  })
  @ApiResponse({
    status: 404,
    description:
      'Pagina inesistente, non pubblicata, non attiva, guid malformato, o catena di antenati non risolvibile',
  })
  async getPathByGuid(@Param('guid') guid: string): Promise<PublicPageGuidResolutionDto> {
    return this.publicPagesService.resolveByGuid(guid);
  }

  /**
   * Espone i Global Tokens (design tokens) per il rendering SSR del sito
   * pubblico. Anonima, sola lettura: riusa {@link SettingsService.getGlobalTokens}
   * (fallback su `DEFAULT_GLOBAL_TOKENS` se non è mai stata salvata alcuna
   * riga `app_settings` con chiave `global_tokens`), stessa fonte dati della
   * rotta admin `GET app/settings/global-tokens`.
   */
  @Get('settings/global-tokens')
  @Throttle({ public: { limit: 300, ttl: 60_000 } })
  @ApiOperation({ summary: 'Restituisce i Global Tokens per il rendering pubblico (SSR)' })
  @ApiResponse({ status: 200, description: 'Global Tokens correnti', type: GlobalTokensDto })
  async getGlobalTokens(): Promise<GlobalTokensDto> {
    return this.settingsService.getGlobalTokens();
  }

  /** Espone la configurazione del tema al sito pubblico senza autenticazione. */
  @Get('settings/theme')
  @Throttle({ public: { limit: 300, ttl: 60_000 } })
  @ApiOperation({ summary: 'Restituisce la configurazione del tema per il sito pubblico' })
  @ApiResponse({ status: 200, description: 'Configurazione tema corrente', type: ThemeConfigDto })
  async getThemeConfig(): Promise<ThemeConfigDto> {
    return this.settingsService.getThemeConfig();
  }
}
