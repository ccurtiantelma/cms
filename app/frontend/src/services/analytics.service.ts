/** Accesso alle statistiche aggregate del sito pubblico e dell'applicazione. */
import { notifications } from '@mantine/notifications';
import api from './api';
import type { AnalyticsResponse } from '../types/analytics.types';

/** Recupera le statistiche analytics nell'intervallo di date inclusivo indicato. */
export async function fetchAnalytics(from: string, to: string): Promise<AnalyticsResponse> {
  try {
    const { data } = await api.get<AnalyticsResponse>('analytics', { params: { from, to } });
    return data;
  } catch (err: unknown) {
    notifications.show({ color: 'red', message: 'Impossibile caricare le statistiche' });
    throw err;
  }
}
