import { Body, Controller, Get, Put, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { GuardAdmin, GuardManager, GuardSuperAdmin } from '../auth/guard';
import { SettingsService } from './settings.service';
import { ThemeConfigDto } from './dto/theme-config.dto';
import { MultilingualConfigDto } from './dto/multilingual-config.dto';
import { RevisionsRetentionDto } from './dto/revisions-retention.dto';
import { GlobalTokensDto } from './dto/global-tokens.dto';
import { GlobalKitDto } from './dto/global-kit.dto';
import { BreakpointsDto } from './dto/breakpoints.dto';
import { AuthInfo } from '../common/types';

/**
 * Endpoint dei settaggi globali di installazione (ADR-4, RFC-F05 § 1). Tema e
 * registro Locale servono a chiunque usi l'app: lettura e scrittura del tema
 * sono aperte a tutti i ruoli autenticati; la scrittura del registro Locale è
 * ristretta ad Admin+.
 */
@ApiTags('Settings')
@ApiBearerAuth('access-token')
@Controller('app/settings')
export class SettingsController {
  /** Inietta il service dei settaggi globali. */
  constructor(private readonly settingsService: SettingsService) {}

  /** Tema globale corrente (default di fabbrica se mai personalizzato). */
  @Get('theme')
  @ApiOperation({
    summary: "Tema globale dell'installazione (default di fabbrica se mai salvato)",
  })
  @ApiResponse({ status: 200, description: 'Configurazione tema corrente', type: ThemeConfigDto })
  async getTheme(): Promise<ThemeConfigDto> {
    return this.settingsService.getTheme();
  }

  /**
   * Salva il tema globale di installazione (SuperAdmin, audit logged).
   *
   * `GuardSuperAdmin` **ripristinato il 2026-09-11**: era stato rimosso dal
   * commit `8b272f7` insieme all'espansione del contratto a `version: 8`,
   * lasciando la rotta **senza alcun guard** — un qualunque utente autenticato,
   * ruolo `User` compreso, poteva riscrivere il tema dell'intero sito. Non era
   * una decisione: ADR-4 § 4 prescrive « solo `GuardSuperAdmin` », il JSDoc del
   * componente frontend continuava a dire SuperAdmin e il test e2e continuava
   * ad attendersi `403`. Nessuna ADR supera ADR-4 su questo punto: qui si
   * ripristina la conformità, non si prende una decisione nuova. Spostare la
   * soglia ad Admin resta possibile, ma con una ADR che superi ADR-4.
   */
  @Put('theme')
  @UseGuards(GuardSuperAdmin)
  @ApiOperation({ summary: 'Salva il tema globale (SuperAdmin only, registrato su audit log)' })
  @ApiResponse({ status: 200, description: 'Tema salvato', type: ThemeConfigDto })
  @ApiResponse({ status: 400, description: 'Payload non valido (hex, palette o versione)' })
  @ApiResponse({ status: 403, description: 'Ruolo inferiore a SuperAdmin' })
  async updateTheme(@Body() dto: ThemeConfigDto, @Req() req: Request): Promise<ThemeConfigDto> {
    const authInfo = req['authInfo'] as AuthInfo;
    return this.settingsService.updateTheme(dto, authInfo, req.ip);
  }

  /** Registro Locale attivi corrente (default di fabbrica se mai personalizzato). */
  @Get('multilingual')
  @ApiOperation({
    summary: 'Registro Locale attivi (default di fabbrica se mai salvato)',
  })
  @ApiResponse({
    status: 200,
    description: 'Registro Locale corrente',
    type: MultilingualConfigDto,
  })
  async getMultilingual(): Promise<MultilingualConfigDto> {
    return this.settingsService.getMultilingualConfig();
  }

  /** Salva il registro Locale attivi (Admin+, audit logged). */
  @Put('multilingual')
  @UseGuards(GuardAdmin)
  @ApiOperation({
    summary: 'Salva il registro Locale attivi (Admin+ only, registrato su audit log)',
  })
  @ApiResponse({ status: 200, description: 'Registro Locale salvato', type: MultilingualConfigDto })
  @ApiResponse({ status: 400, description: 'Il Locale di default non compare fra i Locale attivi' })
  @ApiResponse({ status: 403, description: 'Ruolo inferiore ad Admin' })
  async updateMultilingual(
    @Body() dto: MultilingualConfigDto,
    @Req() req: Request,
  ): Promise<MultilingualConfigDto> {
    const authInfo = req['authInfo'] as AuthInfo;
    return this.settingsService.updateMultilingualConfig(dto, authInfo, req.ip);
  }

  /** Politica di retention delle Revisioni corrente (ADR-61; default: potatura disattivata). */
  @Get('revisions-retention')
  @ApiOperation({
    summary: 'Retention delle Revisioni (default di fabbrica: potatura disattivata)',
  })
  @ApiResponse({
    status: 200,
    description: 'Politica di retention corrente',
    type: RevisionsRetentionDto,
  })
  async getRevisionsRetention(): Promise<RevisionsRetentionDto> {
    return this.settingsService.getRevisionsRetention();
  }

  /**
   * Salva la retention delle Revisioni (Admin+, audit logged, ADR-61 § 3).
   * Cambia **solo la policy**: non esiste e non deve esistere una rotta che
   * pota su richiesta — la rimozione è un processo di sistema
   * (`business-rules.md` § Revisioni regole 5-6).
   */
  @Put('revisions-retention')
  @UseGuards(GuardAdmin)
  @ApiOperation({
    summary: 'Salva la retention delle Revisioni (Admin+ only, registrato su audit log)',
  })
  @ApiResponse({
    status: 200,
    description: 'Politica di retention salvata',
    type: RevisionsRetentionDto,
  })
  @ApiResponse({ status: 400, description: 'retentionCount fuori dal range 0-1000' })
  @ApiResponse({ status: 403, description: 'Ruolo inferiore ad Admin' })
  async updateRevisionsRetention(
    @Body() dto: RevisionsRetentionDto,
    @Req() req: Request,
  ): Promise<RevisionsRetentionDto> {
    const authInfo = req['authInfo'] as AuthInfo;
    return this.settingsService.updateRevisionsRetention(dto, authInfo, req.ip);
  }

  /** Global Design Tokens correnti (default di fabbrica se mai personalizzati). Risorsa separata dal tema di ADR-4. */
  @Get('global-tokens')
  @ApiOperation({
    summary: 'Global Design Tokens del sito (default di fabbrica se mai salvati)',
  })
  @ApiResponse({ status: 200, description: 'Global Design Tokens correnti', type: GlobalTokensDto })
  async getGlobalTokens(): Promise<GlobalTokensDto> {
    return this.settingsService.getGlobalTokens();
  }

  /** Salva i Global Design Tokens del sito (Admin+, audit logged). */
  @Put('global-tokens')
  @UseGuards(GuardAdmin)
  @ApiOperation({
    summary: 'Salva i Global Design Tokens del sito (Admin+ only, registrato su audit log)',
  })
  @ApiResponse({ status: 200, description: 'Global Design Tokens salvati', type: GlobalTokensDto })
  @ApiResponse({ status: 400, description: 'Payload non valido (hex, font, unità o versione)' })
  @ApiResponse({ status: 403, description: 'Ruolo inferiore ad Admin' })
  async updateGlobalTokens(
    @Body() dto: GlobalTokensDto,
    @Req() req: Request,
  ): Promise<GlobalTokensDto> {
    const authInfo = req['authInfo'] as AuthInfo;
    return this.settingsService.updateGlobalTokens(dto, authInfo, req.ip);
  }

  /** Global Kit corrente (default di fabbrica se mai salvato). Qualunque ruolo autenticato (`SPEC-GLOBAL-KIT.md` § 2). */
  @Get('global-kit')
  @ApiOperation({ summary: 'Global Kit del sito (default di fabbrica se mai salvato)' })
  @ApiResponse({ status: 200, description: 'Global Kit corrente', type: GlobalKitDto })
  async getGlobalKit(): Promise<GlobalKitDto> {
    return this.settingsService.getGlobalKit();
  }

  /**
   * Salva il Global Kit (RBAC per-campo, `SPEC-GLOBAL-KIT.md` § 2): `GuardManager`
   * è solo la soglia minima di accesso alla rotta — Manager+ per `colors`/
   * `fonts`/`customFonts`/`customIcons`/`lightbox`, Admin+ per `themeStyle`/
   * `layout`/`customCode` (verificato dal service, **prima** della validazione
   * DTO). `@Body() body: Record<string, unknown>` è **deliberatamente non
   * tipizzato con `GlobalKitDto`**: il `ValidationPipe` globale valida solo i
   * parametri `@Body()` con un tipo di classe riconosciuto a runtime — usare un
   * tipo strutturale qui salta quella validazione automatica, permettendo al
   * service di eseguire il gate RBAC sul body grezzo e solo *poi* invocare
   * esplicitamente lo stesso `ValidationPipe` (vedi `SettingsService.
   * updateGlobalKit`).
   */
  @Put('global-kit')
  @UseGuards(GuardManager)
  @ApiOperation({
    summary:
      'Salva il Global Kit (Manager+ o Admin+ a seconda dei campi toccati, registrato su audit log)',
  })
  @ApiResponse({ status: 200, description: 'Global Kit salvato', type: GlobalKitDto })
  @ApiResponse({ status: 400, description: 'Payload non valido (schema, system, limiti)' })
  @ApiResponse({
    status: 403,
    description:
      "Ruolo inferiore ad Admin per themeStyle/layout/customCode, o inferiore a Manager per l'intera rotta",
  })
  @ApiResponse({ status: 409, description: 'Rimozione di un id colore/font system esistente' })
  async updateGlobalKit(
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
  ): Promise<GlobalKitDto> {
    const authInfo = req['authInfo'] as AuthInfo;
    return this.settingsService.updateGlobalKit(body, authInfo, req.ip);
  }

  /** Breakpoint configurabili correnti (default di fabbrica se mai salvati, ADR-76). */
  @Get('breakpoints')
  @ApiOperation({
    summary: 'Breakpoint responsive configurabili (default di fabbrica se mai salvati)',
  })
  @ApiResponse({ status: 200, description: 'Breakpoint correnti', type: BreakpointsDto })
  async getBreakpoints(): Promise<BreakpointsDto> {
    return this.settingsService.getBreakpoints();
  }

  /** Salva i breakpoint configurabili (Admin+, audit logged, ADR-76 § "Conseguenze"). */
  @Put('breakpoints')
  @UseGuards(GuardAdmin)
  @ApiOperation({
    summary: 'Salva i breakpoint responsive configurabili (Admin+ only, registrato su audit log)',
  })
  @ApiResponse({ status: 200, description: 'Breakpoint salvati', type: BreakpointsDto })
  @ApiResponse({ status: 400, description: 'Payload non valido' })
  @ApiResponse({ status: 403, description: 'Ruolo inferiore ad Admin' })
  async updateBreakpoints(
    @Body() dto: BreakpointsDto,
    @Req() req: Request,
  ): Promise<BreakpointsDto> {
    const authInfo = req['authInfo'] as AuthInfo;
    return this.settingsService.updateBreakpoints(dto, authInfo, req.ip);
  }
}
