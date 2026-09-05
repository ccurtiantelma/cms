/**
 * Pannello di tab (`tabPanel`, ADR-57 § 2): fuori `ROOT_ALLOWED`, stesso trattamento di
 * `navMenuItem`/`accordionItem`. Radio-hack CSS-only: un `<input type="radio">` nascosto +
 * `<label>` + il pannello vero e proprio, tutti e tre fratelli DOM diretti dentro il proprio
 * `.tabItem` (`display: contents`, TabsBlock.module.css li fa comparire come item flex
 * diretti di `TabsBlock` per il riordino visivo, senza spezzare la relazione di fratellanza
 * DOM di cui il selettore CSS `input:checked + label + .panel` ha bisogno). Zero JavaScript,
 * zero stato React: l'unica fonte di verità è lo stato nativo del radio button.
 *
 * `id` dell'`<input>`/`<label>` generato con `useId()` (stesso idioma di `NavMenuBlock.tsx`
 * per il proprio checkbox hamburger): stabile, univoco, SSR-safe, non richiede coordinamento
 * col genitore. `groupName` (attributo HTML `name` condiviso da ogni `tabPanel` fratello
 * dello stesso `tabs`) e `defaultChecked` (vero solo sul primo pannello, ADR-57 § "Tabs
 * produce ... primo pannello checked di default") arrivano invece da `BlockRenderer.tsx`
 * (case `'tabs'`), l'unico punto che conosce l'intero gruppo di fratelli.
 *
 * Nessuna dipendenza Mantine (CLAUDE.md § confine Mantine/blocchi).
 */
import { useId, type ReactNode } from 'react';
import styles from './TabPanelBlock.module.css';

interface TabPanelBlockProps {
  /**
   * Testo dell'etichetta cliccabile. Reso sempre da questo componente (mai duplicato dal
   * chiamante): anche nel raro caso "difensivo" in cui un `tabPanel` è raggiunto fuori da un
   * `tabs` padre (`BlockRenderer.tsx`, contenuto malformato/legacy), l'etichetta resta
   * visibile.
   */
  label: string;
  groupName: string;
  defaultChecked?: boolean;
  children?: ReactNode;
}

export default function TabPanelBlock({
  label,
  groupName,
  defaultChecked = false,
  children,
}: TabPanelBlockProps) {
  const inputId = useId();
  return (
    <div className={styles.tabItem}>
      <input
        type="radio"
        id={inputId}
        name={groupName}
        className={styles.tabInput}
        defaultChecked={defaultChecked}
      />
      <label htmlFor={inputId} className={styles.tabLabel}>
        {label}
      </label>
      <div className={styles.panel}>{children}</div>
    </div>
  );
}
