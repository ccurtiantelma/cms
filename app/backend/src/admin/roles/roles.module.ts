import { Module } from '@nestjs/common';
import { RolesController } from './roles.controller';
import { RolesService } from './roles.service';

/**
 * Dominio dei ruoli personalizzati (ADR-99). `RolesController` espone
 * `api/v1/app/admin/roles*` e `permissions` (SPEC-RBAC-F2a); `RolesService` è
 * esportato per l'assegnazione dei ruoli in `AdminService`. `PermissionsService`,
 * `DbService` e `AuditLogService` arrivano da moduli globali.
 */
@Module({
  controllers: [RolesController],
  providers: [RolesService],
  exports: [RolesService],
})
export class RolesModule {}
