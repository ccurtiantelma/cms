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
import { GuardAdmin } from '../auth/guard';
import { AuthInfo, PagesQueryParams } from '../common/types';
import { Pagination } from '../common/pagination';
import { PagesService } from './pages.service';
import { CreatePageDto } from './dto/create-page.dto';
import { UpdatePageDto } from './dto/update-page.dto';
import { PageDto } from './dto/page.dto';

/**
 * CRUD amministrativo delle Pagine (F01/T4). Nessun guard di ruolo su
 * GET/POST/PATCH: la soglia minima è `User` (chiunque autenticato), la
 * differenziazione "proprie righe" vs "tutte" è ownership per riga
 * (ADR-18), applicata nel service. `DELETE` richiede `Admin`+.
 */
@ApiTags('Pages')
@ApiBearerAuth('access-token')
@Controller('app/pages')
export class PagesController {
  /** Inietta il service CRUD delle Pagine. */
  constructor(private readonly pagesService: PagesService) {}

  /** Lista paginata delle Pagine. Un `User` vede solo le proprie (ADR-18 § D6). */
  @Get()
  @ApiOperation({ summary: 'Lista paginata delle Pagine (User: solo le proprie)' })
  @ApiQuery({ name: 'p', required: false, description: 'Pagina (default 1)' })
  @ApiQuery({ name: 'i', required: false, description: 'Elementi per pagina (default 20)' })
  @ApiQuery({ name: 'q', required: false, description: 'Ricerca testuale su titolo e slug' })
  @ApiQuery({
    name: 'o',
    required: false,
    description: 'Campo di ordinamento (title, slug, status, locale, createdAt, updatedAt)',
  })
  @ApiQuery({
    name: 'd',
    required: false,
    description: 'Direzione ordinamento (asc|desc, default desc)',
  })
  @ApiQuery({ name: 'status', required: false, description: 'Filtro per stato' })
  @ApiQuery({ name: 'locale', required: false, description: 'Filtro per locale' })
  @ApiResponse({ status: 200, description: 'Lista Pagine paginata' })
  async findAll(
    @Query('p') p: string,
    @Query('i') i: string,
    @Query('q') q: string,
    @Query('o') o: string,
    @Query('d') d: string,
    @Query('status') status: string,
    @Query('locale') locale: string,
    @Req() req: Request,
  ): Promise<Pagination<PageDto>> {
    const authInfo = req['authInfo'] as AuthInfo;
    const params: PagesQueryParams = {
      p: p ? parseInt(p, 10) : 1,
      i: i ? parseInt(i, 10) : 20,
      q,
      o,
      d,
      status,
      locale,
    };
    return this.pagesService.findAll(authInfo, params);
  }

  /** Crea una Pagina in `draft`. */
  @Post()
  @ApiOperation({ summary: 'Crea una Pagina in stato draft' })
  @ApiResponse({ status: 201, description: 'Pagina creata', type: PageDto })
  @ApiResponse({
    status: 400,
    description: 'Slug non valido/riservato, genitore inesistente o albero blocchi malformato',
  })
  @ApiResponse({ status: 409, description: 'Slug già in uso per questo locale/genitore' })
  async create(@Body() dto: CreatePageDto, @Req() req: Request): Promise<PageDto> {
    const authInfo = req['authInfo'] as AuthInfo;
    return this.pagesService.create(dto, authInfo);
  }

  /** Dettaglio di una Pagina, bozza corrente inclusa. */
  @Get(':guid')
  @ApiOperation({ summary: 'Dettaglio di una Pagina' })
  @ApiResponse({ status: 200, description: 'Pagina trovata', type: PageDto })
  @ApiResponse({ status: 403, description: 'La Pagina esiste ma non è del chiamante' })
  @ApiResponse({ status: 404, description: 'Pagina non trovata o eliminata' })
  async findOne(@Param('guid') guid: string, @Req() req: Request): Promise<PageDto> {
    const authInfo = req['authInfo'] as AuthInfo;
    return this.pagesService.findOne(guid, authInfo);
  }

  /**
   * Aggiorna la bozza. Richiede `version` nel body (lock ottimistico):
   * `409 PAGE_VERSION_CONFLICT` se non combacia più con la riga corrente.
   */
  @Patch(':guid')
  @ApiOperation({
    summary: 'Aggiorna la bozza di una Pagina (richiede version per il lock ottimistico)',
  })
  @ApiResponse({ status: 200, description: 'Bozza aggiornata', type: PageDto })
  @ApiResponse({
    status: 400,
    description: 'Slug non valido/riservato, ciclo di gerarchia o albero blocchi malformato',
  })
  @ApiResponse({ status: 403, description: 'Riga altrui, o propria ma non più in stato draft' })
  @ApiResponse({ status: 404, description: 'Pagina non trovata o eliminata' })
  @ApiResponse({
    status: 409,
    description: 'Slug già in uso, oppure version non più valida (conflitto di editing)',
  })
  async update(
    @Param('guid') guid: string,
    @Body() dto: UpdatePageDto,
    @Req() req: Request,
  ): Promise<PageDto> {
    const authInfo = req['authInfo'] as AuthInfo;
    return this.pagesService.update(guid, dto, authInfo);
  }

  /** Elimina (soft-delete) una Pagina — Admin+. */
  @Delete(':guid')
  @UseGuards(GuardAdmin)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Elimina (soft-delete) una Pagina (Admin+)' })
  @ApiResponse({ status: 204, description: 'Pagina eliminata' })
  @ApiResponse({ status: 404, description: 'Pagina non trovata o già eliminata' })
  async remove(@Param('guid') guid: string, @Req() req: Request): Promise<void> {
    const authInfo = req['authInfo'] as AuthInfo;
    await this.pagesService.remove(guid, authInfo, req.ip);
  }
}
