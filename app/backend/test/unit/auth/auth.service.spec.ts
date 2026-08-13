import { UnauthorizedException } from '@nestjs/common';
import { authenticator } from 'otplib';
import { AuthService } from '../../../src/auth/auth.service';
import { DbService } from '../../../src/db/db.service';
import { RedisService } from '../../../src/redis/redis.service';
import { AuditLogService } from '../../../src/common/audit-log.service';
import { EmailQueueService } from '../../../src/queues/email-queue/email.queue.service';
import { Utils } from '../../../src/common/utils';
import { AppUserRoles } from '../../../src/common/enums';

describe('AuthService (unit)', () => {
  let authService: AuthService;
  let findFirstMock: jest.Mock;
  let updateSetMock: jest.Mock;
  let redisSetMock: jest.Mock;
  let redisGetJsonMock: jest.Mock;
  let redisDelMock: jest.Mock;
  let redisSaddMock: jest.Mock;
  let redisSmembersMock: jest.Mock;
  let redisSremMock: jest.Mock;
  let redisExpireMock: jest.Mock;
  let auditLogMock: jest.Mock;
  let enqueueEmailMock: jest.Mock;

  const EMAIL = 'test.user@cms.test';
  const PASSWORD = 'Password123!Test';

  const baseUser = {
    id: 1,
    guid: 'abcd1234abcd1234',
    name: 'Test',
    surname: 'User',
    email: EMAIL,
    role: AppUserRoles.User,
    scopeId: null,
    isActive: true,
    pwdSet: true,
    isMfaEnabled: false,
    totpSecret: null,
  };

  beforeEach(() => {
    findFirstMock = jest.fn();
    updateSetMock = jest.fn().mockReturnValue({ where: jest.fn().mockResolvedValue(undefined) });
    redisSetMock = jest.fn().mockResolvedValue(undefined);
    redisGetJsonMock = jest.fn().mockResolvedValue(null);
    redisDelMock = jest.fn().mockResolvedValue(undefined);
    redisSaddMock = jest.fn().mockResolvedValue(undefined);
    redisSmembersMock = jest.fn().mockResolvedValue([]);
    redisSremMock = jest.fn().mockResolvedValue(undefined);
    redisExpireMock = jest.fn().mockResolvedValue(undefined);
    auditLogMock = jest.fn().mockResolvedValue(undefined);
    enqueueEmailMock = jest.fn().mockResolvedValue(undefined);

    const dbService = {
      db: {
        query: { userEntity: { findFirst: findFirstMock } },
        update: jest.fn().mockReturnValue({ set: updateSetMock }),
      },
    } as unknown as DbService;

    const redisService = {
      set: redisSetMock,
      get: jest.fn().mockResolvedValue(null),
      getJson: redisGetJsonMock,
      del: redisDelMock,
      exists: jest.fn().mockResolvedValue(false),
      sadd: redisSaddMock,
      smembers: redisSmembersMock,
      srem: redisSremMock,
      expire: redisExpireMock,
    } as unknown as RedisService;

    const auditLogService = { log: auditLogMock } as unknown as AuditLogService;
    const emailQueueService = { enqueueEmail: enqueueEmailMock } as unknown as EmailQueueService;

    authService = new AuthService(dbService, emailQueueService, redisService, auditLogService);
  });

  describe('login', () => {
    it('happy path: restituisce accessToken, refreshToken e dati utente', async () => {
      findFirstMock.mockResolvedValue({ ...baseUser, pwd: await Utils.hashPassword(PASSWORD) });

      const result = await authService.login({ email: EMAIL, password: PASSWORD }, '127.0.0.1');

      expect('mfaRequired' in result).toBe(false);
      if ('mfaRequired' in result) return; // narrowing per TypeScript
      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      expect(result.user.email).toBe(EMAIL);
      expect(redisSetMock).toHaveBeenCalledWith(
        expect.stringContaining('login:'),
        expect.objectContaining({ id: baseUser.id }),
        expect.any(Number),
      );
      expect(auditLogMock).toHaveBeenCalledWith(
        baseUser.id,
        'login',
        undefined,
        undefined,
        { metodo: 'password' },
        undefined,
        '127.0.0.1',
      );
      // Tracking sessione/dispositivo: session:${sessionId} + indice user-sessions:${userId}
      expect(redisSetMock).toHaveBeenCalledWith(
        expect.stringContaining('session:'),
        expect.objectContaining({ userId: baseUser.id, ip: '127.0.0.1' }),
        expect.any(Number),
      );
      expect(redisSaddMock).toHaveBeenCalledWith(
        `user-sessions:${baseUser.id}`,
        expect.any(String),
      );
    });

    it('errore: password errata → UnauthorizedException', async () => {
      findFirstMock.mockResolvedValue({
        ...baseUser,
        pwd: await Utils.hashPassword('altra-password-diversa'),
      });

      await expect(authService.login({ email: EMAIL, password: PASSWORD })).rejects.toThrow(
        UnauthorizedException,
      );
      expect(redisSetMock).not.toHaveBeenCalled();
    });

    it('utente con MFA abilitata: restituisce mfaRequired invece dei token', async () => {
      findFirstMock.mockResolvedValue({
        ...baseUser,
        pwd: await Utils.hashPassword(PASSWORD),
        isMfaEnabled: true,
        totpSecret: 'SECRET',
      });

      const result = await authService.login({ email: EMAIL, password: PASSWORD });

      expect(result).toMatchObject({ mfaRequired: true });
      if (!('mfaRequired' in result)) return;
      expect(result.tmpToken).toBeDefined();
      expect(redisSetMock).toHaveBeenCalledWith(
        expect.stringContaining('mfa_tmp:'),
        { userId: baseUser.id },
        300,
      );
    });
  });

  describe('mfaVerify', () => {
    it('happy path: codice TOTP valido completa il login', async () => {
      const secret = authenticator.generateSecret();
      const validCode = authenticator.generate(secret);
      redisGetJsonMock.mockResolvedValueOnce({ userId: baseUser.id });
      findFirstMock.mockResolvedValue({ ...baseUser, isMfaEnabled: true, totpSecret: secret });

      const result = await authService.mfaVerify('tmp-token', validCode, '127.0.0.1');

      expect(result.accessToken).toBeDefined();
      expect(redisDelMock).toHaveBeenCalledWith('mfa_tmp:tmp-token');
    });

    it('errore: codice TOTP non valido → UnauthorizedException', async () => {
      const secret = authenticator.generateSecret();
      redisGetJsonMock.mockResolvedValueOnce({ userId: baseUser.id });
      findFirstMock.mockResolvedValue({ ...baseUser, isMfaEnabled: true, totpSecret: secret });

      await expect(authService.mfaVerify('tmp-token', '000000', '127.0.0.1')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('changePassword', () => {
    it('errore: password attuale errata → UnauthorizedException', async () => {
      findFirstMock.mockResolvedValue({ ...baseUser, pwd: await Utils.hashPassword(PASSWORD) });

      await expect(
        authService.changePassword(
          { userId: baseUser.id, role: baseUser.role, name: baseUser.name, scopeId: null },
          {
            currentPassword: 'password-sbagliata',
            newPassword: 'NuovaPasswordValida123!',
          },
        ),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('logout', () => {
    it("sessione tracciata: cancella login/rtk/session e rimuove dall'indice utente", async () => {
      redisGetJsonMock.mockImplementation((key: string) => {
        if (key === 'login:token-abc') return Promise.resolve({ id: 1, sessionId: 'sess-1' });
        if (key === 'session:sess-1') {
          return Promise.resolve({
            userId: 1,
            ip: '127.0.0.1',
            userAgent: 'jest',
            createdAt: '2026-01-01T00:00:00.000Z',
            lastUsedAt: '2026-01-01T00:00:00.000Z',
            refreshToken: 'rtk-1',
            accessToken: 'token-abc',
          });
        }
        return Promise.resolve(null);
      });

      await authService.logout('token-abc', 1, '127.0.0.1');

      expect(redisDelMock).toHaveBeenCalledWith('login:token-abc');
      expect(redisDelMock).toHaveBeenCalledWith('session:sess-1');
      expect(redisDelMock).toHaveBeenCalledWith('rtk:rtk-1');
      expect(redisSremMock).toHaveBeenCalledWith('user-sessions:1', 'sess-1');
      // login:token-abc già cancellato esplicitamente: non deve essere ri-cancellato da destroySession
      expect(redisDelMock.mock.calls.filter((c) => c[0] === 'login:token-abc')).toHaveLength(1);
    });

    it('sessione non tracciata (es. token di impersonificazione): nessuna pulizia extra', async () => {
      redisGetJsonMock.mockResolvedValue({ id: 1 }); // nessun sessionId nell'allowlist

      await authService.logout('token-imp', 1);

      expect(redisDelMock).toHaveBeenCalledWith('login:token-imp');
      expect(redisSremMock).not.toHaveBeenCalled();
    });
  });

  describe('getActiveSessions', () => {
    const authInfo = { userId: 1, role: AppUserRoles.User, name: 'Test', scopeId: null };

    it("elenca le sessioni dell'utente e marca quella corrente", async () => {
      redisSmembersMock.mockResolvedValue(['sess-1', 'sess-2']);
      redisGetJsonMock.mockImplementation((key: string) => {
        if (key === 'login:current-token') return Promise.resolve({ id: 1, sessionId: 'sess-2' });
        if (key === 'session:sess-1') {
          return Promise.resolve({
            userId: 1,
            ip: '10.0.0.1',
            userAgent: 'ua-1',
            createdAt: '2026-01-01T00:00:00.000Z',
            lastUsedAt: '2026-01-01T00:00:00.000Z',
            refreshToken: 'rtk-1',
            accessToken: 'token-1',
          });
        }
        if (key === 'session:sess-2') {
          return Promise.resolve({
            userId: 1,
            ip: '10.0.0.2',
            userAgent: 'ua-2',
            createdAt: '2026-01-02T00:00:00.000Z',
            lastUsedAt: '2026-01-02T00:00:00.000Z',
            refreshToken: 'rtk-2',
            accessToken: 'token-2',
          });
        }
        return Promise.resolve(null);
      });

      const result = await authService.getActiveSessions(authInfo, 'current-token');

      expect(result).toHaveLength(2);
      const current = result.find((s) => s.sessionId === 'sess-2');
      expect(current?.current).toBe(true);
      expect(result.find((s) => s.sessionId === 'sess-1')?.current).toBe(false);
      expect(redisSremMock).not.toHaveBeenCalled();
    });

    it("pulizia lazy: rimuove dall'indice le sessioni scadute (record assente)", async () => {
      redisSmembersMock.mockResolvedValue(['sess-scaduta']);
      redisGetJsonMock.mockResolvedValue(null);

      const result = await authService.getActiveSessions(authInfo);

      expect(result).toHaveLength(0);
      expect(redisSremMock).toHaveBeenCalledWith('user-sessions:1', 'sess-scaduta');
    });
  });

  describe('revokeSession', () => {
    const authInfo = { userId: 1, role: AppUserRoles.User, name: 'Test', scopeId: null };

    it('happy path: revoca session/rtk/login e registra audit log', async () => {
      redisGetJsonMock.mockResolvedValue({
        userId: 1,
        ip: '10.0.0.1',
        userAgent: 'ua-1',
        createdAt: '2026-01-01T00:00:00.000Z',
        lastUsedAt: '2026-01-01T00:00:00.000Z',
        refreshToken: 'rtk-1',
        accessToken: 'token-1',
      });

      const result = await authService.revokeSession(authInfo, 'sess-1', '10.0.0.1');

      expect(result).toEqual({ success: true });
      expect(redisDelMock).toHaveBeenCalledWith('session:sess-1');
      expect(redisDelMock).toHaveBeenCalledWith('rtk:rtk-1');
      expect(redisDelMock).toHaveBeenCalledWith('login:token-1');
      expect(redisSremMock).toHaveBeenCalledWith('user-sessions:1', 'sess-1');
      expect(auditLogMock).toHaveBeenCalledWith(
        1,
        'session.revoke',
        undefined,
        undefined,
        undefined,
        undefined,
        '10.0.0.1',
      );
    });

    it('errore: sessione inesistente → NotFoundException', async () => {
      redisGetJsonMock.mockResolvedValue(null);

      await expect(authService.revokeSession(authInfo, 'sess-inesistente')).rejects.toThrow(
        'Sessione non trovata.',
      );
      expect(redisDelMock).not.toHaveBeenCalled();
    });

    it('errore: sessione di un altro utente (IDOR) → NotFoundException', async () => {
      redisGetJsonMock.mockResolvedValue({
        userId: 999,
        ip: null,
        userAgent: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        lastUsedAt: '2026-01-01T00:00:00.000Z',
        refreshToken: 'rtk-altrui',
        accessToken: 'token-altrui',
      });

      await expect(authService.revokeSession(authInfo, 'sess-altrui')).rejects.toThrow(
        'Sessione non trovata.',
      );
      expect(redisDelMock).not.toHaveBeenCalled();
    });
  });
});
