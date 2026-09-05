/**
 * Voce di accordion (`accordionItem`, ADR-57 § 2): fuori `ROOT_ALLOWED`, stesso trattamento
 * di `navMenuItem`/`tabPanel`. `<details>/<summary>` nativi — l'apertura/chiusura è
 * comportamento del browser, zero JavaScript, zero stato React.
 *
 * `groupName` (opzionale): quando l'`accordion` padre ha `exclusive:true`, tutti i figli
 * condividono lo stesso attributo HTML `name` — aprirne uno chiude automaticamente gli altri
 * (comportamento nativo di `<details name>`, degrado gracioso ad apertura multipla sui
 * browser che non lo supportano, ADR-57 § 4). Calcolato e passato da `BlockRenderer.tsx`
 * (case `'accordion'`), mai da questo componente: una voce non conosce da sola se il proprio
 * genitore è esclusivo — `undefined` qui produce semplicemente un `<details>` senza `name`.
 *
 * Nessuna dipendenza Mantine (CLAUDE.md § confine Mantine/blocchi).
 */
import type { ReactNode } from 'react';
import styles from './AccordionItemBlock.module.css';

interface AccordionItemBlockProps {
  title: string;
  groupName?: string;
  children?: ReactNode;
}

export default function AccordionItemBlock({ title, groupName, children }: AccordionItemBlockProps) {
  return (
    <details className={styles.item} name={groupName}>
      <summary className={styles.summary}>{title}</summary>
      <div className={styles.panel}>{children}</div>
    </details>
  );
}
