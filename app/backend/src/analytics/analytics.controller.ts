import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { GuardManager } from '../auth/guard';
import { AnalyticsService } from './analytics.service';
import { AnalyticsQueryDto } from './dto/analytics-query.dto';
import { AnalyticsOverviewDto } from './dto/analytics-overview.dto';
import { AnalyticsTimeseriesDto } from './dto/analytics-timeseries.dto';
import { AnalyticsTopPageDto } from './dto/analytics-top-pages.dto';
import { AnalyticsReferrerDto } from './dto/analytics-referrer.dto';
import { AnalyticsDeviceStatsDto } from './dto/analytics-device-stats.dto';

/**
 * Reportistica analytics interna, privacy-first (GDPR, zero cookie).
 * Nessun endpoint di ingest qui: la raccolta è a carico di
 * `AnalyticsIngestionMiddleware`, montato su `public/*path` in
 * `AppModule.configure()`. Lettura riservata a Manager+ (CLAUDE.md § RBAC:
 * reportistica editoriale/operativa, non una funzione Admin-only).
 */
@ApiTags('Analytics')
@Controller('analytics')
@UseGuards(GuardManager)
@ApiBearerAuth('access-token')
export class AnalyticsController {
  /** Inietta il service di lettura degli aggregati. */
  constructor(private readonly analyticsService: AnalyticsService) {}

  /** Restituisce i KPI aggregati dell'intervallo con trend vs il periodo precedente. */
  @Get('overview')
  @ApiOperation({ summary: 'KPI aggregati (view, visitatori unici, pagine con traffico, trend)' })
  @ApiResponse({
    status: 200,
    description: "KPI dell'intervallo richiesto",
    type: AnalyticsOverviewDto,
  })
  async getOverview(@Query() query: AnalyticsQueryDto): Promise<AnalyticsOverviewDto> {
    const { from, to } = this.analyticsService.resolveRange(query.from, query.to);
    return this.analyticsService.getOverview(from, to);
  }

  /** Restituisce la serie temporale di view/visitatori unici, bucketizzata per giorno o ora. */
  @Get('timeseries')
  @ApiOperation({ summary: 'Serie temporale view/visitatori unici (bucket giorno o ora)' })
  @ApiResponse({
    status: 200,
    description: 'Serie temporale ordinata crescente',
    type: AnalyticsTimeseriesDto,
  })
  async getTimeseries(@Query() query: AnalyticsQueryDto): Promise<AnalyticsTimeseriesDto> {
    const { from, to } = this.analyticsService.resolveRange(query.from, query.to);
    const interval = this.analyticsService.resolveInterval(query.interval);
    return this.analyticsService.getTimeseries(from, to, interval);
  }

  /** Restituisce la classifica delle pagine più visitate nell'intervallo. */
  @Get('top-pages')
  @ApiOperation({ summary: "Classifica delle pagine più visitate nell'intervallo" })
  @ApiResponse({
    status: 200,
    description: 'Righe ordinate per view decrescenti',
    type: [AnalyticsTopPageDto],
  })
  async getTopPages(@Query() query: AnalyticsQueryDto): Promise<AnalyticsTopPageDto[]> {
    const { from, to } = this.analyticsService.resolveRange(query.from, query.to);
    const limit = this.analyticsService.resolveLimit(query.limit);
    return this.analyticsService.getTopPages(from, to, limit);
  }

  /** Restituisce la classifica dei referrer nell'intervallo. */
  @Get('referrers')
  @ApiOperation({ summary: 'Classifica dei referrer nell\'intervallo ("direct" se assente)' })
  @ApiResponse({
    status: 200,
    description: 'Righe ordinate per conteggio decrescente',
    type: [AnalyticsReferrerDto],
  })
  async getReferrers(@Query() query: AnalyticsQueryDto): Promise<AnalyticsReferrerDto[]> {
    const { from, to } = this.analyticsService.resolveRange(query.from, query.to);
    const limit = this.analyticsService.resolveLimit(query.limit);
    return this.analyticsService.getReferrers(from, to, limit);
  }

  /** Restituisce la distribuzione percentuale per device e per browser nell'intervallo. */
  @Get('devices')
  @ApiOperation({ summary: 'Distribuzione percentuale per device e per browser' })
  @ApiResponse({
    status: 200,
    description: 'Distribuzione device/browser',
    type: AnalyticsDeviceStatsDto,
  })
  async getDeviceStats(@Query() query: AnalyticsQueryDto): Promise<AnalyticsDeviceStatsDto> {
    const { from, to } = this.analyticsService.resolveRange(query.from, query.to);
    return this.analyticsService.getDeviceStats(from, to);
  }
}
