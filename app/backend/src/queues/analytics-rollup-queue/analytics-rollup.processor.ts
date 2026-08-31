import { Injectable, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { and, gte, lte, sql } from 'drizzle-orm';
import { DbService } from '../../db/db.service';
import { analyticsDailyRollupEntity, analyticsEventEntity } from '../../db/schema';

const MS_PER_DAY = 86_400_000;

/**
 * Worker BullMQ del job repeatable di rollup analytics: ricalcola
 * `analytics_daily_rollups` per **oggi** e **ieri** (UTC) aggregando
 * `analytics_events` per percorso, `COUNT(*)` come view e
 * `COUNT(DISTINCT visitor_hash)` come visitatori unici. "Ieri" viene
 * ricalcolato a ogni esecuzione per finalizzare il giorno precedente una
 * volta che il traffico si è assestato. Upsert `ON CONFLICT (date, path) DO
 * UPDATE` (stesso pattern già in uso dal vecchio
 * `publicPageviewDailyEntity`), con incremento di `version`/`updatedAt`
 * (lock ottimistico dell'entità mutabile).
 */
@Injectable()
@Processor('analytics-rollup-queue')
export class AnalyticsRollupProcessor extends WorkerHost {
  private readonly logger = new Logger(AnalyticsRollupProcessor.name);

  /** Inietta l'accesso al DB. */
  constructor(private readonly db: DbService) {
    super();
  }

  /** Ricalcola il rollup di oggi e di ieri (UTC). */
  async process(): Promise<void> {
    const today = this.utcDateString(new Date());
    const yesterday = this.utcDateString(new Date(Date.now() - MS_PER_DAY));
    await this.recomputeDay(today);
    await this.recomputeDay(yesterday);
  }

  /** Aggrega `analytics_events` per la giornata UTC data e fa upsert riga per percorso. */
  private async recomputeDay(date: string): Promise<void> {
    const fromDate = new Date(`${date}T00:00:00.000Z`);
    const toDate = new Date(`${date}T23:59:59.999Z`);

    const rows = await this.db.db
      .select({
        path: analyticsEventEntity.path,
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
      .groupBy(analyticsEventEntity.path);

    if (rows.length === 0) {
      this.logger.debug(`Nessun evento da aggregare per ${date}.`);
      return;
    }

    for (const row of rows) {
      await this.db.db
        .insert(analyticsDailyRollupEntity)
        .values({
          date,
          path: row.path,
          viewsCount: row.views,
          uniqueVisitorsCount: row.uniqueVisitors,
        })
        .onConflictDoUpdate({
          target: [analyticsDailyRollupEntity.date, analyticsDailyRollupEntity.path],
          set: {
            viewsCount: row.views,
            uniqueVisitorsCount: row.uniqueVisitors,
            version: sql`${analyticsDailyRollupEntity.version} + 1`,
            updatedAt: new Date(),
          },
        });
    }

    this.logger.log(`Rollup aggiornato per ${date}: ${rows.length} percorsi.`);
  }

  private utcDateString(date: Date): string {
    return date.toISOString().slice(0, 10);
  }
}
