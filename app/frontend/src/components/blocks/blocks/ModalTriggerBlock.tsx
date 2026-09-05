/**
 * Blocco `modalTrigger` (ADR-57 § 2): contenitore CSS-only a regione unica (non una coppia
 * contenitore/voce come accordion/tabs/carousel — un modale ha un solo corpo). Tecnica
 * `:target`: il trigger è un `<a href="#modal-{nodeId}">`, il pannello è l'elemento con quel
 * `id` — nessuno stato React, nessun event handler, l'apertura/chiusura è la sola navigazione
 * del browser verso/fuori da un frammento URL.
 *
 * `id` di ancora derivato dall'`id` del nodo (`modal-{nodeId}`, ADR-57 § 2), non una prop —
 * calcolato qui una sola volta e riusato sia per il trigger sia per il pannello, mai duplicato.
 *
 * Limiti dichiarati dall'ADR (§ 4), non colmabili in CSS puro: nessun focus trap, nessun
 * `aria-modal` dinamico (quello statico sotto è sempre presente, indipendentemente da
 * `:target` — "dinamico" nell'ADR significa "non lo aggiorna un runtime", non "assente"),
 * nessuna chiusura da tastiera Escape. Il link "Chiudi" (`href="#"`) è comunque zero-JS: pulisce
 * il frammento dell'URL, quindi il pannello smette di corrispondere a `:target`. Quando il
 * pannello non è `:target`, `display: none` lo esclude anche dall'albero di accessibilità —
 * nessun `aria-hidden` aggiuntivo necessario.
 *
 * Nessuna dipendenza Mantine (CLAUDE.md § confine Mantine/blocchi).
 */
import type { ReactNode } from 'react';
import styles from './ModalTriggerBlock.module.css';

interface ModalTriggerBlockProps {
  nodeId: string;
  triggerLabel: string;
  animation: 'none' | 'fade' | 'slide-down';
  children?: ReactNode;
}

export default function ModalTriggerBlock({
  nodeId,
  triggerLabel,
  animation,
  children,
}: ModalTriggerBlockProps) {
  const anchorId = `modal-${nodeId}`;
  const panelClassName = [
    styles.panel,
    animation === 'fade' ? styles.fade : '',
    animation === 'slide-down' ? styles.slideDown : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <span className={styles.root}>
      <a href={`#${anchorId}`} className={styles.trigger}>
        {triggerLabel}
      </a>
      <div id={anchorId} className={panelClassName} role="dialog" aria-modal="true">
        <div className={styles.body}>
          <a href="#" className={styles.close} aria-label="Chiudi">
            ×
          </a>
          {children}
        </div>
      </div>
    </span>
  );
}
