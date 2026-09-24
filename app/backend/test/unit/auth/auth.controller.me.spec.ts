import { InternalServerErrorException } from '@nestjs/common';
import type { Request } from 'express';
import { AuthController } from '../../../src/auth/auth.controller';
import type { AuthService } from '../../../src/auth/auth.service';
import { AppUserRoles } from '../../../src/common/enums';
import { AuthInfo, MeResponse } from '../../../src/common/types';
import type { PermissionsService } from '../../../src/permissions/permissions.service';

/**
 * `GET auth/me` con `permissions` (SPEC-RBAC-F2a S20, criterio 4): la
 * composizione avviene nel controller, per `authInfo.userId` (in
 * impersonificazione l'utente impersonato), con i codici in ordine alfabetico.
 * `AuthService` non cambia.
 */
describe('AuthController.getMe — permissions (SPEC-RBAC-F2a S20)', () => {
  const IMPERSONATED: AuthInfo = {
    userId: 30,
    role: AppUserRoles.Manager,
    name: 'Mario',
    scopeId: null,
    impersonatedBy: 1,
  };
  const PROFILE: MeResponse = {
    ...IMPERSONATED,
    guid: 'user000000000030',
    surname: 'Rossi',
    email: 'mario@cms.test',
    isMfaEnabled: false,
  };

  const req = { authInfo: IMPERSONATED } as unknown as Request;
  let getMe: jest.Mock;
  let getUserPermissions: jest.Mock;

  beforeEach(() => {
    getMe = jest.fn().mockResolvedValue(PROFILE);
    getUserPermissions = jest
      .fn()
      .mockResolvedValue(new Set(['pages:publish', 'media:upload', 'pages:create']));
  });

  it('aggiunge i permessi ordinati di authInfo.userId ai campi di AuthService.getMe', async () => {
    const controller = new AuthController(
      { getMe } as unknown as AuthService,
      { getUserPermissions } as unknown as PermissionsService,
    );

    await expect(controller.getMe(req)).resolves.toEqual({
      ...PROFILE,
      permissions: ['media:upload', 'pages:create', 'pages:publish'],
    });
    expect(getMe).toHaveBeenCalledWith(IMPERSONATED);
    expect(getUserPermissions).toHaveBeenCalledWith(30);
  });

  it('insieme vuoto → permissions []', async () => {
    getUserPermissions.mockResolvedValue(new Set());
    const controller = new AuthController(
      { getMe } as unknown as AuthService,
      { getUserPermissions } as unknown as PermissionsService,
    );

    await expect(controller.getMe(req)).resolves.toMatchObject({ permissions: [] });
  });

  it('PermissionsService assente → 500, mai una risposta senza permessi', async () => {
    const controller = new AuthController({ getMe } as unknown as AuthService);

    await expect(controller.getMe(req)).rejects.toBeInstanceOf(InternalServerErrorException);
    expect(getMe).not.toHaveBeenCalled();
  });
});
