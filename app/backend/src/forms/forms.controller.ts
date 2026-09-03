import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { GuardManager } from '../auth/guard';
import { FormSubmissionsQueryParams } from '../common/types';
import { Pagination } from '../common/pagination';
import { FormsService } from './forms.service';
import { FormSubmissionDto } from './dto/form-submission.dto';

/**
 * Lettura amministrativa degli Invii dei Form (ADR-46 § Impatto, RFC-46 §
 * Impatto: "lettura Invii dei moduli" Manager+, business rules § Permessi
 * editoriali). Nessuna ownership per riga: un Invio non ha un autore utente
 * (sottomissione pubblica anonima), quindi la soglia di ruolo basta —
 * a differenza delle "proprie bozze" di Pagina (ADR-18).
 */
@ApiTags('Forms')
@Controller('app/forms')
@UseGuards(GuardManager)
@ApiBearerAuth('access-token')
export class FormsController {
  /** Inietta il service di lettura/elaborazione degli Invii. */
  constructor(private readonly formsService: FormsService) {}

  /** Lista paginata degli Invii attivi, filtrabile per `formKey`. */
  @Get('submissions')
  @ApiOperation({ summary: 'Lista paginata degli Invii (Manager+)' })
  @ApiQuery({ name: 'p', required: false, description: 'Pagina (default 1)' })
  @ApiQuery({ name: 'i', required: false, description: 'Elementi per pagina (default 20)' })
  @ApiQuery({
    name: 'd',
    required: false,
    description: 'Direzione ordinamento per createdAt (asc|desc, default desc)',
  })
  @ApiQuery({
    name: 'formKey',
    required: false,
    description: 'Filtro per chiave editoriale del modulo',
  })
  @ApiResponse({ status: 200, description: 'Lista Invii paginata' })
  async listSubmissions(
    @Query('p') p: string,
    @Query('i') i: string,
    @Query('d') d: string,
    @Query('formKey') formKey: string,
  ): Promise<Pagination<FormSubmissionDto>> {
    const params: FormSubmissionsQueryParams = {
      p: p ? parseInt(p, 10) : 1,
      i: i ? parseInt(i, 10) : 20,
      d,
      formKey,
    };
    return this.formsService.listSubmissions(params);
  }
}
