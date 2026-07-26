import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';
import { AppConstants } from '../common/app-constants';

/**
 * Gestisce il ciclo di vita della connessione Drizzle ORM/PostgreSQL (pool `pg`).
 * `db` è il client Drizzle tipizzato sullo schema applicativo, iniettabile in
 * ogni service che necessiti di accesso al database.
 */
@Injectable()
export class DbService implements OnModuleInit, OnModuleDestroy {
  public db: NodePgDatabase<typeof schema>;
  private client: Pool;

  /** Inizializza il pool di connessioni e il client Drizzle all'avvio del modulo. */
  async onModuleInit(): Promise<void> {
    this.client = new Pool({ connectionString: AppConstants.databaseUrl });
    this.db = drizzle(this.client, { schema });
  }

  /** Chiude il pool di connessioni allo spegnimento dell'applicazione. */
  async onModuleDestroy(): Promise<void> {
    if (this.client) {
      await this.client.end();
    }
  }
}
