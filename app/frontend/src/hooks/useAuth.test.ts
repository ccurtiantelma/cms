/**
 * Test dei permessi in `useAuthStore` (SPEC-RBAC-F2b S25–S26, criteri 1–4). Il modulo viene
 * reimportato a ogni test (`vi.resetModules`) perché `init()` è protetto da un guard a livello
 * di modulo (`initStarted`) e lo store Zustand è un singleton.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { MeResponse } from '../types/auth.types';
import type { AuthUser } from '../types/common.types';

const getMeApi = vi.fn();
const logoutApi = vi.fn();

vi.mock('../services/auth.service', () => ({
  getMeApi: () => getMeApi(),
  logoutApi: () => logoutApi(),
}));

const ME: MeResponse = {
  id: 7,
  guid: 'user0000000000007',
  name: 'Ada',
  email: 'ada@example.com',
  role: 2,
  scopeId: null,
  isMfaEnabled: false,
  permissions: ['pages:read', 'roles:read'],
};

const USER: AuthUser = {
  id: 7,
  guid: 'user0000000000007',
  name: 'Ada',
  email: 'ada@example.com',
  role: 2,
  scopeId: null,
};

async function loadStore(): Promise<typeof import('./useAuth').useAuthStore> {
  vi.resetModules();
  const mod = await import('./useAuth');
  return mod.useAuthStore;
}

/** Attende che le promise già risolte abbiano eseguito i loro `then`/`finally`. */
async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('useAuthStore — permessi (SPEC F2b S25–S26)', () => {
  beforeEach(() => {
    localStorage.clear();
    getMeApi.mockReset();
    logoutApi.mockReset();
  });

  it('parte con permissions null, distinto da []', async () => {
    const store = await loadStore();
    expect(store.getState().permissions).toBeNull();
  });

  it('init() con GET /auth/me riuscita valorizza permissions', async () => {
    localStorage.setItem('access_token', 'tok');
    getMeApi.mockResolvedValue(ME);
    const store = await loadStore();

    store.getState().init();
    await flush();

    expect(store.getState().permissions).toEqual(['pages:read', 'roles:read']);
    expect(store.getState().isLoading).toBe(false);
  });

  it('init() senza token lascia permissions null e chiude il caricamento', async () => {
    const store = await loadStore();

    store.getState().init();
    await flush();

    expect(store.getState().permissions).toBeNull();
    expect(store.getState().isLoading).toBe(false);
    expect(getMeApi).not.toHaveBeenCalled();
  });

  it('login() chiama GET /auth/me e valorizza permissions', async () => {
    getMeApi.mockResolvedValue(ME);
    const store = await loadStore();

    store.getState().login('tok', USER);
    await flush();

    expect(getMeApi).toHaveBeenCalledTimes(1);
    expect(store.getState().permissions).toEqual(['pages:read', 'roles:read']);
  });

  it('login() con GET /auth/me in errore → permissions [], utente e token intatti', async () => {
    getMeApi.mockRejectedValue(new Error('rate limited'));
    const store = await loadStore();

    store.getState().login('tok', USER);
    await flush();

    expect(store.getState().permissions).toEqual([]);
    expect(store.getState().user).toEqual(USER);
    expect(localStorage.getItem('access_token')).toBe('tok');
  });

  it('due refreshPermissions() concorrenti fanno una sola richiesta', async () => {
    localStorage.setItem('access_token', 'tok');
    let resolveMe: (value: MeResponse) => void = () => undefined;
    getMeApi.mockReturnValue(
      new Promise<MeResponse>((resolve) => {
        resolveMe = resolve;
      }),
    );
    const store = await loadStore();

    const first = store.getState().refreshPermissions();
    const second = store.getState().refreshPermissions();
    resolveMe(ME);
    await Promise.all([first, second]);

    expect(getMeApi).toHaveBeenCalledTimes(1);
    expect(store.getState().permissions).toEqual(['pages:read', 'roles:read']);
  });

  it('logout() azzera permissions a null', async () => {
    localStorage.setItem('access_token', 'tok');
    getMeApi.mockResolvedValue(ME);
    logoutApi.mockResolvedValue(undefined);
    // `logout()` assegna `window.location.href`: jsdom non implementa la navigazione.
    vi.stubGlobal('location', { href: '/roles' });
    const store = await loadStore();
    await store.getState().refreshPermissions();
    expect(store.getState().permissions).not.toBeNull();

    await store.getState().logout();

    expect(store.getState().permissions).toBeNull();
    vi.unstubAllGlobals();
  });
});
