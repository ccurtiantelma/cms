/**
 * Blocco `navMenu` (ADR-52): contenitore puro, `children.allow: ['navMenuItem']` — nessuna
 * prop propria (il registro backend lo dichiara `props: []`). Itera i figli `navMenuItem`,
 * ognuno dei quali renderizza il proprio `<li>` (vedi `NavMenuItemBlock.tsx`): stesso
 * principio di composizione a children di `form`/`form-field` (ADR-46 § 1) — il contenitore
 * monta, ogni figlio si incapsula da solo.
 *
 * Toggle mobile: nessuno stato React, nessun JavaScript — un checkbox nascosto (`kind`
 * "checkbox hack") con `<label>` come pulsante hamburger, letto da `NavMenuBlock.module.css`
 * via selettori di pari livello. Necessario perché questo componente è lo stesso consumato
 * da `app/public-site` (ADR-22 § 3), che non idrata nulla e non ha JavaScript client (ADR-22
 * § 2): un `useState` per aprire/chiudere il drawer funzionerebbe nel Canvas dell'editor ma
 * resterebbe morto — e il drawer sempre chiuso — sul sito pubblico. Il breakpoint è una
 * container query sul `<nav>` stesso, non `@media`: nel Canvas dell'editor la vista mobile
 * simulata è un contenitore ridimensionato, non il viewport reale del browser, e solo una
 * container query reagisce a quello (soglia 768px allineata a "tablet" di `style-tokens.module.css`).
 *
 * Questo file non importa Mantine (CLAUDE.md § confine Mantine/blocchi): l'icona hamburger è
 * tre `<span>` disegnati via CSS, nessuna dipendenza nuova.
 */
import { useId, type ReactNode } from 'react';
import styles from './NavMenuBlock.module.css';

interface NavMenuBlockProps {
  children?: ReactNode;
}

export default function NavMenuBlock({ children }: NavMenuBlockProps) {
  const toggleId = useId();

  return (
    <nav className={styles.nav} aria-label="Menu di navigazione">
      <input type="checkbox" id={toggleId} className={styles.toggleInput} />
      <label htmlFor={toggleId} className={styles.toggleLabel} aria-label="Apri il menu">
        <span className={styles.toggleBar} />
        <span className={styles.toggleBar} />
        <span className={styles.toggleBar} />
      </label>
      <ul className={styles.list}>{children}</ul>
    </nav>
  );
}
