import { Global, Module } from '@nestjs/common';
import { PermissionsSeedService } from './permissions-seed.service';
import { PermissionsService } from './permissions.service';

/**
 * Strato permessi granulari (ADR-99): registro, seed all'avvio, risoluzione con
 * cache Redis. `@Global()` come `DbModule`/`RedisModule`, così
 * `PermissionsService` è iniettabile in ogni modulo senza import espliciti.
 */
@Global()
@Module({
  providers: [PermissionsService, PermissionsSeedService],
  exports: [PermissionsService, PermissionsSeedService],
})
export class PermissionsModule {}
