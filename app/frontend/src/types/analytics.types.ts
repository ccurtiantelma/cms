/**
 * Tipi locali del modulo Analytics. I DTO generati da OpenAPI in
 * `api.types.ts` (`components['schemas']['Analytics*Dto']`) restano la fonte
 * primaria e vanno importati direttamente dove non serve correzione: qui
 * vive solo il tipo corretto per `AnalyticsOverviewDto.trendPercentage`, che
 * il generatore OpenAPI tipizza erroneamente (vedi `analytics.service.ts`).
 */
import type { components } from './api.types';

/**
 * `AnalyticsOverviewDto` con `trendPercentage` corretto a `number | null`:
 * a runtime è sempre un numero (o `null` se il periodo precedente non ha
 * traffico), ma il generatore OpenAPI lo tipizza come `Record<string, never> | null`
 * a causa dell'esempio numerico nello schema.
 */
export interface AnalyticsOverview extends Omit<
  components['schemas']['AnalyticsOverviewDto'],
  'trendPercentage'
> {
  trendPercentage: number | null;
}
