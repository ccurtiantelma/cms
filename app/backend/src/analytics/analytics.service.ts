import { BadRequestException, Injectable } from '@nestjs/common';
import { and, asc, eq, gte, lt, lte, sql } from 'drizzle-orm';
import { timingSafeEqual } from 'crypto';
import { AppConstants } from '../common/app-constants';
import { DbService } from '../db/db.service';
import { auditLogEntity, publicPageviewDailyEntity, userEntity } from '../db/schema';
import { PublicPagesService } from '../pages/public-pages.service';
import { canonicalizePublicPath } from '../pages/public-path.util';
import { AnalyticsQueryDto } from './dto/analytics-query.dto';
import { AnalyticsResponseDto } from './dto/analytics-response.dto';

type DailyRow = { date: string; visits: number; path?: string };

/** Gestisce aggregati anonimi SSR e statistiche applicative derivate dal DB esistente. */
@Injectable()
export class AnalyticsService {
  /** Inietta DB e resolver delle sole pagine pubblicate. */
  constructor(
    private readonly db: DbService,
    private readonly publicPagesService: PublicPagesService,
  ) {}

  /** Confronta il secret senza rivelare la lunghezza o i caratteri coincidenti. */
  isValidIngestSecret(candidate?: string): boolean {
    const configured = AppConstants.analyticsIngestSecret;
    if (!candidate || !configured) return false;
    const candidateBuffer = Buffer.from(candidate);
    const configuredBuffer = Buffer.from(configured);
    return (
      candidateBuffer.length === configuredBuffer.length &&
      timingSafeEqual(candidateBuffer, configuredBuffer)
    );
  }

  /** Conta una pageview solo per un percorso canonico pubblicato e servibile. */
  async ingestPageview(rawPath: string): Promise<void> {
    const pagePath = canonicalizePublicPath(rawPath);
    await this.publicPagesService.resolveByPath(pagePath);
    const eventDate = this.utcDate(new Date());

    await this.db.db
      .insert(publicPageviewDailyEntity)
      .values({ eventDate, pagePath, visits: 1 })
      .onConflictDoUpdate({
        target: [publicPageviewDailyEntity.eventDate, publicPageviewDailyEntity.pagePath],
        set: {
          visits: sql`${publicPageviewDailyEntity.visits} + 1`,
          version: sql`${publicPageviewDailyEntity.version} + 1`,
          updatedAt: new Date(),
        },
      });

    const retentionBoundary = new Date();
    retentionBoundary.setUTCMonth(retentionBoundary.getUTCMonth() - 24);
    const retentionDate = this.utcDate(retentionBoundary);
    await this.db.db
      .update(publicPageviewDailyEntity)
      .set({ isActive: false, updatedAt: new Date() })
      .where(
        and(
          lt(publicPageviewDailyEntity.eventDate, retentionDate),
          eq(publicPageviewDailyEntity.isActive, true),
        ),
      );
  }

  /** Legge serie sito e KPI app nell'intervallo inclusivo richiesto. */
  async getAnalytics(query: AnalyticsQueryDto): Promise<AnalyticsResponseDto> {
    const { from, to } = this.resolveRange(query);
    const siteRows = await this.db.db
      .select({
        date: publicPageviewDailyEntity.eventDate,
        path: publicPageviewDailyEntity.pagePath,
        visits: publicPageviewDailyEntity.visits,
      })
      .from(publicPageviewDailyEntity)
      .where(
        and(
          eq(publicPageviewDailyEntity.isActive, true),
          gte(publicPageviewDailyEntity.eventDate, from),
          lte(publicPageviewDailyEntity.eventDate, to),
        ),
      )
      .orderBy(asc(publicPageviewDailyEntity.eventDate), asc(publicPageviewDailyEntity.pagePath));

    const [userCount, activeUserCount, loginRows] = await Promise.all([
      this.db.db.select({ count: sql<number>`count(*)::int` }).from(userEntity),
      this.db.db
        .select({ count: sql<number>`count(*)::int` })
        .from(userEntity)
        .where(eq(userEntity.isActive, true)),
      this.db.db
        .select({
          date: sql<string>`(${auditLogEntity.createdAt} at time zone 'UTC')::date`,
          visits: sql<number>`count(*)::int`,
        })
        .from(auditLogEntity)
        .where(
          and(
            eq(auditLogEntity.action, 'login'),
            gte(auditLogEntity.createdAt, new Date(`${from}T00:00:00.000Z`)),
            lte(auditLogEntity.createdAt, new Date(`${to}T23:59:59.999Z`)),
          ),
        )
        .groupBy(sql`(${auditLogEntity.createdAt} at time zone 'UTC')::date`)
        .orderBy(asc(sql`(${auditLogEntity.createdAt} at time zone 'UTC')::date`)),
    ]);

    const siteSeries: DailyRow[] = siteRows.map((row) => ({
      date: row.date,
      path: row.path,
      visits: row.visits,
    }));
    return {
      site: {
        totalVisits: siteSeries.reduce((total, row) => total + row.visits, 0),
        series: siteSeries,
      },
      app: {
        registeredUsers: userCount[0]?.count ?? 0,
        activeUsers: activeUserCount[0]?.count ?? 0,
        successfulLogins: loginRows.reduce((total, row) => total + row.visits, 0),
        loginSeries: loginRows,
      },
    };
  }

  private resolveRange(query: AnalyticsQueryDto): { from: string; to: string } {
    const to = query.to ?? this.utcDate(new Date());
    const from = query.from ?? this.utcDate(new Date(Date.now() - 30 * 86_400_000));
    if (from > to) throw new BadRequestException('Intervallo analytics non valido.');
    return { from, to };
  }

  private utcDate(date: Date): string {
    return date.toISOString().slice(0, 10);
  }
}
