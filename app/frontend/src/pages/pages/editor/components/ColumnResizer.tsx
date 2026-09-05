/**
 * Maniglia visiva di ridimensionamento inter-colonna di una `section` a due colonne
 * (estratta da `EditorBlockWrapper.tsx`, dove viveva inline, nello stesso pattern
 * chirurgico già seguito da `ContainerResizeHandle.tsx`): striscia verticale fra le due
 * colonne, più un badge che riporta la ripartizione in tempo reale (`"33% / 67%"`) mentre
 * il puntatore trascina.
 *
 * Componente **di chrome dell'editor**, non un componente di blocco: vive qui e non in
 * `components/blocks/blocks/Section.tsx`, che il sito pubblico condivide (ADR-22 § 5) e
 * non deve ereditare né la maniglia né la sua dipendenza da Mantine.
 *
 * Puramente presentazionale: non conosce lo store, non calcola lo stop più vicino, non
 * decide quando mostrarsi. Riceve lo stop già risolto (anteprima durante il trascinamento,
 * altrimenti il valore persistito) e i quattro handler del gesto da
 * `EditorBlockWrapper.tsx`, che è l'unico a sapere dove sono i bordi della `section`.
 */
import type { PointerEvent as ReactPointerEvent } from 'react';
import { Text } from '@mantine/core';
import {
  COLUMN_RATIO_BOUNDARY_PERCENT,
  formatColumnRatioBadge,
  type ColumnRatioValue,
} from '../column-resize.utils';
import styles from './ColumnResizer.module.css';

interface ColumnResizerProps {
  /** Stop corrente: anteprima durante il trascinamento, valore persistito a riposo. */
  ratio: ColumnRatioValue;
  /** Il trascinamento è in corso: la maniglia passa allo stato attivo e il badge compare. */
  isResizing: boolean;
  /** Etichetta accessibile — porta il valore corrente della ripartizione. */
  ariaLabel: string;
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerCancel: (event: ReactPointerEvent<HTMLDivElement>) => void;
}

export default function ColumnResizer({
  ratio,
  isResizing,
  ariaLabel,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
}: ColumnResizerProps) {
  return (
    <div
      className={[styles.handle, isResizing ? styles.handleActive : ''].filter(Boolean).join(' ')}
      style={{ left: `${COLUMN_RATIO_BOUNDARY_PERCENT[ratio]}%` }}
      data-testid="column-resizer-handle"
      // `separator` con orientamento verticale: stesso ruolo ARIA della maniglia di
      // ridimensionamento di `container` (`ContainerResizeHandle.tsx`), stesso gesto su un
      // altro bersaglio.
      role="separator"
      aria-orientation="vertical"
      aria-label={ariaLabel}
      // Il click sulla maniglia non deve risalire al wrapper della Section (che la
      // riselezionerebbe) né al contenitore che la ospita.
      onClick={(event) => event.stopPropagation()}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      <span className={styles.grip} aria-hidden="true" />
      {isResizing && (
        <Text size="xs" fw={600} className={styles.badge} data-testid="column-resizer-badge">
          {formatColumnRatioBadge(ratio)}
        </Text>
      )}
    </div>
  );
}
