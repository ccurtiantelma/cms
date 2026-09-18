import { Controller, Get, HttpStatus, Res, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Response } from 'express';
import { SettingsService } from './settings.service';
import { compileGlobalKitCss } from './global-kit-css.compiler';

/**
 * Superficie pubblica di lettura del Global Kit compilato in CSS
 * (`GET public/global-kit.css`, `SPEC-GLOBAL-KIT.md` § 2/§ 3, `ADR-77-global-
 * kit-schema.md` § "Decisione" punto 3). Anonima (esclusa da `AuthMiddleware`
 * in `app.module.ts`, prefisso `public/*path`), sola lettura, rate limiting
 * proprio (throttler `public`, stesso di `PublicMediaController`).
 *
 * **Scelta di design**: il CSS è compilato **live** a ogni richiesta da
 * `SettingsService.getGlobalKit()` (una singola lettura `app_settings`,
 * nessuna paginazione, sempre coerente con l'ultimo `PUT` riuscito) invece di
 * servire il file `global-kit.<hash>.css` scritto su disco da
 * `SettingsService.updateGlobalKit()` — quel file resta scritto e serve alla
 * pipeline di export statico (`SPEC-GLOBAL-KIT.md` § 3 punto 6, riferimento
 * stabile da linkare nell'HTML esportato), ma **non** è il file servito da
 * questa rotta amministrativa/anteprima. `SPEC-GLOBAL-KIT.md` § 2 suggerisce
 * esplicitamente questa alternativa ("più semplice, sempre corretto, un solo
 * settings singleton da leggere") quando non serve il fingerprint nell'URL —
 * qui non serve: questa rotta non è quella referenziata dall'HTML statico
 * esportato (quello userà l'`href` fingerprinted scritto dalla pipeline), è
 * la superficie di anteprima/consumo diretto del kit corrente.
 */
@ApiTags('Public Global Kit')
@Controller('public')
@UseGuards(ThrottlerGuard)
export class GlobalKitPublicController {
  /** Inietta il service dei settaggi globali (letto per `getGlobalKit()`). */
  constructor(private readonly settingsService: SettingsService) {}

  /** Serve il CSS compilato del Global Kit corrente. Nessuna autenticazione. */
  @Get('global-kit.css')
  @Throttle({ public: { limit: 300, ttl: 60_000 } })
  @ApiOperation({ summary: 'CSS compilato del Global Kit corrente (nessuna autenticazione)' })
  @ApiResponse({ status: 200, description: 'Foglio di stile :root + regole di tema + @font-face' })
  async getGlobalKitCss(@Res() res: Response): Promise<void> {
    const kit = await this.settingsService.getGlobalKit();
    const css = compileGlobalKitCss(kit);
    res.setHeader('Content-Type', 'text/css; charset=utf-8');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'public, max-age=60');
    res.status(HttpStatus.OK).send(css);
  }
}
