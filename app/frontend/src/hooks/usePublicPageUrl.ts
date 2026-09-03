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
 *
 * Accetta anche un `guid` nudo (stringa) invece di un `PageRecord` già in mano — caso del
 * blocco `navMenu` (F16-01), che a differenza del dettaglio Pagina non ha già caricato la
 * riga della pagina di destinazione: parte da un giro in più su `fetchPage(guid)` per
 * conoscerne `slug`/`parentGuid`/`status`, poi risale gli antenati come nel caso `PageRecord`.
 * Nota architetturale per chi consuma questo hook da un componente blocco condiviso con
 * `app/public-site` (ADR-22 § 3): l'effetto non gira mai sotto `renderToStaticMarkup` (niente
 * JS lato sito pubblico, ADR-22 § 2) — su quel percorso l'hook resta `null` per costruzione.
 * Un `pageGuid` deve quindi arrivare già risolto in un `url` assoluto prima del render SSR;
 * questo hook copre solo i contesti con JS attivo (canvas dell'editor).
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
export const PUBLIC_SITE_URL = import.meta.env.VITE_PUBLIC_SITE_URL || 'http://localhost:55000';

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
export function usePublicPageUrl(page: PageRecord | string | null): string | null {
  const [url, setUrl] = useState<string | null>(null);

  const isGuid = typeof page === 'string';
  const guid = isGuid ? page : page?.guid;
  // Con un `guid` nudo non si conosce ancora slug/status: si scoprono nell'effetto,
  // con un giro in più su `fetchPage`. Con un `PageRecord` già in mano restano questi.
  const knownSlug = isGuid ? undefined : page?.slug;
  const knownParentGuid = isGuid ? undefined : (page?.parentGuid ?? null);
  const knownStatus = isGuid ? undefined : page?.status;

  useEffect(() => {
    if (!guid) {
      setUrl(null);
      return;
    }
    // Fast-path solo quando lo stato è già noto (caso `PageRecord`): un `guid` nudo deve
    // sempre passare da `fetchPage` per scoprirlo.
    if (knownSlug !== undefined && knownStatus !== 'published') {
      setUrl(null);
      return;
    }

    let cancelled = false;

    async function resolve(): Promise<void> {
      try {
        let slug = knownSlug;
        let ancestorGuid = knownParentGuid ?? null;

        if (slug === undefined) {
          const self = await fetchPage(guid as string);
          if (self.status !== 'published') {
            if (!cancelled) setUrl(null);
            return;
          }
          slug = self.slug;
          ancestorGuid = self.parentGuid ?? null;
        }

        const segments = [slug as string];
        let lookups = 0;
        while (ancestorGuid && lookups < MAX_ANCESTOR_LOOKUPS) {
          const ancestor = await fetchPage(ancestorGuid);
          segments.unshift(ancestor.slug);
          ancestorGuid = ancestor.parentGuid;
          lookups += 1;
        }

        if (cancelled) return;
        // Catena ancora aperta dopo il tetto: il percorso sarebbe incompleto, quindi errato.
        setUrl(ancestorGuid ? null : `${PUBLIC_SITE_URL}/${segments.join('/')}`);
      } catch {
        // Pagina o antenato non leggibile (eliminato, permessi): nessun URL, nessuna
        // notifica — è un'informazione accessoria, non un'operazione fallita.
        if (!cancelled) setUrl(null);
      }
    }

    void resolve();
    return () => {
      cancelled = true;
    };
  }, [guid, knownSlug, knownParentGuid, knownStatus]);

  return url;
}
