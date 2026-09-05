/**
 * Blocco `accordion` (ADR-57 § 2): contenitore CSS-only, `children.allow: ['accordionItem']`.
 * Wrapper puro — nessuna prop propria da applicare qui: `exclusive` (attributo HTML `name`
 * condiviso fra i figli) è calcolato e passato direttamente a ciascun `AccordionItemBlock` da
 * `BlockRenderer.tsx` (case `'accordion'`), mai da questo componente, che non conosce la forma
 * dei propri figli — stesso principio di composizione di `NavMenuBlock.tsx`.
 *
 * Interamente CSS-only: l'apertura/chiusura di ogni voce è il comportamento nativo di
 * `<details>` (reso da `AccordionItemBlock.tsx`), zero JavaScript, zero stato React, zero
 * event handler. Nessuna dipendenza Mantine (CLAUDE.md § confine Mantine/blocchi).
 */
import type { ReactNode } from 'react';
import styles from './AccordionBlock.module.css';

interface AccordionBlockProps {
  children?: ReactNode;
}

export default function AccordionBlock({ children }: AccordionBlockProps) {
  return <div className={styles.accordion}>{children}</div>;
}
