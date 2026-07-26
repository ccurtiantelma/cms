/**
 * Context di autenticazione condiviso da tutta l'app. La chiamata `GET /auth/me`
 * avviene una sola volta nel Provider (montato in `main.tsx`) ed è condivisa via
 * Context, per evitare che ogni componente che ne ha bisogno (LayoutProtected,
 * ImpersonationBanner, PageProfile, PageUsers, ...) rifaccia la stessa richiesta
 * e faccia scattare il rate-limit di `auth/*`.
 */
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { AuthUser, AuthState } from '../types/common.types';
import {
  getToken,
  setToken,
  getStoredUser,
  setStoredUser,
  clearAuthStorage,
  getImpersonatedBy,
} from '../utils/auth.utils';
import { getMeApi, logoutApi } from '../services/auth.service';

interface AuthContextValue extends AuthState {
  /** Stato MFA dell'utente, recuperato insieme a `user` dalla stessa GET /auth/me. */
  isMfaEnabled: boolean | null;
  /** Id del SuperAdmin reale se la sessione corrente è un'impersonificazione. */
  impersonatedBy: number | null;
  login: (token: string, user: AuthUser) => void;
  logout: () => Promise<void>;
  /** Aggiorna nome/cognome in stato e localStorage dopo un self-update da Pagina Profilo. */
  updateUserProfile: (name: string, surname?: string) => void;
  /** Aggiorna lo stato MFA in memoria (dopo abilitazione/disabilitazione da Pagina Profilo). */
  setMfaEnabled: (enabled: boolean) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Provider che recupera lo stato dell'utente autenticato (`GET /auth/me`) una sola
 * volta per sessione e lo condivide con l'intero albero dei componenti.
 */
export function AuthProvider({ children }: { children: ReactNode }): JSX.Element {
  const [user, setUser] = useState<AuthUser | null>(() => getStoredUser());
  const [isMfaEnabled, setIsMfaEnabled] = useState<boolean | null>(null);
  const [impersonatedBy, setImpersonatedBy] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setIsLoading(false);
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
        setUser(nextUser);
        setIsMfaEnabled(data.isMfaEnabled ?? null);
        setStoredUser(nextUser);
        setImpersonatedBy(getImpersonatedBy());
      })
      .catch(() => {
        // Token non valido o scaduto.
        clearAuthStorage();
        setUser(null);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  const login = useCallback((token: string, userData: AuthUser): void => {
    setToken(token);
    setStoredUser(userData);
    setUser(userData);
    setImpersonatedBy(getImpersonatedBy());
  }, []);

  const updateUserProfile = useCallback((name: string, surname?: string): void => {
    setUser((prev) => {
      if (!prev) return prev;
      const updated = { ...prev, name, surname };
      setStoredUser(updated);
      return updated;
    });
  }, []);

  const setMfaEnabled = useCallback((enabled: boolean): void => {
    setIsMfaEnabled(enabled);
  }, []);

  const logout = useCallback(async (): Promise<void> => {
    try {
      await logoutApi();
    } catch {
      // Ignora errori di logout lato server: lo stato locale va comunque ripulito.
    } finally {
      clearAuthStorage();
      setUser(null);
      setImpersonatedBy(null);
      window.location.href = '/login';
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        isMfaEnabled,
        impersonatedBy,
        login,
        logout,
        updateUserProfile,
        setMfaEnabled,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

/**
 * Hook per accedere allo stato di autenticazione condiviso.
 * Va usato all'interno di `<AuthProvider>` (montato in `main.tsx`).
 */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth deve essere usato all'interno di <AuthProvider>");
  }
  return ctx;
}
