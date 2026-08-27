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
import { AuthInfo, PaginationParams } from '../common/types';
import { Pagination } from '../common/pagination';
import { GlobalSectionsService } from './global-sections.service';
import { CreateGlobalSectionDto } from './dto/create-global-section.dto';
import { UpdateGlobalSectionDto } from './dto/update-global-section.dto';
import { GlobalSectionDto } from './dto/global-section.dto';

/**
 * CRUD amministrativo delle Sezioni Globali (F06, ADR-40). Nessuna
 * ownership per riga: soglia unica `Manager`+ su ogni endpoint, coerente
 * con l'editoriale di Pagine/Menu — non esiste nozione di "proprie" Sezioni
 * Globali.
 */
@ApiTags('Global Sections')
@ApiBearerAuth('access-token')
@Controller('app/global-sections')
@UseGuards(GuardManager)
export class GlobalSectionsController {
  constructor(private readonly globalSectionsService: GlobalSectionsService) {}

  /** Lista paginata delle Sezioni Globali. */
  @Get()
  @ApiOperation({ summary: 'Lista paginata delle Sezioni Globali' })
  @ApiQuery({ name: 'p', required: false, description: 'Pagina (default 1)' })
  @ApiQuery({ name: 'i', required: false, description: 'Elementi per pagina (default 20)' })
  @ApiQuery({ name: 'q', required: false, description: 'Ricerca testuale su titolo e slug' })
  @ApiQuery({
    name: 'o',
    required: false,
    description: 'Campo di ordinamento (title, slug, layoutSlot, createdAt, updatedAt)',
  })
  @ApiQuery({
    name: 'd',
    required: false,
    description: 'Direzione ordinamento (asc|desc, default desc)',
  })
  @ApiResponse({ status: 200, description: 'Lista Sezioni Globali paginata' })
  async findAll(
    @Query('p') p: string,
    @Query('i') i: string,
    @Query('q') q: string,
    @Query('o') o: string,
    @Query('d') d: string,
  ): Promise<Pagination<GlobalSectionDto>> {
    const params: PaginationParams = {
      p: p ? parseInt(p, 10) : 1,
      i: i ? parseInt(i, 10) : 20,
      q,
      o,
      d,
    };
    return this.globalSectionsService.findAll(params);
  }

  /** Crea una Sezione Globale. */
  @Post()
  @ApiOperation({ summary: 'Crea una Sezione Globale' })
  @ApiResponse({ status: 201, description: 'Sezione Globale creata', type: GlobalSectionDto })
  @ApiResponse({
    status: 400,
    description: 'Slug non valido/riservato o albero blocchi malformato',
  })
  @ApiResponse({ status: 409, description: 'Slug o layoutSlot già in uso' })
  async create(
    @Body() dto: CreateGlobalSectionDto,
    @Req() req: Request,
  ): Promise<GlobalSectionDto> {
    const authInfo = req['authInfo'] as AuthInfo;
    return this.globalSectionsService.create(dto, authInfo);
  }

  /** Dettaglio di una Sezione Globale. */
  @Get(':guid')
  @ApiOperation({ summary: 'Dettaglio di una Sezione Globale' })
  @ApiResponse({ status: 200, description: 'Sezione Globale trovata', type: GlobalSectionDto })
  @ApiResponse({ status: 404, description: 'Sezione Globale non trovata o eliminata' })
  async findOne(@Param('guid') guid: string): Promise<GlobalSectionDto> {
    return this.globalSectionsService.findOne(guid);
  }

  /** Aggiorna una Sezione Globale (richiede `version` per il lock ottimistico). */
  @Patch(':guid')
  @ApiOperation({
    summary: 'Aggiorna una Sezione Globale (richiede version per il lock ottimistico)',
  })
  @ApiResponse({ status: 200, description: 'Sezione Globale aggiornata', type: GlobalSectionDto })
  @ApiResponse({
    status: 400,
    description: 'Slug non valido/riservato o albero blocchi malformato',
  })
  @ApiResponse({ status: 404, description: 'Sezione Globale non trovata o eliminata' })
  @ApiResponse({
    status: 409,
    description: 'Version obsoleta, oppure slug/layoutSlot già in uso',
  })
  async update(
    @Param('guid') guid: string,
    @Body() dto: UpdateGlobalSectionDto,
    @Req() req: Request,
  ): Promise<GlobalSectionDto> {
    const authInfo = req['authInfo'] as AuthInfo;
    return this.globalSectionsService.update(guid, dto, authInfo);
  }

  /** Elimina (soft-delete) una Sezione Globale. */
  @Delete(':guid')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Elimina (soft-delete) una Sezione Globale' })
  @ApiResponse({ status: 204, description: 'Sezione Globale eliminata' })
  @ApiResponse({ status: 404, description: 'Sezione Globale non trovata o già eliminata' })
  async remove(@Param('guid') guid: string, @Req() req: Request): Promise<void> {
    const authInfo = req['authInfo'] as AuthInfo;
    await this.globalSectionsService.remove(guid, authInfo, req.ip);
  }
}
