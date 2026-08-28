import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { GuardAdmin } from '../auth/guard';
import { AnalyticsService } from './analytics.service';
import { AnalyticsQueryDto } from './dto/analytics-query.dto';
import { AnalyticsResponseDto } from './dto/analytics-response.dto';
import { IngestPageviewDto } from './dto/ingest-pageview.dto';

/** Raccolta SSR protetta da secret e lettura KPI riservata ad Admin+. */
@ApiTags('Analytics')
@Controller('analytics')
export class AnalyticsController {
  /** Inietta il service per ingest e lettura degli aggregati. */
  constructor(private readonly analyticsService: AnalyticsService) {}

  /** Registra una sola pageview HTML GET riuscita del consumer SSR. */
  @Post('ingest/pageview')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Ingest server-to-server di una pageview SSR riuscita' })
  @ApiHeader({ name: 'X-Analytics-Secret', required: true })
  @ApiResponse({ status: 204, description: 'Pageview accettata o già aggregata' })
  @ApiResponse({ status: 401, description: 'Secret assente o non valido' })
  @ApiResponse({ status: 404, description: 'Il percorso non identifica una pagina pubblicata' })
  async ingestPageview(
    @Headers('x-analytics-secret') secret: string | undefined,
    @Body() dto: IngestPageviewDto,
  ): Promise<void> {
    if (!this.analyticsService.isValidIngestSecret(secret)) {
      throw new UnauthorizedException('Secret analytics non valido.');
    }
    await this.analyticsService.ingestPageview(dto.path);
  }

  /** Restituisce KPI e serie giornaliere anonime del sito e dell'app. */
  @Get()
  @UseGuards(GuardAdmin)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'KPI analytics sito pubblico e utilizzo app (Admin+)' })
  @ApiResponse({ status: 200, description: 'KPI e serie giornaliere', type: AnalyticsResponseDto })
  async getAnalytics(@Query() query: AnalyticsQueryDto): Promise<AnalyticsResponseDto> {
    return this.analyticsService.getAnalytics(query);
  }
}
