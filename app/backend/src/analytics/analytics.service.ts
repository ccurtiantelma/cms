import { BadRequestException, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { analyticsDailyRollupEntity, analyticsEventEntity } from '../db/schema';
import { AnalyticsDevice } from './user-agent-parser.util';
import { AnalyticsOverviewDto } from './dto/analytics-overview.dto';
import {
  AnalyticsTimeseriesDto,
  AnalyticsTimeseriesPointDto,
} from './dto/analytics-timeseries.dto';
import { AnalyticsTopPageDto } from './dto/analytics-top-pages.dto';
import { AnalyticsReferrerDto } from './dto/analytics-referrer.dto';
import {
  AnalyticsDeviceStatsDto,
  AnalyticsDistributionRowDto,
} from './dto/analytics-device-stats.dto';

/** Payload di un evento anonimo, prodotto da `AnalyticsIngestionMiddleware`. */
export interface RecordEventInput {
  path: string;
  visitorHash: string;
  device: AnalyticsDevice;
  browser?: string;
  os?: string;
  referrer?: string;
  country?: string;
}

/** Lunghezza massima delle colonne `varchar` corrispondenti in `analytics_events` — troncamento difensivo. */
const PATH_MAX_LENGTH = 500;
const REFERRER_MAX_LENGTH = 500;

const DEFAULT_RANGE_DAYS = 30;
const DEFAULT_TOP_LIMIT = 10;
const MS_PER_DAY = 86_400_000;

/**
 * Analytics interno, privacy-first e GDPR-compliant: nessun cookie, nessun IP
 * grezzo persistito (`visitor-hash.util.ts`). `recordEvent` è l'unico punto
 * di scrittura (chiamato dal middleware di ingestion, mai atteso nel path
 * della richiesta pubblica); i restanti metodi leggono KPI/serie per la
 * dashboard amministrativa (`GuardManager`+).
 *
 * Le query "leggere" (top-pages) leggono da `analytics_daily_rollups`
 * (pre-aggregato per giorno/percorso dal repeatable job
 * `analytics-rollup-queue`); le query che richiedono granularità oraria o
 * dimensioni non presenti nel rollup (referrer, device/browser, visitatori
 * unici cross-pagina) leggono direttamente da `analytics_events`, supportate
 * dagli indici `(created_at, path)`/`(created_at, visitor_hash)`.
 */
@Injectable()
export class AnalyticsService {
  /** Inietta l'accesso al DB. */
  constructor(private readonly db: DbService) {}

  /**
   * Inserisce un evento di pageview anonimo. Chiamata dal middleware di
   * ingestion senza essere attesa nel path della richiesta pubblica: un
   * eventuale errore qui non deve mai raggiungere il client (gestito dal
   * `.catch()` del chiamante).
   */
  async recordEvent(input: RecordEventInput): Promise<void> {
    await this.db.db.insert(analyticsEventEntity).values({
      path: input.path.slice(0, PATH_MAX_LENGTH),
      visitorHash: input.visitorHash,
      device: input.device,
      browser: input.browser,
      os: input.os,
      referrer: input.referrer?.slice(0, REFERRER_MAX_LENGTH),
      country: input.country,
    });
  }

  /**
   * KPI aggregati dell'intervallo richiesto: totale view, visitatori unici
   * (query diretta su `analytics_events`, i rollup per-path non permettono di
   * deduplicare i visitatori cross-pagina senza doppio conteggio), pagine con
   * traffico e trend percentuale vs il periodo immediatamente precedente di
   * pari durata.
   */
  async getOverview(from: string, to: string): Promise<AnalyticsOverviewDto> {
    const { fromDate, toDate } = this.resolveDateBounds(from, to);
    const previous = this.resolvePreviousRange(from, to);
    const previousBounds = this.resolveDateBounds(previous.from, previous.to);

    const [currentRow, previousRow] = await Promise.all([
      this.db.db
        .select({
          totalViews: sql<number>`count(*)::int`,
          uniqueVisitors: sql<number>`count(distinct ${analyticsEventEntity.visitorHash})::int`,
          pagesWithTraffic: sql<number>`count(distinct ${analyticsEventEntity.path})::int`,
        })
        .from(analyticsEventEntity)
        .where(
          and(
            gte(analyticsEventEntity.createdAt, fromDate),
            lte(analyticsEventEntity.createdAt, toDate),
          ),
        ),
      this.db.db
        .select({ totalViews: sql<number>`count(*)::int` })
        .from(analyticsEventEntity)
        .where(
          and(
            gte(analyticsEventEntity.createdAt, previousBounds.fromDate),
            lte(analyticsEventEntity.createdAt, previousBounds.toDate),
          ),
        ),
    ]);

    const current = currentRow[0] ?? { totalViews: 0, uniqueVisitors: 0, pagesWithTraffic: 0 };
    const previousTotalViews = previousRow[0]?.totalViews ?? 0;

    return {
      totalViews: current.totalViews,
      uniqueVisitors: current.uniqueVisitors,
      pagesWithTraffic: current.pagesWithTraffic,
      trendPercentage:
        previousTotalViews === 0
          ? null
          : this.roundPercentage(
              ((current.totalViews - previousTotalViews) / previousTotalViews) * 100,
            ),
    };
  }

  /**
   * Serie temporale di view/visitatori unici bucketizzata per giorno o ora,
   * letta direttamente da `analytics_events` (i rollup hanno solo
   * granularità giornaliera e nessun bucket orario).
   */
  async getTimeseries(
    from: string,
    to: string,
    interval: 'day' | 'hour',
  ): Promise<AnalyticsTimeseriesDto> {
    const { fromDate, toDate } = this.resolveDateBounds(from, to);
    const bucketExpr =
      interval === 'day'
        ? sql<string>`date_trunc('day', ${analyticsEventEntity.createdAt} at time zone 'UTC')`
        : sql<string>`date_trunc('hour', ${analyticsEventEntity.createdAt} at time zone 'UTC')`;

    const rows = await this.db.db
      .select({
        bucket: bucketExpr,
        views: sql<number>`count(*)::int`,
        uniqueVisitors: sql<number>`count(distinct ${analyticsEventEntity.visitorHash})::int`,
      })
      .from(analyticsEventEntity)
      .where(
        and(
          gte(analyticsEventEntity.createdAt, fromDate),
          lte(analyticsEventEntity.createdAt, toDate),
        ),
      )
      .groupBy(bucketExpr)
      .orderBy(asc(bucketExpr));

    const points: AnalyticsTimeseriesPointDto[] = rows.map((row) => ({
      bucket: new Date(row.bucket).toISOString(),
      views: row.views,
      uniqueVisitors: row.uniqueVisitors,
    }));

    return { interval, points };
  }

  /**
   * Classifica delle pagine più visitate nell'intervallo, dal pre-aggregato
   * `analytics_daily_rollups` (fast path: niente scansione di
   * `analytics_events`). La percentuale è calcolata sul totale delle view
   * dell'intero range, non solo sulle righe restituite.
   */
  async getTopPages(from: string, to: string, limit: number): Promise<AnalyticsTopPageDto[]> {
    const rangeFilter = and(
      gte(analyticsDailyRollupEntity.date, from),
      lte(analyticsDailyRollupEntity.date, to),
      eq(analyticsDailyRollupEntity.isActive, true),
    );

    const [totalRow, rows] = await Promise.all([
      this.db.db
        .select({
          totalViews: sql<number>`coalesce(sum(${analyticsDailyRollupEntity.viewsCount}), 0)::int`,
        })
        .from(analyticsDailyRollupEntity)
        .where(rangeFilter),
      this.db.db
        .select({
          path: analyticsDailyRollupEntity.path,
          views: sql<number>`sum(${analyticsDailyRollupEntity.viewsCount})::int`,
          uniqueVisitors: sql<number>`sum(${analyticsDailyRollupEntity.uniqueVisitorsCount})::int`,
        })
        .from(analyticsDailyRollupEntity)
        .where(rangeFilter)
        .groupBy(analyticsDailyRollupEntity.path)
        .orderBy(desc(sql`sum(${analyticsDailyRollupEntity.viewsCount})`))
        .limit(limit),
    ]);

    const totalViews = totalRow[0]?.totalViews ?? 0;
    return rows.map((row) => ({
      path: row.path,
      views: row.views,
      uniqueVisitors: row.uniqueVisitors,
      percentage: totalViews === 0 ? 0 : this.roundPercentage((row.views / totalViews) * 100),
    }));
  }

  /**
   * Classifica dei referrer nell'intervallo, da `analytics_events` (il
   * referrer non è presente nel rollup per-path). `null`/stringa vuota →
   * `'direct'`.
   */
  async getReferrers(from: string, to: string, limit: number): Promise<AnalyticsReferrerDto[]> {
    const { fromDate, toDate } = this.resolveDateBounds(from, to);
    const rangeFilter = and(
      gte(analyticsEventEntity.createdAt, fromDate),
      lte(analyticsEventEntity.createdAt, toDate),
    );
    const referrerExpr = sql<string>`coalesce(nullif(${analyticsEventEntity.referrer}, ''), 'direct')`;

    const [totalRow, rows] = await Promise.all([
      this.db.db
        .select({ total: sql<number>`count(*)::int` })
        .from(analyticsEventEntity)
        .where(rangeFilter),
      this.db.db
        .select({ referrer: referrerExpr, count: sql<number>`count(*)::int` })
        .from(analyticsEventEntity)
        .where(rangeFilter)
        .groupBy(referrerExpr)
        .orderBy(desc(sql`count(*)`))
        .limit(limit),
    ]);

    const total = totalRow[0]?.total ?? 0;
    return rows.map((row) => ({
      referrer: row.referrer,
      count: row.count,
      percentage: total === 0 ? 0 : this.roundPercentage((row.count / total) * 100),
    }));
  }

  /**
   * Distribuzione percentuale per device e, separatamente, per browser
   * (`'unknown'` quando il parser UA non ha riconosciuto nulla), letta da
   * `analytics_events` nell'intervallo richiesto.
   */
  async getDeviceStats(from: string, to: string): Promise<AnalyticsDeviceStatsDto> {
    const { fromDate, toDate } = this.resolveDateBounds(from, to);
    const rangeFilter = and(
      gte(analyticsEventEntity.createdAt, fromDate),
      lte(analyticsEventEntity.createdAt, toDate),
    );
    const browserExpr = sql<string>`coalesce(${analyticsEventEntity.browser}, 'unknown')`;

    const [deviceRows, browserRows] = await Promise.all([
      this.db.db
        .select({ label: analyticsEventEntity.device, count: sql<number>`count(*)::int` })
        .from(analyticsEventEntity)
        .where(rangeFilter)
        .groupBy(analyticsEventEntity.device)
        .orderBy(desc(sql`count(*)`)),
      this.db.db
        .select({ label: browserExpr, count: sql<number>`count(*)::int` })
        .from(analyticsEventEntity)
        .where(rangeFilter)
        .groupBy(browserExpr)
        .orderBy(desc(sql`count(*)`)),
    ]);

    return {
      devices: this.toDistribution(deviceRows),
      browsers: this.toDistribution(browserRows),
    };
  }

  /** Converte righe `{label, count}` in una distribuzione percentuale sul totale delle righe. */
  private toDistribution(rows: { label: string; count: number }[]): AnalyticsDistributionRowDto[] {
    const total = rows.reduce((sum, row) => sum + row.count, 0);
    return rows.map((row) => ({
      label: row.label,
      count: row.count,
      percentage: total === 0 ? 0 : this.roundPercentage((row.count / total) * 100),
    }));
  }

  /**
   * Normalizza `from`/`to` con i default (ultimi 30 giorni) e verifica che
   * `from <= to`, altrimenti `400`.
   */
  resolveRange(from?: string, to?: string): { from: string; to: string } {
    const resolvedTo = to ?? this.utcDate(new Date());
    const resolvedFrom =
      from ?? this.utcDate(new Date(Date.now() - DEFAULT_RANGE_DAYS * MS_PER_DAY));
    if (resolvedFrom > resolvedTo) {
      throw new BadRequestException('Intervallo analytics non valido: "from" successivo a "to".');
    }
    return { from: resolvedFrom, to: resolvedTo };
  }

  /** Limite per top-pages/referrers, con il default dichiarato in DTO/JSDoc del controller. */
  resolveLimit(limit?: number): number {
    return limit ?? DEFAULT_TOP_LIMIT;
  }

  /** Granularità della timeseries, default `'day'`. */
  resolveInterval(interval?: 'day' | 'hour'): 'day' | 'hour' {
    return interval ?? 'day';
  }

  /** Confini `Date` UTC inclusivi (00:00:00.000 → 23:59:59.999) per un range `from`/`to` in forma YYYY-MM-DD. */
  private resolveDateBounds(from: string, to: string): { fromDate: Date; toDate: Date } {
    return {
      fromDate: new Date(`${from}T00:00:00.000Z`),
      toDate: new Date(`${to}T23:59:59.999Z`),
    };
  }

  /** Periodo immediatamente precedente, di pari durata (es. 08-01..08-15 → 07-17..07-31). */
  private resolvePreviousRange(from: string, to: string): { from: string; to: string } {
    const fromDate = new Date(`${from}T00:00:00.000Z`);
    const toDate = new Date(`${to}T00:00:00.000Z`);
    const rangeDays = Math.round((toDate.getTime() - fromDate.getTime()) / MS_PER_DAY) + 1;

    const previousTo = new Date(fromDate.getTime() - MS_PER_DAY);
    const previousFrom = new Date(previousTo.getTime() - (rangeDays - 1) * MS_PER_DAY);

    return { from: this.utcDate(previousFrom), to: this.utcDate(previousTo) };
  }

  private roundPercentage(value: number): number {
    return Math.round(value * 10) / 10;
  }

  private utcDate(date: Date): string {
    return date.toISOString().slice(0, 10);
  }
}
