/**
 * Store Zustand di autenticazione condiviso da tutta l'app. La chiamata `GET /auth/me`
 * avviene una sola volta per sessione (`init()`, invocata da `useAuthInit` in `App`)
 * ed è condivisa via store: ogni componente che ne ha bisogno (LayoutProtected,
 * ImpersonationBanner, PageProfile, PageUsers, ...) legge lo stesso stato invece di
 * rifare la stessa richiesta e far scattare il rate-limit di `auth/*`.
 *
 * A differenza del precedente `AuthContext`, ogni consumer seleziona solo i campi
 * che gli servono (`useAuthStore((s) => s.user)`, ecc.): un cambio di `isLoading` o
 * `isMfaEnabled` non fa più ri-renderizzare componenti che leggono solo `user`.
 */
import { useEffect } from 'react';
import { create } from 'zustand';
import type { AuthUser } from '../types/common.types';
import {
  getToken,
  setToken,
  getStoredUser,
  setStoredUser,
  clearAuthStorage,
  getImpersonatedBy,
} from '../utils/auth.utils';
import { getMeApi, logoutApi } from '../services/auth.service';

interface AuthStoreState {
  user: AuthUser | null;
  isLoading: boolean;
  /** Stato MFA dell'utente, recuperato insieme a `user` dalla stessa GET /auth/me. */
  isMfaEnabled: boolean | null;
  /** Id del SuperAdmin reale se la sessione corrente è un'impersonificazione. */
  impersonatedBy: number | null;
  /**
   * Codici permesso effettivi dell'utente (`GET /auth/me`, ADR-99 § 10). `null` = non ancora
   * caricati, `[]` = nessun permesso: i guard mostrano un loader sul primo e negano sul secondo
   * (SPEC F2b S25/S28). Mai persistiti in `localStorage`. Solo UX: l'autorità resta il backend.
   */
  permissions: string[] | null;
  /** Avvia il fetch iniziale (GET /auth/me), no-op se già avviato in questa sessione dell'app. */
  init: () => void;
  /** Salva token e utente, poi carica i permessi senza attenderli (SPEC F2b S26 (b)). */
  login: (token: string, user: AuthUser) => void;
  /**
   * Ricarica i permessi da `GET /auth/me`. Le chiamate concorrenti condividono la stessa
   * richiesta; in caso di errore `permissions` diventa `[]` e la sessione resta aperta.
   */
  refreshPermissions: () => Promise<void>;
  logout: () => Promise<void>;
  /** Aggiorna nome/cognome in stato e localStorage dopo un self-update da Pagina Profilo. */
  updateUserProfile: (name: string, surname?: string) => void;
  /** Aggiorna lo stato MFA in memoria (dopo abilitazione/disabilitazione da Pagina Profilo). */
  setMfaEnabled: (enabled: boolean) => void;
}

/** Guard a livello di modulo: `init()` è invocato da `useAuthInit`, ma la GET /auth/me deve partire una sola volta. */
let initStarted = false;

/** Richiesta `refreshPermissions` in volo, condivisa dalle chiamate concorrenti. */
let permissionsInFlight: Promise<void> | null = null;

export const useAuthStore = create<AuthStoreState>((set, get) => ({
  user: getStoredUser(),
  isLoading: true,
  isMfaEnabled: null,
  impersonatedBy: null,
  permissions: null,

  init: () => {
    if (initStarted) return;
    initStarted = true;

    const token = getToken();
    if (!token) {
      set({ isLoading: false });
      return;
    }

    // Valida il token e recupera i dati utente chiamando GET /auth/me.
    getMeApi()
      .then((data) => {
        const nextUser: AuthUser = {
          id: data.id,
          guid: data.guid,
          name: data.name,
          surname: data.surname,
          email: data.email,
          role: data.role,
          scopeId: data.scopeId,
        };
        setStoredUser(nextUser);
        set({
          user: nextUser,
          isMfaEnabled: data.isMfaEnabled ?? null,
          impersonatedBy: getImpersonatedBy(),
          permissions: data.permissions ?? [],
        });
      })
      .catch(() => {
        // Token non valido o scaduto.
        clearAuthStorage();
        set({ user: null, permissions: [] });
      })
      .finally(() => {
        set({ isLoading: false });
      });
  },

  login: (token, userData) => {
    setToken(token);
    setStoredUser(userData);
    set({ user: userData, impersonatedBy: getImpersonatedBy() });
    // `init()` è già consumato e il login naviga in SPA senza ricaricare: senza questa chiamata
    // i permessi resterebbero `null` fino al primo reload (PLAN F2b, falla 6).
    void get().refreshPermissions();
  },

  refreshPermissions: () => {
    if (permissionsInFlight) return permissionsInFlight;
    permissionsInFlight = getMeApi()
      .then((data) => {
        // Un logout arrivato mentre la richiesta era in volo vince.
        if (getToken()) set({ permissions: data.permissions ?? [] });
      })
      .catch(() => {
        if (getToken()) set({ permissions: [] });
      })
      .finally(() => {
        permissionsInFlight = null;
      });
    return permissionsInFlight;
  },

  updateUserProfile: (name, surname) => {
    const prev = get().user;
    if (!prev) return;
    const updated = { ...prev, name, surname };
    setStoredUser(updated);
    set({ user: updated });
  },

  setMfaEnabled: (enabled) => set({ isMfaEnabled: enabled }),

  logout: async () => {
    try {
      await logoutApi();
    } catch {
      // Ignora errori di logout lato server: lo stato locale va comunque ripulito.
    } finally {
      clearAuthStorage();
      set({ user: null, impersonatedBy: null, permissions: null });
      window.location.href = '/login';
    }
  },
}));

/**
 * Avvia l'inizializzazione dell'auth store (GET /auth/me). Va montato una sola
 * volta, alla radice dell'app (`App.tsx`) — sostituisce il vecchio `<AuthProvider>`.
 */
export function useAuthInit(): void {
  const init = useAuthStore((state) => state.init);
  useEffect(() => {
    init();
  }, [init]);
}
