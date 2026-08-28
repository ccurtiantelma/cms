import { NavLink, Stack, Text } from '@mantine/core';
import { useState, type DragEvent } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useBlockEditorStore, useSelectedId } from '../../../hooks/useBlockEditorStore';
import { findLocation, type BlockNode } from './block-tree.utils';
import { allowedChildTypes } from './block-registry.utils';
import CanvasContextMenu from './CanvasContextMenu';
import styles from './BlockTreeNavigator.module.css';

type DropPosition = 'before' | 'after' | 'inside';

interface DropTarget {
  id: string;
  position: DropPosition;
}

interface BlockTreeNodeProps {
  node: BlockNode;
  selectedId: string | null;
  onSelect: (id: string) => void;
  draggedId: string | null;
  dropTarget: DropTarget | null;
  onDragStart: (event: DragEvent<HTMLDivElement>, id: string) => void;
  onDragOver: (event: DragEvent<HTMLDivElement>, node: BlockNode) => void;
  onDrop: (event: DragEvent<HTMLDivElement>, node: BlockNode) => void;
  onDragEnd: () => void;
}

function BlockTreeNode({
  node,
  selectedId,
  onSelect,
  draggedId,
  dropTarget,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: BlockTreeNodeProps): JSX.Element {
  const [opened, setOpened] = useState(true);
  const hasChildren = node.children.length > 0;
  const isDropTarget = dropTarget?.id === node.id;
  const nodeClassName = [
    styles.node,
    draggedId === node.id ? styles.dragging : '',
    isDropTarget && dropTarget.position === 'before' ? styles.dropBefore : '',
    isDropTarget && dropTarget.position === 'after' ? styles.dropAfter : '',
    isDropTarget && dropTarget.position === 'inside' ? styles.dropContainer : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={nodeClassName}
      draggable={true}
      data-block-id={node.id}
      onDragStart={(event) => onDragStart(event, node.id)}
      onDragOver={(event) => onDragOver(event, node)}
      onDrop={(event) => onDrop(event, node)}
      onDragEnd={onDragEnd}
    >
      <NavLink
        label={`${node.type} (${node.id})`}
        active={node.id === selectedId}
        opened={opened}
        childrenOffset={20}
        onClick={() => {
          onSelect(node.id);
          if (hasChildren) setOpened((current) => !current);
        }}
        aria-label={`Seleziona ${node.type} ${node.id}`}
      >
        {hasChildren &&
          node.children.map((child) => (
            <BlockTreeNode
              key={child.id}
              node={child}
              selectedId={selectedId}
              onSelect={onSelect}
              draggedId={draggedId}
              dropTarget={dropTarget}
              onDragStart={onDragStart}
              onDragOver={onDragOver}
              onDrop={onDrop}
              onDragEnd={onDragEnd}
            />
          ))}
      </NavLink>
    </div>
  );
}

/** Navigator ricorsivo dell'albero dei blocchi, sincronizzato con la selezione dell'editor. */
export default function BlockTreeNavigator(): JSX.Element {
  const tree = useBlockEditorStore(useShallow((state) => state.tree));
  const selectedId = useSelectedId();
  const selectNode = useBlockEditorStore((state) => state.selectNode);
  const moveNodeToAction = useBlockEditorStore((state) => state.moveNodeToAction);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);

  function handleDragStart(event: DragEvent<HTMLDivElement>, id: string): void {
    setDraggedId(id);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', id);
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>, node: BlockNode): void {
    const sourceId = draggedId ?? event.dataTransfer.getData('text/plain');
    if (!sourceId || sourceId === node.id) return;

    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'move';
    setDropTarget({ id: node.id, position: allowedChildTypes(node.type).length > 0 ? 'inside' : 'after' });
  }

  function handleDrop(event: DragEvent<HTMLDivElement>, node: BlockNode): void {
    event.preventDefault();
    event.stopPropagation();

    const sourceId = draggedId ?? event.dataTransfer.getData('text/plain');
    if (!sourceId || sourceId === node.id) return;

    if (allowedChildTypes(node.type).length > 0) {
      moveNodeToAction(sourceId, node.id, node.children.length);
      setDropTarget(null);
      return;
    }

    const sourceLocation = findLocation(tree, sourceId);
    const targetLocation = findLocation(tree, node.id);
    if (!sourceLocation || !targetLocation) return;

    let targetIndex = targetLocation.index + 1;
    if (sourceLocation.parentId === targetLocation.parentId && sourceLocation.index < targetIndex) {
      targetIndex -= 1;
    }
    moveNodeToAction(sourceId, targetLocation.parentId, targetIndex);
    setDropTarget(null);
  }

  function handleDragEnd(): void {
    setDraggedId(null);
    setDropTarget(null);
  }

  return (
    <CanvasContextMenu>
      <Stack gap={2} role="tree" aria-label="Navigator dei blocchi">
        {tree.length === 0 ? (
          <Text size="sm" c="dimmed">
            Nessun blocco nella bozza.
          </Text>
        ) : (
          tree.map((node) => (
            <BlockTreeNode
              key={node.id}
              node={node}
              selectedId={selectedId}
              onSelect={selectNode}
              draggedId={draggedId}
              dropTarget={dropTarget}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onDragEnd={handleDragEnd}
            />
          ))
        )}
      </Stack>
    </CanvasContextMenu>
  );
}
