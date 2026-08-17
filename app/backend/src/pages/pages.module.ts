import { Module } from '@nestjs/common';
import { DbModule } from '../db/db.module';
import { PagesController } from './pages.controller';
import { PagesService } from './pages.service';

/**
 * Modulo Pagine (F01): CRUD amministrativo, slug, gerarchia, lock
 * ottimistico, ownership per riga. Macchina a stati e revisioni arrivano con
 * F01/T5. `AuditLogService`/`TreeSanitizerService` vengono da `CommonModule`
 * (globale, nessun import esplicito necessario).
 */
@Module({
  imports: [DbModule],
  controllers: [PagesController],
  providers: [PagesService],
})
export class PagesModule {}
