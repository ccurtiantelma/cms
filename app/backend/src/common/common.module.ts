import { Global, Module } from '@nestjs/common';
import { AuditLogService } from './audit-log.service';
import { ExportService } from './export/export.service';

/**
 * Servizi core trasversali (audit log, export liste/report, utility)
 * disponibili in tutta l'app senza dover essere importati esplicitamente in
 * ogni modulo, come già avviene per DbModule.
 */
@Global()
@Module({
  providers: [AuditLogService, ExportService],
  exports: [AuditLogService, ExportService],
})
export class CommonModule {}
