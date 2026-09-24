import { Global, Module } from '@nestjs/common';
import { PermissionsGuard } from './permissions.guard';
import { PermissionsSeedService } from './permissions-seed.service';
import { PermissionsService } from './permissions.service';

/**
 * Strato permessi granulari (ADR-99): registro, seed all'avvio, risoluzione con
 * cache Redis e `PermissionsGuard`. `@Global()` come `DbModule`/`RedisModule`,
 * così `@Permissions` è utilizzabile in ogni modulo senza import espliciti.
 */
@Global()
@Module({
  providers: [PermissionsService, PermissionsSeedService, PermissionsGuard],
  exports: [PermissionsService, PermissionsSeedService, PermissionsGuard],
})
export class PermissionsModule {}
