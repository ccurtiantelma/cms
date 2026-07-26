/**
 * Timeout massimo (ms) per ogni singolo check dell'health endpoint. I client
 * applicativi (Redis, coda BullMQ) sono configurati con `maxRetriesPerRequest: null`
 * (raccomandazione ufficiale BullMQ per connessioni worker/coda): corretto per l'uso
 * normale come session store, ma significa che un comando resta in coda a tempo
 * indeterminato finché la connessione non torna — inaccettabile per una readiness
 * probe, che deve rispondere in tempi brevi. Ogni indicatore avvolge il proprio check
 * con `withTimeout` per garantire un esito `down` entro un tempo limitato.
 */
export const HEALTH_CHECK_TIMEOUT_MS = 3000;

/** Applica un timeout a una promise: la rigetta se non si risolve entro `ms`. */
export async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label}: timeout dopo ${ms}ms`)), ms);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timer!);
  }
}
