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
import { GuardAdmin, GuardManager } from '../auth/guard';
import { AuthInfo, PagesQueryParams, PaginationParams } from '../common/types';
import { Pagination } from '../common/pagination';
import { PagesService } from './pages.service';
import { CreatePageDto } from './dto/create-page.dto';
import { CreateTranslationDto } from './dto/create-translation.dto';
import { UpdatePageDto } from './dto/update-page.dto';
import { ChangeStatusDto } from './dto/change-status.dto';
import { PageDto } from './dto/page.dto';
import { PageRevisionDetailDto, PageRevisionSummaryDto } from './dto/page-revision.dto';
import { PageTranslationDto } from './dto/page-translation.dto';
import { PagePreviewTokenDto } from './dto/page-preview-token.dto';

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

  /**
   * Crea una traduzione da una Pagina sorgente (RFC-F05 § 3). Nessun
   * `@UseGuards` di ruolo: stessa soglia di `create` — chiunque possa creare
   * una Pagina può creare una traduzione.
   */
  @Post(':guid/translations')
  @ApiOperation({ summary: 'Crea una traduzione da una Pagina sorgente' })
  @ApiResponse({ status: 201, description: 'Traduzione creata', type: PageDto })
  @ApiResponse({ status: 400, description: 'Locale non fra i Locale attivi' })
  @ApiResponse({ status: 404, description: 'Pagina sorgente non trovata o eliminata' })
  @ApiResponse({ status: 409, description: 'Esiste già una traduzione per questo locale' })
  async createTranslation(
    @Param('guid') guid: string,
    @Body() dto: CreateTranslationDto,
    @Req() req: Request,
  ): Promise<PageDto> {
    const authInfo = req['authInfo'] as AuthInfo;
    return this.pagesService.createTranslation(guid, dto, authInfo);
  }

  /**
   * Elenco delle righe sorelle attive del gruppo di traduzione, sorgente
   * inclusa (RFC-F05 § 3, dipendenza aperta di T6 — switcher lingua
   * dell'editor). Nessun `@UseGuards` di ruolo: stessa soglia minima di
   * `findOne`/`createTranslation` — chi può vedere/creare una traduzione
   * può anche listare il gruppo. Dichiarato prima di `:guid` (un solo
   * segmento) per prudenza di routing, coerente con `POST :guid/translations`.
   */
  @Get(':guid/translations')
  @ApiOperation({ summary: 'Elenco delle traduzioni del gruppo (bozze incluse), sorgente inclusa' })
  @ApiResponse({
    status: 200,
    description: 'Traduzioni del gruppo (bozze incluse)',
    type: [PageTranslationDto],
  })
  @ApiResponse({ status: 404, description: 'Pagina sorgente non trovata o eliminata' })
  async listTranslations(@Param('guid') guid: string): Promise<PageTranslationDto[]> {
    return this.pagesService.listTranslations(guid);
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

  /**
   * Emette un token di anteprima della bozza corrente (ADR-25 § 1). Nessun
   * `@UseGuards` di ruolo: stessa ownership per riga dell'aggiornamento
   * della bozza (`update`), applicata nel service — un `User` può generare
   * l'anteprima solo delle proprie pagine in stato `draft`.
   */
  @Post(':guid/preview-token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Emette un token di anteprima della bozza corrente (15 minuti, non rinnovabile)',
  })
  @ApiResponse({ status: 200, description: 'Token emesso', type: PagePreviewTokenDto })
  @ApiResponse({ status: 403, description: 'Riga altrui, o propria ma non più in stato draft' })
  @ApiResponse({ status: 404, description: 'Pagina non trovata o eliminata' })
  async issuePreviewToken(
    @Param('guid') guid: string,
    @Req() req: Request,
  ): Promise<PagePreviewTokenDto> {
    const authInfo = req['authInfo'] as AuthInfo;
    return this.pagesService.issuePreviewToken(guid, authInfo, req.ip);
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

  /**
   * Transizione di stato (F01/T5). Nessun `@UseGuards` di ruolo: la soglia
   * dipende dalla transizione richiesta (verso `review` è ammessa a `User`
   * sulla propria riga, ADR-18 § D3) — il check vive nel service, non qui.
   */
  @Post(':guid/status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Transizione di stato di una Pagina' })
  @ApiResponse({ status: 200, description: 'Stato aggiornato', type: PageDto })
  @ApiResponse({ status: 400, description: 'Transizione di stato non ammessa' })
  @ApiResponse({ status: 403, description: 'Permessi insufficienti per la transizione richiesta' })
  @ApiResponse({ status: 404, description: 'Pagina non trovata o eliminata' })
  @ApiResponse({ status: 409, description: 'Conflitto di editing (version non più valida)' })
  async changeStatus(
    @Param('guid') guid: string,
    @Body() dto: ChangeStatusDto,
    @Req() req: Request,
  ): Promise<PageDto> {
    const authInfo = req['authInfo'] as AuthInfo;
    return this.pagesService.changeStatus(guid, dto, authInfo, req.ip);
  }

  /** Elenco paginato delle Revisioni di una Pagina, più recenti prima. */
  @Get(':guid/revisions')
  @ApiOperation({ summary: 'Elenco paginato delle Revisioni di una Pagina' })
  @ApiQuery({ name: 'p', required: false, description: 'Pagina (default 1)' })
  @ApiQuery({ name: 'i', required: false, description: 'Elementi per pagina (default 20)' })
  @ApiResponse({ status: 200, description: 'Lista Revisioni paginata' })
  @ApiResponse({ status: 403, description: 'La Pagina esiste ma non è del chiamante' })
  @ApiResponse({ status: 404, description: 'Pagina non trovata o eliminata' })
  async listRevisions(
    @Param('guid') guid: string,
    @Query('p') p: string,
    @Query('i') i: string,
    @Req() req: Request,
  ): Promise<Pagination<PageRevisionSummaryDto>> {
    const authInfo = req['authInfo'] as AuthInfo;
    const params: PaginationParams = {
      p: p ? parseInt(p, 10) : 1,
      i: i ? parseInt(i, 10) : 20,
    };
    return this.pagesService.listRevisions(guid, authInfo, params);
  }

  /** Dettaglio di una Revisione, snapshot completo incluso. */
  @Get(':guid/revisions/:revisionGuid')
  @ApiOperation({ summary: 'Dettaglio di una Revisione' })
  @ApiResponse({ status: 200, description: 'Revisione trovata', type: PageRevisionDetailDto })
  @ApiResponse({ status: 403, description: 'La Pagina esiste ma non è del chiamante' })
  @ApiResponse({ status: 404, description: 'Pagina o Revisione non trovate' })
  async getRevision(
    @Param('guid') guid: string,
    @Param('revisionGuid') revisionGuid: string,
    @Req() req: Request,
  ): Promise<PageRevisionDetailDto> {
    const authInfo = req['authInfo'] as AuthInfo;
    return this.pagesService.getRevision(guid, revisionGuid, authInfo);
  }

  /**
   * Ripristina una Revisione in una nuova bozza (Manager+). Non tocca la
   * Revisione online né ripubblica automaticamente.
   */
  @Post(':guid/revisions/:revisionGuid/restore')
  @UseGuards(GuardManager)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Ripristina una Revisione passata in una nuova bozza (Manager+)' })
  @ApiResponse({ status: 200, description: 'Bozza ripristinata dallo snapshot', type: PageDto })
  @ApiResponse({ status: 404, description: 'Pagina o Revisione non trovate' })
  @ApiResponse({ status: 409, description: 'Conflitto di editing (version non più valida)' })
  async restoreRevision(
    @Param('guid') guid: string,
    @Param('revisionGuid') revisionGuid: string,
    @Req() req: Request,
  ): Promise<PageDto> {
    const authInfo = req['authInfo'] as AuthInfo;
    return this.pagesService.restoreRevision(guid, revisionGuid, authInfo, req.ip);
  }
}
