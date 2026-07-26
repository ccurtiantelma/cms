import { Utils } from '../../../src/common/utils';
import { AppUserRoles } from '../../../src/common/enums';
import { AuthInfo } from '../../../src/common/types';

describe('Utils', () => {
  describe('hashPassword / verifyPassword', () => {
    it('genera un hash bcrypt verificabile con la password originale', async () => {
      const hash = await Utils.hashPassword('Password123!');
      expect(hash).not.toBe('Password123!');
      expect(hash.startsWith('$2')).toBe(true);
      await expect(Utils.verifyPassword('Password123!', hash)).resolves.toBe(true);
    });

    it('rifiuta una password errata contro un hash valido', async () => {
      const hash = await Utils.hashPassword('Password123!');
      await expect(Utils.verifyPassword('PasswordSbagliata!', hash)).resolves.toBe(false);
    });
  });

  describe('randomString', () => {
    it('genera una stringa hex della lunghezza richiesta', () => {
      expect(Utils.randomString(16)).toHaveLength(16);
      expect(Utils.randomString(64)).toHaveLength(64);
      expect(Utils.randomString(16)).toMatch(/^[0-9a-f]{16}$/);
    });

    it('genera valori diversi ad ogni chiamata', () => {
      expect(Utils.randomString(32)).not.toBe(Utils.randomString(32));
    });
  });

  describe('applyScopeFilter', () => {
    const buildAuthInfo = (role: AppUserRoles, scopeId: string | null): AuthInfo => ({
      userId: 1,
      role,
      name: 'Test',
      scopeId,
    });

    it('restituisce null (vede tutto) per un ruolo pari o superiore alla soglia elevata (default Admin)', () => {
      expect(Utils.applyScopeFilter(buildAuthInfo(AppUserRoles.SuperAdmin, 'sede-1'))).toBeNull();
      expect(Utils.applyScopeFilter(buildAuthInfo(AppUserRoles.Admin, 'sede-1'))).toBeNull();
    });

    it('restituisce lo scopeId per un ruolo sotto la soglia elevata', () => {
      expect(Utils.applyScopeFilter(buildAuthInfo(AppUserRoles.Manager, 'sede-1'))).toBe('sede-1');
      expect(Utils.applyScopeFilter(buildAuthInfo(AppUserRoles.User, 'sede-2'))).toBe('sede-2');
    });

    it('rispetta una soglia elevata personalizzata', () => {
      expect(
        Utils.applyScopeFilter(buildAuthInfo(AppUserRoles.Manager, 'sede-1'), AppUserRoles.Manager),
      ).toBeNull();
    });
  });

  describe('parseDurationToSeconds', () => {
    it('converte correttamente le unità supportate', () => {
      expect(Utils.parseDurationToSeconds('30s')).toBe(30);
      expect(Utils.parseDurationToSeconds('15m')).toBe(900);
      expect(Utils.parseDurationToSeconds('2h')).toBe(7200);
      expect(Utils.parseDurationToSeconds('7d')).toBe(604800);
    });

    it('accetta un numero puro (già in secondi), come stringa o come number', () => {
      expect(Utils.parseDurationToSeconds('120')).toBe(120);
      expect(Utils.parseDurationToSeconds(120)).toBe(120);
    });

    it('lancia un errore per un formato non riconosciuto', () => {
      expect(() => Utils.parseDurationToSeconds('abc')).toThrow('Formato durata non riconosciuto');
    });
  });
});
