/**
 * Sonda passiva di raggiungibilità del sito pubblico SSR (`app/public-site`, porta 54000),
 * per avvisare nel dettaglio Pagina che il pulsante "Vedi pagina" potrebbe puntare a un
 * servizio fermo. Interroga `GET {baseUrl}/healthz` — endpoint sempre `200 "ok"`, senza
 * autenticazione, esposto da `app/public-site/src/server.ts`.
 *
 * `mode: 'no-cors'`: `app/public-site` non porta header CORS (è un servizio SSR pensato per
 * essere consumato da un browser che naviga direttamente lì, non da fetch cross-origin), e
 * questa sonda non ha bisogno di leggere il corpo della risposta — le sta bene sapere solo
 * se la richiesta di rete è arrivata a destinazione. Una risposta "opaque" (status sempre
 * `0`, `ok` sempre `false` per via del CORS) è comunque la prova che il server ha risposto;
 * una connessione rifiutata, un DNS che non risolve o il timeout restano un `throw`, che è
 * l'unico segnale che questo hook usa per marcare `unhealthy`.
 *
 * Sonda, non blocco: nessun controllo qui impedisce l'uso del link, che resta un vero
 * `href` funzionante indipendentemente dall'esito di questa verifica.
 */
import { useEffect, useState } from 'react';

/** Tetto di attesa della sonda: un controllo passivo non può competere con l'apertura del link. */
const HEALTH_CHECK_TIMEOUT_MS = 2500;

export type PublicSiteHealthStatus = 'checking' | 'healthy' | 'unhealthy';

/**
 * Stato di raggiungibilità di `baseUrl` (tipicamente `PUBLIC_SITE_URL`), o `'checking'`
 * finché `baseUrl` è `null` (nessun URL pubblico da verificare, es. Pagina non pubblicata)
 * o la richiesta è ancora in corso.
 */
export function usePublicSiteHealth(baseUrl: string | null): PublicSiteHealthStatus {
  const [status, setStatus] = useState<PublicSiteHealthStatus>('checking');

  useEffect(() => {
    if (!baseUrl) {
      setStatus('checking');
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT_MS);

    async function check(): Promise<void> {
      try {
        await fetch(`${baseUrl}/healthz`, { mode: 'no-cors', signal: controller.signal });
        if (!cancelled) setStatus('healthy');
      } catch {
        // Rete assente, timeout o server fermo: nessuna risposta è arrivata. Nessun log —
        // è un'informazione accessoria del dettaglio, non un'operazione fallita.
        if (!cancelled) setStatus('unhealthy');
      } finally {
        clearTimeout(timeoutId);
      }
    }

    void check();
    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timeoutId);
    };
  }, [baseUrl]);

  return status;
}
