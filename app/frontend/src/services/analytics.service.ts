/**
 * Accesso ai nuovi endpoint REST di analytics del sito pubblico
 * (`GET /analytics/{overview,timeseries,top-pages,referrers,devices}`).
 * Ogni funzione è una chiamata Axios pura sull'istanza condivisa `api`.
 */
import { notifications } from '@mantine/notifications';
import api from './api';
import type { AnalyticsOverview } from '../types/analytics.types';
import type { components } from '../types/api.types';

type AnalyticsOverviewDto = components['schemas']['AnalyticsOverviewDto'];
type AnalyticsTimeseriesDto = components['schemas']['AnalyticsTimeseriesDto'];
type AnalyticsTopPageDto = components['schemas']['AnalyticsTopPageDto'];
type AnalyticsReferrerDto = components['schemas']['AnalyticsReferrerDto'];
type AnalyticsDeviceStatsDto = components['schemas']['AnalyticsDeviceStatsDto'];

const ANALYTICS_PREFIX = 'analytics';

/** `GET /analytics/overview` — KPI aggregati (view, visitatori unici, pagine con traffico, trend). */
export async function getOverview(from: string, to: string): Promise<AnalyticsOverview> {
  try {
    const { data } = await api.get<AnalyticsOverviewDto>(`${ANALYTICS_PREFIX}/overview`, {
      params: { from, to },
    });
    return {
      ...data,
      // trendPercentage: number|null a runtime, il generatore OpenAPI lo tipizza
      // erroneamente come Record<string, never>|null (artefatto noto, non un bug da correggere qui).
      trendPercentage: data.trendPercentage as unknown as number | null,
    };
  } catch (err: unknown) {
    notifications.show({ color: 'red', message: 'Impossibile caricare i KPI di analytics' });
    throw err;
  }
}

/** `GET /analytics/timeseries` — serie temporale ordinata crescente (views/visitatori unici per bucket). */
export async function getTimeseries(
  from: string,
  to: string,
  interval?: 'day' | 'hour',
): Promise<AnalyticsTimeseriesDto> {
  try {
    const { data } = await api.get<AnalyticsTimeseriesDto>(`${ANALYTICS_PREFIX}/timeseries`, {
      params: { from, to, interval },
    });
    return data;
  } catch (err: unknown) {
    notifications.show({
      color: 'red',
      message: 'Impossibile caricare la serie temporale di analytics',
    });
    throw err;
  }
}

/** `GET /analytics/top-pages` — percorsi più visitati nell'intervallo, ordinati per view decrescenti. */
export async function getTopPages(
  from: string,
  to: string,
  limit?: number,
): Promise<AnalyticsTopPageDto[]> {
  try {
    const { data } = await api.get<AnalyticsTopPageDto[]>(`${ANALYTICS_PREFIX}/top-pages`, {
      params: { from, to, limit },
    });
    return data;
  } catch (err: unknown) {
    notifications.show({ color: 'red', message: 'Impossibile caricare le pagine più viste' });
    throw err;
  }
}

/** `GET /analytics/referrers` — sorgenti di traffico nell'intervallo, ordinate per conteggio decrescente. */
export async function getReferrers(
  from: string,
  to: string,
  limit?: number,
): Promise<AnalyticsReferrerDto[]> {
  try {
    const { data } = await api.get<AnalyticsReferrerDto[]>(`${ANALYTICS_PREFIX}/referrers`, {
      params: { from, to, limit },
    });
    return data;
  } catch (err: unknown) {
    notifications.show({ color: 'red', message: 'Impossibile caricare i referrer' });
    throw err;
  }
}

/** `GET /analytics/devices` — distribuzione dispositivi/browser nell'intervallo. */
export async function getDevices(from: string, to: string): Promise<AnalyticsDeviceStatsDto> {
  try {
    const { data } = await api.get<AnalyticsDeviceStatsDto>(`${ANALYTICS_PREFIX}/devices`, {
      params: { from, to },
    });
    return data;
  } catch (err: unknown) {
    notifications.show({
      color: 'red',
      message: 'Impossibile caricare la distribuzione dei dispositivi',
    });
    throw err;
  }
}
