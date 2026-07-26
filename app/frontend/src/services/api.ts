/**
 * Istanza Axios unica con interceptor request/response.
 * Riferimento: CLAUDE.md — "Error Handling Policy" (Frontend) e CONTRACT.md.
 */
import axios, { type AxiosRequestConfig } from 'axios';
import { notifications } from '@mantine/notifications';
import { getToken, setToken, clearAuthStorage } from '../utils/auth.utils';
import type { RefreshResponse } from '../types/auth.types';
import { captureException } from '../libs/sentry';

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api/v1';

const api = axios.create({
  baseURL: BASE_URL,
  withCredentials: true,
});

// Interceptor request: aggiunge il token JWT come Bearer.
api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

type RetryableRequestConfig = AxiosRequestConfig & { _retriedAfterRefresh?: boolean };

/** Rotte auth che non devono mai innescare il silent-refresh (401 = credenziali/codice errati, non token scaduto). */
const AUTH_ROUTES_WITHOUT_REFRESH = ['auth/login', 'auth/refresh', 'auth/mfa-verify'];

/**
 * Promise condivisa del refresh in corso: richieste 401 concorrenti aspettano
 * lo stesso refresh invece di chiamare `/auth/refresh` una volta ciascuna
 * (access token 15min, refresh token 7gg httpOnly cookie — CLAUDE.md, Security Policy).
 */
let refreshInFlight: Promise<string> | null = null;

/** Chiama `POST /auth/refresh` con axios "nudo" (no interceptor) per evitare ricorsione. */
function refreshAccessToken(): Promise<string> {
  if (!refreshInFlight) {
    refreshInFlight = axios
      .post<RefreshResponse>(`${BASE_URL}/auth/refresh`, {}, { withCredentials: true })
      .then(({ data }) => {
        setToken(data.accessToken);
        return data.accessToken;
      })
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

// Interceptor response: gestione errori differenziata per fascia di status
// (CLAUDE.md - "Error Handling Policy" sezione Frontend).
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const status = error.response?.status;
    const originalRequest = error.config as RetryableRequestConfig | undefined;

    if (!error.response) {
      // Errore di rete (nessuna risposta ricevuta dal server).
      notifications.show({ color: 'red', message: 'Connessione assente' });
      return Promise.reject(error);
    }

    const url = originalRequest?.url ?? '';
    const isRouteWithoutRefresh = AUTH_ROUTES_WITHOUT_REFRESH.some((route) => url.includes(route));

    if (
      status === 401 &&
      originalRequest &&
      !originalRequest._retriedAfterRefresh &&
      !isRouteWithoutRefresh
    ) {
      originalRequest._retriedAfterRefresh = true;
      try {
        const newToken = await refreshAccessToken();
        originalRequest.headers = {
          ...originalRequest.headers,
          Authorization: `Bearer ${newToken}`,
        };
        return api(originalRequest);
      } catch {
        clearAuthStorage();
        window.location.href = '/login';
        return Promise.reject(error);
      }
    }

    if (status === 401) {
      if (!isRouteWithoutRefresh) {
        clearAuthStorage();
        window.location.href = '/login';
      }
    } else if (status === 403) {
      notifications.show({ color: 'red', message: 'Permessi insufficienti' });
    } else if (status === 404) {
      // La pagina dedicata "Risorsa non trovata" è gestita a livello di routing
      // (vedi PageNotFound); qui copriamo il caso di azioni in pagina.
      notifications.show({ color: 'orange', message: 'Risorsa non trovata' });
    } else if (status >= 500) {
      console.error('Errore server:', error);
      captureException(error);
      notifications.show({ color: 'red', message: 'Errore del server, riprova più tardi' });
    }

    return Promise.reject(error);
  },
);

export default api;
