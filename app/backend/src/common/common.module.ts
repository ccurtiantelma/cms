import { Global, Module } from '@nestjs/common';
import { AuditLogService } from './audit-log.service';
import { ExportService } from './export/export.service';
import { TreeSanitizerService } from './sanitizer/tree-sanitizer.service';

/**
 * Servizi core trasversali (audit log, export liste/report, sanitizzazione
 * HTML server-side, utility) disponibili in tutta l'app senza dover essere
 * importati esplicitamente in ogni modulo, come già avviene per DbModule.
 */
@Global()
@Module({
  providers: [AuditLogService, ExportService, TreeSanitizerService],
  exports: [AuditLogService, ExportService, TreeSanitizerService],
})
export class CommonModule {}
