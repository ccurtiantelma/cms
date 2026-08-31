/**
 * Store Zustand del pannello Analytics della dashboard. Tiene l'intervallo di
 * date selezionato e i dati dei 5 endpoint REST (`overview`, `timeseries`,
 * `top-pages`, `referrers`, `devices`), caricati in parallelo tramite
 * `analytics.service.ts`: nessuna chiamata Axios diretta qui dentro.
 */
import { create } from 'zustand';
import { getErrorMessage } from '../utils/api.utils';
import {
  getDevices,
  getOverview,
  getReferrers,
  getTimeseries,
  getTopPages,
} from '../services/analytics.service';
import type { AnalyticsOverview } from '../types/analytics.types';
import type { components } from '../types/api.types';

type AnalyticsTimeseriesDto = components['schemas']['AnalyticsTimeseriesDto'];
type AnalyticsTopPageDto = components['schemas']['AnalyticsTopPageDto'];
type AnalyticsReferrerDto = components['schemas']['AnalyticsReferrerDto'];
type AnalyticsDeviceStatsDto = components['schemas']['AnalyticsDeviceStatsDto'];

const TOP_PAGES_LIMIT = 10;
const REFERRERS_LIMIT = 10;

interface AnalyticsDateRange {
  from: string;
  to: string;
}

interface AnalyticsState {
  overview: AnalyticsOverview | null;
  timeseries: AnalyticsTimeseriesDto | null;
  topPages: AnalyticsTopPageDto[];
  referrers: AnalyticsReferrerDto[];
  devices: AnalyticsDeviceStatsDto | null;
  dateRange: AnalyticsDateRange;
  isLoading: boolean;
  error: string | null;

  /** Imposta l'intervallo di date e avvia il ricaricamento di tutti i dati analytics. */
  setDateRange: (from: string, to: string) => void;
  /** Carica in parallelo i 5 endpoint analytics per il `dateRange` corrente. */
  fetchAnalytics: () => Promise<void>;
  /** Ripristina lo stato iniziale dello store (intervallo di date incluso). */
  resetStore: () => void;
}

/** Ultimi 30 giorni inclusa la data odierna, in UTC, formato `YYYY-MM-DD`. */
function defaultDateRange(): AnalyticsDateRange {
  const to = new Date();
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - 29);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

const initialState = {
  overview: null as AnalyticsOverview | null,
  timeseries: null as AnalyticsTimeseriesDto | null,
  topPages: [] as AnalyticsTopPageDto[],
  referrers: [] as AnalyticsReferrerDto[],
  devices: null as AnalyticsDeviceStatsDto | null,
  dateRange: defaultDateRange(),
  isLoading: false,
  error: null as string | null,
};

export const useAnalyticsStore = create<AnalyticsState>()((set, get) => ({
  ...initialState,

  setDateRange: (from, to) => {
    set({ dateRange: { from, to } });
    void get().fetchAnalytics();
  },

  fetchAnalytics: async () => {
    const { from, to } = get().dateRange;
    set({ isLoading: true, error: null });
    try {
      const [overview, timeseries, topPages, referrers, devices] = await Promise.all([
        getOverview(from, to),
        getTimeseries(from, to),
        getTopPages(from, to, TOP_PAGES_LIMIT),
        getReferrers(from, to, REFERRERS_LIMIT),
        getDevices(from, to),
      ]);
      set({ overview, timeseries, topPages, referrers, devices });
    } catch (err) {
      // Il service ha già mostrato la notifica: qui si registra solo il messaggio per l'Alert della pagina.
      const message = getErrorMessage(err, 'Errore nel caricamento delle statistiche analytics');
      set({ error: message });
    } finally {
      set({ isLoading: false });
    }
  },

  resetStore: () => set({ ...initialState, dateRange: defaultDateRange() }),
}));
