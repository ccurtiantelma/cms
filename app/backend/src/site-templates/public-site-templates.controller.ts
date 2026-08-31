import { Body, Controller, NotFoundException, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { TemplateResolverService } from './template-resolver.service';
import { ResolveSiteTemplateDto, ResolvedSiteTemplateDto } from './dto/resolve-site-template.dto';

/**
 * Superficie pubblica di risoluzione dei Template di tema
 * (`api/v1/public/site-templates/resolve`, RFC-40 Opzione B). Anonima
 * (esclusa da `AuthMiddleware`, `public/*` in `app.module.ts`) — il task
 * originale la elencava sotto le guardie admin insieme al CRUD, ma un
 * endpoint pensato per il consumer SSR di `app/public-site` (ADR-22, a cui
 * è vietata ogni autenticazione/sessione) non può stare dietro `GuardAdmin`;
 * qui segue la stessa convenzione di superficie pubblica di ADR-24/ADR-40 —
 * anonima, `404` uniforme, mai `403`, rate limiting proprio.
 */
@ApiTags('Public Site Templates')
@Controller('public/site-templates')
@UseGuards(ThrottlerGuard)
export class PublicSiteTemplatesController {
  /** Inietta il servizio di risoluzione dei Template di tema. */
  constructor(private readonly templateResolver: TemplateResolverService) {}

  /** Risolve il Template pubblicato applicabile a una rotta pubblica. `404` se nessun Template verifica le condizioni. */
  @Post('resolve')
  @Throttle({ public: { limit: 300, ttl: 60_000 } })
  @ApiOperation({ summary: 'Risolve il Template di tema applicabile a una rotta pubblica' })
  @ApiResponse({ status: 200, description: 'Template risolto', type: ResolvedSiteTemplateDto })
  @ApiResponse({ status: 404, description: 'Nessun Template applicabile alla rotta richiesta' })
  async resolve(@Body() dto: ResolveSiteTemplateDto): Promise<ResolvedSiteTemplateDto> {
    const resolved = await this.templateResolver.resolveForRoute(dto.path, dto.type, dto.lang);
    if (!resolved) {
      throw new NotFoundException('Nessun Template di tema applicabile alla rotta richiesta.');
    }
    return resolved;
  }
}
