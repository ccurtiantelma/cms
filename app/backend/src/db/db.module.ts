import { Global, Module } from '@nestjs/common';
import { DbService } from './db.service';

/**
 * Espone `DbService` (connessione Drizzle/PostgreSQL) globalmente, senza
 * doverlo importare esplicitamente in ogni modulo che accede al database.
 */
@Global()
@Module({
  providers: [DbService],
  exports: [DbService],
})
export class DbModule {}
