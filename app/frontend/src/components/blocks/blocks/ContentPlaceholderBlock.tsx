/**
 * Segnaposto visivo "Area Contenuto Pagina" per il Template Editor (Theme Builder, Template
 * di Sito). Non è un settimo tipo di blocco: il backend non ha alcun concetto di "punto di
 * iniezione contenuto" (verificato — nessun riferimento in
 * `app/backend/src/site-templates/template-resolver.service.ts` né in
 * `app/backend/src/blocks/block-registry.ts`), e introdurne uno richiederebbe una ADR, fuori
 * scope. La soluzione approvata resta un blocco `container` reale e già valido nello schema
 * (nessuna modifica di registro), riconosciuto qui solo dal valore della sua prop
 * `customElementId` (vedi {@link CONTENT_AREA_BLOCK_ID}) — mai dall'`id` strutturale del
 * nodo dell'albero, che `useBlockEditorStore` rigenera sempre a ogni inserimento
 * (`addBlockAction`/`insertSubtreeAction`, entrambi via `generateBlockId()`) senza esporre
 * alcun modo di imporne uno letterale dall'esterno.
 *
 * Componente di blocco: niente Mantine (CLAUDE.md § Regola Mantine — i blocchi non importano
 * Mantine), niente `@tabler/icons-react` (il segnaposto è raggiungibile anche dal sito
 * pubblico via lo stesso `BlockRenderer` condiviso, ADR-22 § 5 — l'alias `@blocks` di
 * `app/public-site/vite.config.ts` risolve **solo** dentro `components/blocks/`, e
 * quel workspace non dichiara `@tabler/icons-react` come dipendenza: un'icona SVG inline,
 * senza import, resta l'unica scelta compatibile con quel confine di build). Solo CSS
 * Modules e markup semantico.
 */
import type { ReactNode } from 'react';
import styles from './ContentPlaceholderBlock.module.css';

/**
 * Valore sentinella della prop `customElementId` (ADR-38 § 6, prop già dichiarata dal
 * registro per `container`) che marca un nodo come "Area Contenuto Pagina" — riconosciuto da
 * `BlockRenderer.tsx` per sostituire il rendering normale di `Container` con questo
 * segnaposto. Non introduce un nuovo `kind` né una nuova prop: `customElementId` è
 * `kind: 'htmlId'` ("solo lettere, numeri, trattino, underscore"), e questo valore rispetta
 * quel vincolo.
 */
export const CONTENT_AREA_BLOCK_ID = 'page-content-area';

interface ContentPlaceholderBlockProps {
  children?: ReactNode;
}

/**
 * Riquadro tratteggiato che simula, nell'editor e — finché non esiste una vera pipeline di
 * iniezione (fuori scope) — anche nel rendering pubblico, il punto in cui il contenuto reale
 * della Pagina verrà innestato in un Template di Sito. Renderizza comunque i propri figli
 * (un `container` è per costruzione un nodo che può averne), così un contenuto annidato per
 * errore non sparisce silenziosamente.
 */
export default function ContentPlaceholderBlock({
  children,
}: ContentPlaceholderBlockProps): JSX.Element {
  return (
    <div className={styles.root} data-block-role="content-area">
      <svg
        className={styles.icon}
        width="28"
        height="28"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        aria-hidden="true"
      >
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <line x1="3" y1="9" x2="21" y2="9" />
        <line x1="8" y1="9" x2="8" y2="20" />
      </svg>
      <p className={styles.label}>Area Contenuto Pagina</p>
      <p className={styles.hint}>
        Qui verrà inserito il contenuto della Pagina che usa questo Template.
      </p>
      {children}
    </div>
  );
}
