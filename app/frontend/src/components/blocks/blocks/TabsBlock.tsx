/**
 * Blocco `tabs` (ADR-57 § 2): contenitore CSS-only, `children.allow: ['tabPanel']`, nessuna
 * prop propria (registro: `props: []`). Wrapper puro — ogni figlio `tabPanel` porta con sé
 * il proprio radio-hack (`TabPanelBlock.tsx`), questo componente si limita a mettere i
 * pannelli in un contesto flex che il CSS riordina visivamente (etichette in riga sopra,
 * pannello attivo sotto), stesso principio di composizione di `NavMenuBlock.tsx`.
 *
 * `groupName` non è una prop di questo componente: è calcolato da `BlockRenderer.tsx` (case
 * `'tabs'`, dall'id del nodo, univoco per istanza) e passato direttamente a ciascun
 * `TabPanelBlock` figlio — un contenitore composto a `children` non conosce la forma dei
 * propri figli.
 *
 * Interamente CSS-only: radio nascosti + `<label>` + selettore `:checked ~`, zero
 * JavaScript, zero stato React. Stato non indirizzabile via URL e non persistente al reload
 * (ADR-57 § 4). Nessuna dipendenza Mantine (CLAUDE.md § confine Mantine/blocchi).
 */
import type { ReactNode } from 'react';
import styles from './TabsBlock.module.css';

interface TabsBlockProps {
  children?: ReactNode;
}

export default function TabsBlock({ children }: TabsBlockProps) {
  return <div className={styles.tabs}>{children}</div>;
}
