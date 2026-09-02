import { SettingsService, DEFAULT_THEME_CONFIG } from '../../../src/settings/settings.service';
import { DbService } from '../../../src/db/db.service';
import { AuditLogService } from '../../../src/common/audit-log.service';
import { ExportService } from '../../../src/export/export.service';
import { AppUserRoles } from '../../../src/common/enums';
import { AuthInfo } from '../../../src/common/types';

describe('SettingsService (unit) — updateTheme e trigger di rebuild full-site (RFC-44 Decisione 3)', () => {
  let settingsService: SettingsService;
  let onConflictDoUpdateMock: jest.Mock;
  let valuesMock: jest.Mock;
  let auditLogService: { log: jest.Mock };
  let exportService: { enqueueFullSiteExport: jest.Mock };

  const authInfo: AuthInfo = {
    userId: 1,
    role: AppUserRoles.SuperAdmin,
    name: 'Test SuperAdmin',
    scopeId: null,
  };

  beforeEach(() => {
    onConflictDoUpdateMock = jest.fn().mockResolvedValue(undefined);
    valuesMock = jest.fn().mockReturnValue({ onConflictDoUpdate: onConflictDoUpdateMock });

    const dbService = {
      db: {
        insert: jest.fn().mockReturnValue({ values: valuesMock }),
      },
    } as unknown as DbService;

    auditLogService = { log: jest.fn().mockResolvedValue(undefined) };
    exportService = { enqueueFullSiteExport: jest.fn().mockResolvedValue(undefined) };

    settingsService = new SettingsService(
      dbService,
      auditLogService as unknown as AuditLogService,
      exportService as unknown as ExportService,
    );
  });

  it("accoda un full-site rebuild dopo aver salvato il tema e registrato l'audit log", async () => {
    await settingsService.updateTheme(DEFAULT_THEME_CONFIG, authInfo, '127.0.0.1');

    expect(onConflictDoUpdateMock).toHaveBeenCalled();
    expect(auditLogService.log).toHaveBeenCalledWith(
      authInfo.userId,
      'settings.theme.update',
      'app_settings',
      'theme',
      JSON.stringify(DEFAULT_THEME_CONFIG),
      authInfo.impersonatedBy,
      '127.0.0.1',
    );
    expect(exportService.enqueueFullSiteExport).toHaveBeenCalledTimes(1);
  });

  it('accoda il rebuild anche se non è passato un IP (parametro opzionale)', async () => {
    await settingsService.updateTheme(DEFAULT_THEME_CONFIG, authInfo);

    expect(exportService.enqueueFullSiteExport).toHaveBeenCalledTimes(1);
  });

  it('non accoda nulla se il salvataggio su DB fallisce', async () => {
    onConflictDoUpdateMock.mockRejectedValueOnce(new Error('db down'));

    await expect(settingsService.updateTheme(DEFAULT_THEME_CONFIG, authInfo)).rejects.toThrow(
      'db down',
    );

    expect(exportService.enqueueFullSiteExport).not.toHaveBeenCalled();
  });

  it('restituisce il dto salvato', async () => {
    const result = await settingsService.updateTheme(DEFAULT_THEME_CONFIG, authInfo);

    expect(result).toBe(DEFAULT_THEME_CONFIG);
  });
});
