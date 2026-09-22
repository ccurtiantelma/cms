/**
 * Corpo di un blocco contenitore: il componente di contenuto di F02 (`CONTAINER_COMPONENTS`,
 * gli stessi del sito pubblico) con dentro la zona di rilascio "dentro", i bersagli di colonna,
 * i figli avvolti (`renderChild`, un `EditorBlockWrapper` per figlio) o i segnaposto vuoti.
 * `renderChild` evita l'import circolare col wrapper che lo monta.
 */
import type { ComponentProps, ReactNode } from 'react';
import BlockErrorBoundary from '../../../../components/blocks/BlockErrorBoundary';
import { useBlockEditorStore } from '../../../../hooks/useBlockEditorStore';
import type { BlockLocation, BlockNode } from '../block-tree.utils';
import BlockPalette from '../BlockPalette';
import ColumnResizer from '../components/ColumnResizer';
import type { ColumnRatioValue } from '../column-resize.utils';
import { CONTAINER_COMPONENTS } from './container-components';
import {
  resolveContainerComponentProps,
  type WidgetParentCompositeProps,
} from './resolve-container-props';
import ColumnDropTarget from './ColumnDropTarget';
import { dropZoneAttrs } from './useBlockDrag';
import styles from '../EditorBlockWrapper.module.css';

interface BlockContainerBodyProps {
  node: BlockNode;
  location: BlockLocation & { parentType: string | undefined };
  parentCompositeProps: WidgetParentCompositeProps | undefined;
  childIds: readonly string[];
  isSection: boolean;
  columnsCount: number;
  showColumnResizer: boolean;
  columnRatio: ColumnRatioValue;
  isResizingColumns: boolean;
  columnHandlers: Pick<
    ComponentProps<typeof ColumnResizer>,
    'onPointerDown' | 'onPointerMove' | 'onPointerUp' | 'onPointerCancel'
  >;
  /** Callback di registrazione della zona di rilascio "dentro" (`useDroppable().setNodeRef`). */
  registerDropInside: (el: HTMLElement | null) => void;
  isOverInside: boolean;
  activeDragId: string | null;
  activeDragType: string | undefined;
  renderChild: (childId: string) => ReactNode;
}

export default function BlockContainerBody({
  node,
  location,
  parentCompositeProps,
  childIds,
  isSection,
  columnsCount,
  showColumnResizer,
  columnRatio,
  isResizingColumns,
  columnHandlers,
  registerDropInside,
  isOverInside,
  activeDragId,
  activeDragType,
  renderChild,
}: BlockContainerBodyProps): JSX.Element | null {
  const selectNode = useBlockEditorStore((state) => state.selectNode);
  const ContainerComponent = CONTAINER_COMPONENTS[node.type];
  if (!ContainerComponent) return null;

  const emptySlot = (key?: number): JSX.Element => (
    <div
      key={key}
      className={styles.emptyContainer}
      // Seleziona il contenitore come target prima del menu di inserimento (F08 STEP 3).
      onClick={(event) => {
        event.stopPropagation();
        selectNode(node.id);
      }}
    >
      <BlockPalette
        parentId={node.id}
        parentType={node.type}
        label="Aggiungi blocco"
        size="sm"
        variant="default"
        iconOnly
        triggerClassName={styles.emptyContainerTrigger}
      />
    </div>
  );

  return (
    <BlockErrorBoundary>
      <ContainerComponent
        {...resolveContainerComponentProps(node, location, parentCompositeProps)}
        // Anteprima 60fps: la Section riceve lo stop effettivo, non il solo valore salvato.
        {...(showColumnResizer ? { columnRatio: columnRatio } : {})}
      >
        {/* Overlay "dentro questo contenitore" (`position: absolute; inset: 0`): mai un box che avvolge i figli, o la griglia collasserebbe. */}
        <div
          ref={registerDropInside}
          className={[styles.containerDropZone, isSection ? styles.containerDropZoneSection : '']
            .filter(Boolean)
            .join(' ')}
          {...dropZoneAttrs(isOverInside, activeDragId, activeDragType, node.id)}
        />

        {isSection &&
          columnsCount > 1 &&
          Array.from({ length: columnsCount }).map((_, columnIndex) => (
            <ColumnDropTarget
              key={`column-drop-${columnIndex}`}
              parentId={node.id}
              columnIndex={columnIndex}
              columnCount={columnsCount}
              activeDragId={activeDragId}
              activeDragType={activeDragType}
            />
          ))}

        {/* `.childrenArea` è `display: contents`: i figli restano veri grid item del genitore. */}
        {childIds.length === 0 ? (
          columnsCount > 1 ? (
            <div className={styles.childrenArea}>
              {Array.from({ length: columnsCount }).map((_, slot) => emptySlot(slot))}
            </div>
          ) : (
            emptySlot()
          )
        ) : (
          <div className={styles.childrenArea}>
            {childIds.map((childId) => renderChild(childId))}
            {showColumnResizer && (
              <ColumnResizer
                ratio={columnRatio}
                isResizing={isResizingColumns}
                ariaLabel={`Ridimensiona le colonne della Section (attuale: ${columnRatio})`}
                {...columnHandlers}
              />
            )}
          </div>
        )}
      </ContainerComponent>
    </BlockErrorBoundary>
  );
}
