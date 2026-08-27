import { Body, Controller, Get, Put, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { GuardAdmin, GuardSuperAdmin } from '../auth/guard';
import { SettingsService } from './settings.service';
import { ThemeConfigDto } from './dto/theme-config.dto';
import { MultilingualConfigDto } from './dto/multilingual-config.dto';
import { GlobalTokensDto } from './dto/global-tokens.dto';
import { AuthInfo } from '../common/types';

/**
 * Endpoint dei settaggi globali di installazione (ADR-4, RFC-F05 § 1). Tema e
 * registro Locale servono a chiunque usi l'app: la lettura è aperta a tutti i
 * ruoli autenticati (JWT middleware globale), la scrittura è ristretta
 * (SuperAdmin per il tema, Admin+ per il registro Locale).
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

  /** Salva il tema globale per tutti gli utenti (SuperAdmin only, audit logged). */
  @Put('theme')
  @UseGuards(GuardSuperAdmin)
  @ApiOperation({ summary: 'Salva il tema globale (SuperAdmin only, registrato su audit log)' })
  @ApiResponse({ status: 200, description: 'Tema salvato', type: ThemeConfigDto })
  @ApiResponse({ status: 400, description: 'Payload non valido (hex, palette o versione)' })
  @ApiResponse({ status: 403, description: 'Ruolo non SuperAdmin' })
  async updateTheme(@Body() dto: ThemeConfigDto, @Req() req: Request): Promise<ThemeConfigDto> {
    const authInfo = req['authInfo'] as AuthInfo;
    return this.settingsService.updateTheme(dto, authInfo, req.ip);
  }

  /** Registro Locale attivi corrente (default di fabbrica se mai personalizzato). */
  @Get('multilingual')
  @ApiOperation({
    summary: 'Registro Locale attivi (default di fabbrica se mai salvato)',
  })
  @ApiResponse({ status: 200, description: 'Registro Locale corrente', type: MultilingualConfigDto })
  async getMultilingual(): Promise<MultilingualConfigDto> {
    return this.settingsService.getMultilingualConfig();
  }

  /** Salva il registro Locale attivi (Admin+, audit logged). */
  @Put('multilingual')
  @UseGuards(GuardAdmin)
  @ApiOperation({ summary: 'Salva il registro Locale attivi (Admin+ only, registrato su audit log)' })
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
}
