import { Injectable } from '@nestjs/common';
import { HealthIndicatorResult, HealthIndicatorService } from '@nestjs/terminus';
import { sql } from 'drizzle-orm';
import { DbService } from '../../db/db.service';
import { HEALTH_CHECK_TIMEOUT_MS, withTimeout } from '../health-check.util';

/** Verifica la connettività al database PostgreSQL eseguendo un ping (`select 1`) via Drizzle ORM. */
@Injectable()
export class DrizzleHealthIndicator {
  /** Inietta `DbService` (connessione Drizzle/PostgreSQL) e l'helper Terminus per il risultato. */
  constructor(
    private readonly dbService: DbService,
    private readonly healthIndicatorService: HealthIndicatorService,
  ) {}

  /** Esegue il ping al database (con timeout) e restituisce l'esito nel formato atteso da Terminus. */
  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const indicator = this.healthIndicatorService.check(key);

    try {
      await withTimeout(
        this.dbService.db.execute(sql`select 1`),
        HEALTH_CHECK_TIMEOUT_MS,
        'Database check',
      );
      return indicator.up();
    } catch (err) {
      return indicator.down({ error: (err as Error).message });
    }
  }
}
