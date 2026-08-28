/** Punto della serie analytics restituito dal backend. */
export interface AnalyticsSeriesPoint {
  date: string;
  visits: number;
  path?: string;
}

/** Statistiche aggregate delle pageview del sito pubblico. */
export interface SiteAnalytics {
  totalVisits: number;
  series: AnalyticsSeriesPoint[];
}

/** Statistiche aggregate sull'utilizzo dell'applicazione. */
export interface AppAnalytics {
  registeredUsers: number;
  activeUsers: number;
  successfulLogins: number;
  loginSeries: AnalyticsSeriesPoint[];
}

/** Risposta di `GET /analytics`. */
export interface AnalyticsResponse {
  site: SiteAnalytics;
  app: AppAnalytics;
}
