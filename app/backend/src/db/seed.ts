import * as dotenv from 'dotenv';
dotenv.config();

import { DbService } from './db.service';
import { SeedService } from '../admin/seed.service';

/**
 * Script di seed del database (`npm run seed`). Riusa la stessa logica esposta
 * da `SeedService`, chiamabile anche dall'endpoint `POST /app/admin/system/seed-demo`.
 *
 * Nota: eseguito con `ts-node` (non `tsx`/esbuild — l'interop di quest'ultimo
 * con `import * as sanitizeHtml from 'sanitize-html'`, usato da
 * `TreeSanitizerService`/`BlockPropSanitizerService`, rompe a runtime con
 * "sanitizeHtml is not a function"; `ts-node` no, stesso tool già usato da
 * `openapi:export`/`blocks:export`). Le dipendenze restano istanziate
 * manualmente invece che via `NestApplicationContext`: bootstrare l'intera
 * app (Redis, code BullMQ, HTTP) per un seed CLI è overhead non necessario,
 * non un vincolo del tool — `SeedService`/`DbService` non hanno altre
 * dipendenze iniettate, quindi la costruzione manuale resta l'opzione più
 * semplice (vale anche per `AdminService` se in futuro venisse richiamato
 * da qui, ma richiederebbe allora `NestApplicationContext`).
 */
async function main(): Promise<void> {
  const dbService = new DbService();
  await dbService.onModuleInit();
  const seedService = new SeedService(dbService);

  console.log('--- Inizio seed database ---');
  try {
    const summary = await seedService.run();
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
