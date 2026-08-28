import { ActionIcon, Text } from '@mantine/core';
import { useDroppable } from '@dnd-kit/core';
import { IconPlus } from '@tabler/icons-react';
import { useBlockEditorStore } from '../../../hooks/useBlockEditorStore';
import { BLOCK_TYPES } from '../../../types/blocks.types';
import { defaultPropsFor } from './block-registry.utils';
import CanvasDropIndicator from './CanvasDropIndicator';
import styles from './CanvasSectionInserter.module.css';

interface CanvasSectionInserterProps {
  /** Posizione fra i nodi radice in cui inserire la nuova sezione. */
  index: number;
  /** Stato vuoto: il controllo occupa il centro del canvas. */
  empty?: boolean;
}

const sectionDescriptor = BLOCK_TYPES.find((descriptor) => descriptor.type === 'section');
const containerDescriptor = BLOCK_TYPES.find((descriptor) => descriptor.type === 'container');

/** Inseritore Elementor-style per una nuova sezione con contenitore iniziale. */
export default function CanvasSectionInserter({
  index,
  empty = false,
}: CanvasSectionInserterProps): JSX.Element {
  const addBlockAction = useBlockEditorStore((state) => state.addBlockAction);
  const { setNodeRef, isOver } = useDroppable({
    id: `root-section-inserter:${index}`,
    data: { parentId: null, index },
  });

  function addSection(): void {
    if (!sectionDescriptor || !containerDescriptor) return;

    addBlockAction(null, 'section', index, defaultPropsFor(sectionDescriptor));
    const tree = useBlockEditorStore.getState().tree;
    const section = tree[Math.max(0, Math.min(index, tree.length - 1))];
    if (section?.type === 'section') {
      addBlockAction(section.id, 'container', 0, defaultPropsFor(containerDescriptor));
    }
  }

  return (
    <div
      ref={setNodeRef}
      className={`${styles.inserter} ${empty ? styles.empty : styles.between}`}
      data-over={isOver}
      onClick={(event) => event.stopPropagation()}
    >
      <CanvasDropIndicator visible={isOver} />
      <ActionIcon
        className={styles.button}
        variant="filled"
        radius="xl"
        aria-label="Aggiungi Sezione"
        onClick={addSection}
      >
        <IconPlus size={16} />
      </ActionIcon>
      <Text className={styles.label}>Aggiungi Sezione</Text>
    </div>
  );
}
