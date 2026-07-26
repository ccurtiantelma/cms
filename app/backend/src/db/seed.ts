import * as dotenv from 'dotenv';
dotenv.config();

import { DbService } from './db.service';
import { SeedService } from '../admin/seed.service';

/**
 * Script di seed del database (`npm run seed`). Riusa la stessa logica esposta
 * da `SeedService`, chiamabile anche dall'endpoint `POST /app/admin/system/seed-demo`.
 *
 * Nota: lo script viene eseguito con `tsx` (esbuild), che NON emette i metadati
 * dei decoratori richiesti dal sistema di Dependency Injection di NestJS. Per
 * questo motivo le dipendenze vengono istanziate manualmente invece di passare
 * per un `NestApplicationContext` (gotcha noto, vale anche per `AdminService`
 * se in futuro venisse richiamato da qui).
 */
async function main(): Promise<void> {
  const dbService = new DbService();
  await dbService.onModuleInit();
  const seedService = new SeedService(dbService);

  console.log('--- Inizio seed database ---');
  try {
    const summary = await seedService.seedDemo();
    console.log('\n--- Riepilogo seed ---');
    for (const [table, count] of Object.entries(summary)) {
      console.log(`${table}: ${count}`);
    }
    console.log('----------------------');
  } catch (error) {
    console.error('Errore durante il seed:', error);
    process.exitCode = 1;
  } finally {
    await dbService.onModuleDestroy();
  }
}

main();
