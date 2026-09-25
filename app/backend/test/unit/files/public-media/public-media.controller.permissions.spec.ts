import 'reflect-metadata';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ThrottlerGuard } from '@nestjs/throttler';
import { PublicMediaController } from '../../../../src/files/public-media/public-media.controller';
import { PERMISSIONS_KEY, PermissionsGuard } from '../../../../src/permissions/permissions.guard';

/**
 * `PublicMediaController` resta anonimo e senza permessi (ADR-99 § 9 e §
 * Conformità, Principio 8, SPEC-RBAC-F2c S46): la regola è verificata sui
 * metadati di Nest invece che affidata alla revisione.
 */
describe('PublicMediaController — nessun permesso RBAC (SPEC-RBAC-F2c S46)', () => {
  const handlerNames = Object.getOwnPropertyNames(PublicMediaController.prototype).filter(
    (name) => name !== 'constructor',
  );

  it('espone almeno un handler da verificare', () => {
    expect(handlerNames.length).toBeGreaterThan(0);
  });

  it('nessun metadato PERMISSIONS_KEY sulla classe', () => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, PublicMediaController)).toBeUndefined();
  });

  it.each(handlerNames)('handler "%s": nessun PERMISSIONS_KEY né PermissionsGuard', (name) => {
    const handler = (PublicMediaController.prototype as unknown as Record<string, object>)[name];
    expect(Reflect.getMetadata(PERMISSIONS_KEY, handler)).toBeUndefined();
    const guards: unknown[] = Reflect.getMetadata(GUARDS_METADATA, handler) ?? [];
    expect(guards).not.toContain(PermissionsGuard);
  });

  it('i guard di classe sono solo ThrottlerGuard', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, PublicMediaController)).toEqual([ThrottlerGuard]);
  });
});
