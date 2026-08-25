/**
 * Risolve l'URL pubblico di una Pagina, per il pulsante "Vedi pagina" del dettaglio.
 *
 * Perché serve un hook e non una stringa: il percorso pubblico è la catena degli slug
 * degli antenati (ADR-24 § 1 — risoluzione iterativa per segmenti), e `PageDto` porta solo
 * `slug` e `parentGuid`, non il percorso completo. Per una Pagina di radice — il caso
 * normale — non parte nessuna richiesta; per una Pagina annidata si risalgono gli antenati
 * uno alla volta, come farebbe il server scendendo.
 *
 * Il locale non compare mai nel percorso: la lingua di default non ha prefisso (ADR-24 § 5)
 * e oggi il sito è mono-lingua (A5). Quando F05 porterà le altre lingue, il prefisso si
 * aggiunge qui, non nei chiamanti.
 *
 * Un errore in risalita non produce un URL parziale: si restituisce `null` e il pulsante
 * non compare. Un link plausibile ma sbagliato sarebbe peggio della sua assenza.
 */
import { useEffect, useState } from 'react';
import { fetchPage } from '../services/pages.service';
import type { PageRecord } from '../types/pages.types';

/**
 * Origine del sito pubblico SSR (`app/public-site`, ADR-22). Il default combacia con
 * `PUBLIC_SITE_URL` del backend e con `PublicSiteConfig.port` del workspace pubblico.
 * Esportata perché è la stessa origine usata dal link di anteprima (ADR-25,
 * `{PUBLIC_SITE_URL}/__preview/:token` in `PagePageDetail.tsx`), non una costante duplicata.
 */
export const PUBLIC_SITE_URL = import.meta.env.VITE_PUBLIC_SITE_URL || 'http://localhost:54000';

/**
 * Tetto alle risalite verso gli antenati, allineato a `MAX_PUBLIC_PATH_SEGMENTS` del
 * backend: oltre quel numero di segmenti il server risponde comunque `404` senza nemmeno
 * consultare il database, quindi non c'è URL da costruire.
 */
const MAX_ANCESTOR_LOOKUPS = 20;

/**
 * URL pubblico assoluto della Pagina, o `null` se non ne esiste uno da mostrare: Pagina non
 * pubblicata (la superficie pubblica serve solo `published`, ADR-24), catena degli antenati
 * non risolvibile, o percorso oltre il guardrail del server.
 */
export function usePublicPageUrl(page: PageRecord | null): string | null {
  const [url, setUrl] = useState<string | null>(null);

  const guid = page?.guid;
  const slug = page?.slug;
  const parentGuid = page?.parentGuid ?? null;
  const status = page?.status;

  useEffect(() => {
    if (!guid || !slug || status !== 'published') {
      setUrl(null);
      return;
    }

    let cancelled = false;

    async function resolve(): Promise<void> {
      const segments = [slug as string];
      let ancestorGuid = parentGuid;
      let lookups = 0;

      try {
        while (ancestorGuid && lookups < MAX_ANCESTOR_LOOKUPS) {
          const ancestor = await fetchPage(ancestorGuid);
          segments.unshift(ancestor.slug);
          ancestorGuid = ancestor.parentGuid;
          lookups += 1;
        }
      } catch {
        // Antenato non leggibile (eliminato, permessi): nessun URL, nessuna notifica —
        // è un'informazione accessoria del dettaglio, non un'operazione fallita.
        if (!cancelled) setUrl(null);
        return;
      }

      if (cancelled) return;
      // Catena ancora aperta dopo il tetto: il percorso sarebbe incompleto, quindi errato.
      setUrl(ancestorGuid ? null : `${PUBLIC_SITE_URL}/${segments.join('/')}`);
    }

    void resolve();
    return () => {
      cancelled = true;
    };
  }, [guid, slug, parentGuid, status]);

  return url;
}
