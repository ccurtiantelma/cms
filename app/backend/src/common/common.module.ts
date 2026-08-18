import { Global, Module } from '@nestjs/common';
import { AuditLogService } from './audit-log.service';
import { ExportService } from './export/export.service';
import { BlockPropSanitizerService } from './sanitizer/block-prop-sanitizer.service';
import { TreeSanitizerService } from './sanitizer/tree-sanitizer.service';

/**
 * Servizi core trasversali (audit log, export liste/report, sanitizzazione
 * HTML server-side, utility) disponibili in tutta l'app senza dover essere
 * importati esplicitamente in ogni modulo, come già avviene per DbModule.
 * `BlockPropSanitizerService` sanitizza per `kind` l'albero dei blocchi
 * (PLAN-F02 T3); `TreeSanitizerService` resta la sanitizzazione cieca di F01,
 * usata ora solo per `draftSeo` (ADR-21 § 4).
 */
@Global()
@Module({
  providers: [AuditLogService, ExportService, TreeSanitizerService, BlockPropSanitizerService],
  exports: [AuditLogService, ExportService, TreeSanitizerService, BlockPropSanitizerService],
})
export class CommonModule {}
