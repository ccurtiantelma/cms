/**
 * "Ghost card" del `DragOverlay` di dnd-kit: icona + etichetta del tipo di blocco trascinato
 * (nuovo dalla palette, o riordino di un nodo esistente — stesso aspetto per entrambi).
 * La trasparenza va sul contenuto (`styles.dragGhostContent`), non sul `Paper` bordo: un bordo
 * sbiadito sarebbe meno leggibile del contenuto sbiadito. `DragOverlay` segue già il cursore
 * da solo: nessun calcolo di posizione qui.
 */
import { createElement } from 'react';
import { Paper, Text } from '@mantine/core';
import { DragOverlay, type DragStartEvent } from '@dnd-kit/core';
import { BLOCK_TYPES } from '../../../types/blocks.types';
import { blockIcon } from './block-icon';
import styles from './FullScreenEditorLayout.module.css';

/** Etichetta + nome icona del registro (`meta.icon`), risolta con la stessa `blockIcon` di `BlockPalette.tsx`. */
export interface DraggedBlockInfo {
  label: string;
  iconName: string | undefined;
}

/**
 * Legge dal payload di dnd-kit (`event.active.data.current`, valorizzato sia da
 * `WidgetPalette` sia da `useDraggable` in `EditorBlockWrapper.tsx`) etichetta e icona del
 * tipo di blocco trascinato.
 */
export function draggedBlockInfo(event: DragStartEvent): DraggedBlockInfo {
  const type = (event.active.data.current as { type?: string } | undefined)?.type;
  const descriptor = type ? BLOCK_TYPES.find((entry) => entry.type === type) : undefined;
  return {
    label: descriptor?.meta?.label ?? type ?? 'Blocco',
    iconName: descriptor?.meta?.icon,
  };
}

export interface EditorDragOverlayProps {
  draggedBlock: DraggedBlockInfo | null;
}

export default function EditorDragOverlay({ draggedBlock }: EditorDragOverlayProps): JSX.Element {
  // `createElement` invece del tag JSX (stesso motivo di `WidgetPalette.tsx`, `react-hooks/static-components`).
  const icon = draggedBlock ? createElement(blockIcon(draggedBlock.iconName), { size: 16 }) : null;
  return (
    <DragOverlay>
      {draggedBlock ? (
        <Paper withBorder p="xs" radius="sm" shadow="md">
          <div className={styles.dragGhostContent}>
            {icon}
            <Text size="sm" fw={600}>
              {draggedBlock.label}
            </Text>
          </div>
        </Paper>
      ) : null}
    </DragOverlay>
  );
}
