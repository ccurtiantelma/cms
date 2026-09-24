import { Module } from '@nestjs/common';
import { RolesService } from './roles.service';

/**
 * Dominio dei ruoli personalizzati (ADR-99 F1). Nessun controller in questa
 * fase: `api/v1/app/admin/roles*` arriva in F2. `PermissionsService`,
 * `DbService` e `AuditLogService` arrivano da moduli globali.
 */
@Module({
  providers: [RolesService],
  exports: [RolesService],
})
export class RolesModule {}
