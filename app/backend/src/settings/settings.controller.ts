import { Body, Controller, Get, Put, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { GuardSuperAdmin } from '../auth/guard';
import { SettingsService } from './settings.service';
import { ThemeConfigDto } from './dto/theme-config.dto';
import { AuthInfo } from '../common/types';

/**
 * Endpoint dei settaggi globali di installazione (ADR-4). Il tema serve a
 * chiunque usi l'app: la lettura è aperta a tutti i ruoli autenticati (JWT
 * middleware globale), la scrittura al solo SuperAdmin.
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
}
