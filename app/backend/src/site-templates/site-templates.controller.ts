import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { GuardManager } from '../auth/guard';
import { AuthInfo, SiteTemplatesQueryParams } from '../common/types';
import { Pagination } from '../common/pagination';
import { SiteTemplatesService } from './site-templates.service';
import { CreateSiteTemplateDto } from './dto/create-site-template.dto';
import { UpdateSiteTemplateDto } from './dto/update-site-template.dto';
import { SiteTemplateResponseDto } from './dto/site-template.dto';

/**
 * CRUD amministrativo dei Template di tema (RFC-40 Opzione B, decisione
 * umana 2026-08-31). Nessuna ownership per riga: soglia unica `Manager`+ su
 * ogni endpoint, coerente con la riga di permessi "Gestire Menu, Template,
 * Sezioni globali" (`business-rules.md`).
 */
@ApiTags('Site Templates')
@ApiBearerAuth('access-token')
@Controller('app/site-templates')
@UseGuards(GuardManager)
export class SiteTemplatesController {
  /** Inietta il servizio applicativo dei Template di tema. */
  constructor(private readonly siteTemplatesService: SiteTemplatesService) {}

  /** Lista paginata dei Template di tema, filtrabile per tipo/lingua/stato di pubblicazione. */
  @Get()
  @ApiOperation({ summary: 'Lista paginata dei Template di tema' })
  @ApiQuery({ name: 'p', required: false, description: 'Pagina (default 1)' })
  @ApiQuery({ name: 'i', required: false, description: 'Elementi per pagina (default 20)' })
  @ApiQuery({ name: 'q', required: false, description: 'Ricerca testuale sul titolo' })
  @ApiQuery({ name: 'type', required: false, description: 'Filtro per tipo di Template' })
  @ApiQuery({ name: 'language', required: false, description: 'Filtro per lingua' })
  @ApiQuery({
    name: 'isPublished',
    required: false,
    description: 'Filtro per stato di pubblicazione',
  })
  @ApiQuery({
    name: 'o',
    required: false,
    description: 'Campo di ordinamento (title, type, language, priority, createdAt, updatedAt)',
  })
  @ApiQuery({
    name: 'd',
    required: false,
    description: 'Direzione ordinamento (asc|desc, default desc)',
  })
  @ApiResponse({ status: 200, description: 'Lista Template di tema paginata' })
  async findAll(
    @Query('p') p: string,
    @Query('i') i: string,
    @Query('q') q: string,
    @Query('type') type: string,
    @Query('language') language: string,
    @Query('isPublished') isPublished: string,
    @Query('o') o: string,
    @Query('d') d: string,
  ): Promise<Pagination<SiteTemplateResponseDto>> {
    const params: SiteTemplatesQueryParams = {
      p: p ? parseInt(p, 10) : 1,
      i: i ? parseInt(i, 10) : 20,
      q,
      type,
      language,
      isPublished: isPublished === undefined ? undefined : isPublished === 'true',
      o,
      d,
    };
    return this.siteTemplatesService.findAll(params);
  }

  /** Crea un Template di tema. */
  @Post()
  @ApiOperation({ summary: 'Crea un Template di tema' })
  @ApiResponse({ status: 201, description: 'Template creato', type: SiteTemplateResponseDto })
  @ApiResponse({ status: 400, description: 'Payload non valido o albero blocchi malformato' })
  async create(
    @Body() dto: CreateSiteTemplateDto,
    @Req() req: Request,
  ): Promise<SiteTemplateResponseDto> {
    const authInfo = req['authInfo'] as AuthInfo;
    return this.siteTemplatesService.create(dto, authInfo);
  }

  /** Dettaglio di un Template di tema. */
  @Get(':guid')
  @ApiOperation({ summary: 'Dettaglio di un Template di tema' })
  @ApiResponse({ status: 200, description: 'Template trovato', type: SiteTemplateResponseDto })
  @ApiResponse({ status: 404, description: 'Template non trovato o eliminato' })
  async findOne(@Param('guid') guid: string): Promise<SiteTemplateResponseDto> {
    return this.siteTemplatesService.findOne(guid);
  }

  /** Aggiorna un Template di tema (richiede `version` per il lock ottimistico). */
  @Patch(':guid')
  @ApiOperation({
    summary: 'Aggiorna un Template di tema (richiede version per il lock ottimistico)',
  })
  @ApiResponse({ status: 200, description: 'Template aggiornato', type: SiteTemplateResponseDto })
  @ApiResponse({ status: 400, description: 'Payload non valido o albero blocchi malformato' })
  @ApiResponse({ status: 404, description: 'Template non trovato o eliminato' })
  @ApiResponse({ status: 409, description: 'Version obsoleta' })
  async update(
    @Param('guid') guid: string,
    @Body() dto: UpdateSiteTemplateDto,
    @Req() req: Request,
  ): Promise<SiteTemplateResponseDto> {
    const authInfo = req['authInfo'] as AuthInfo;
    return this.siteTemplatesService.update(guid, dto, authInfo);
  }

  /** Elimina (soft-delete) un Template di tema. */
  @Delete(':guid')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Elimina (soft-delete) un Template di tema' })
  @ApiResponse({ status: 204, description: 'Template eliminato' })
  @ApiResponse({ status: 404, description: 'Template non trovato o già eliminato' })
  async remove(@Param('guid') guid: string, @Req() req: Request): Promise<void> {
    const authInfo = req['authInfo'] as AuthInfo;
    await this.siteTemplatesService.remove(guid, authInfo, req.ip);
  }
}
