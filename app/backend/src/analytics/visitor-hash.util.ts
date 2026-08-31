import { createHash } from 'crypto';
import { AppConstants } from '../common/app-constants';

/**
 * Anonimizzazione del visitatore, GDPR/zero-cookie (SPEC AnalyticsModule).
 * L'IP grezzo non viene MAI persistito né loggato: solo l'hash SHA-256 di
 * IP+user-agent, salato con un salt che ruota ogni giorno UTC. Conseguenza
 * intenzionale: gli hash non sono correlabili tra giornate diverse —
 * `uniqueVisitorsCount` è una metrica giornaliera, non un deduplicato
 * cross-day.
 */

/** Data UTC corrente in forma `YYYY-MM-DD`, base della rotazione giornaliera del salt. */
function currentUtcDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Salt derivato da `AppConstants.analyticsSaltSecret` e dalla data UTC corrente. */
export function computeDailySalt(date: Date = new Date()): string {
  return createHash('sha256')
    .update(`${AppConstants.analyticsSaltSecret}:${currentUtcDateString(date)}`)
    .digest('hex');
}

/**
 * Hash SHA-256 esadecimale (64 char) del visitatore per la giornata UTC di
 * `date`. Mai l'IP grezzo persistito: solo questo digest entra in
 * `analytics_events.visitor_hash`.
 */
export function computeVisitorHash(
  clientIp: string,
  userAgent: string,
  date: Date = new Date(),
): string {
  const dailySalt = computeDailySalt(date);
  return createHash('sha256').update(`${dailySalt}:${clientIp}:${userAgent}`).digest('hex');
}
