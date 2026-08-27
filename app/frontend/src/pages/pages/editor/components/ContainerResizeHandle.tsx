/**
 * Maniglia visiva di ridimensionamento orizzontale di un nodo `container` selezionato
 * (E03, punto 1): striscia verticale sul bordo destro del wrapper del blocco, più un badge
 * che riporta l'ampiezza in tempo reale (`50%`, `33.3%`, `100%`) mentre il puntatore
 * trascina.
 *
 * Componente **di chrome dell'editor**, non un componente di blocco: vive qui e non in
 * `components/blocks/blocks/Container.tsx` perché il sito pubblico condivide quel file
 * (ADR-22 § 5) e non deve ereditare né la maniglia né la sua dipendenza da Mantine —
 * stesso confine già tenuto dalla maniglia inter-colonna di `section`
 * (`EditorBlockWrapper.tsx`, `.columnResizer`).
 *
 * Puramente presentazionale: non conosce lo store, non calcola percentuali, non decide
 * quando mostrarsi. Riceve il valore già calcolato e i quattro handler del gesto da
 * `EditorBlockWrapper.tsx`, che è l'unico a sapere dove sono i bordi del nodo e del suo
 * contenitore padre.
 */
import type { PointerEvent as ReactPointerEvent } from 'react';
import { Text } from '@mantine/core';
import { formatContainerWidthBadge } from '../container-resize.utils';
import styles from './ContainerResizeHandle.module.css';

interface ContainerResizeHandleProps {
  /**
   * Ampiezza corrente in percentuale della larghezza del contenitore padre, già clampata
   * nell'intervallo del registro. `null` quando non c'è ancora una misura (il gesto non è
   * iniziato e il nodo non porta un valore persistito): il badge non viene mostrato,
   * la maniglia sì.
   */
  percent: number | null;
  /** Il trascinamento è in corso: la maniglia passa allo stato attivo e il badge compare. */
  isResizing: boolean;
  /** Etichetta accessibile — porta il tipo di blocco e l'ampiezza corrente. */
  ariaLabel: string;
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerCancel: (event: ReactPointerEvent<HTMLDivElement>) => void;
}

export default function ContainerResizeHandle({
  percent,
  isResizing,
  ariaLabel,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
}: ContainerResizeHandleProps) {
  return (
    <div
      className={[styles.handle, isResizing ? styles.handleActive : ''].filter(Boolean).join(' ')}
      data-testid="container-resize-handle"
      // `separator` con orientamento verticale: stesso ruolo ARIA della maniglia
      // inter-colonna di `section`, che è lo stesso gesto su un altro bersaglio.
      role="separator"
      aria-orientation="vertical"
      aria-label={ariaLabel}
      // Il click sulla maniglia non deve risalire al wrapper del blocco (che
      // riselezionerebbe il nodo) né al contenitore che lo ospita.
      onClick={(event) => event.stopPropagation()}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      <span className={styles.grip} aria-hidden="true" />
      {isResizing && percent !== null && (
        <Text size="xs" fw={600} className={styles.badge} data-testid="container-resize-badge">
          {formatContainerWidthBadge(percent)}
        </Text>
      )}
    </div>
  );
}
