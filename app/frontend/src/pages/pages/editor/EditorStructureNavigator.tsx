/**
 * Contenuto del pannello destro "Struttura/Navigator" dell'editor full-screen
 * (`FullScreenEditorLayout`): l'albero dei blocchi in editing, con selezione dal nome invece
 * che dal canvas — utile quando un blocco è fuori dalla viewport simulata corrente.
 *
 * Sottoscrive solo gli id di radice (`useShallow`, come `EditorCanvas`) e risolve
 * ricorsivamente le etichette dal registro (`BLOCK_TYPES`): nessuno stato duplicato rispetto
 * allo store dell'albero, questo componente legge e basta.
 */
import { NavLink, ScrollArea, Text } from '@mantine/core';
import { useShallow } from 'zustand/react/shallow';
import { useBlockEditorStore, useSelectedId } from '../../../hooks/useBlockEditorStore';
import { BLOCK_TYPES } from '../../../types/blocks.types';
import type { BlockNode } from './block-tree.utils';

/** Etichetta leggibile di un tipo di blocco, presa dal registro (mai scritta a mano). */
function blockLabel(type: string): string {
  return BLOCK_TYPES.find((descriptor) => descriptor.type === type)?.meta?.label ?? type;
}

interface StructureNodeProps {
  node: BlockNode;
  depth: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

/** Una voce dell'albero, con i suoi figli resi in ricorsione. */
function StructureNode({ node, depth, selectedId, onSelect }: StructureNodeProps): JSX.Element {
  return (
    <NavLink
      label={blockLabel(node.type)}
      active={node.id === selectedId}
      onClick={() => onSelect(node.id)}
      style={{ paddingLeft: depth * 12 }}
      childrenOffset={0}
      defaultOpened
    >
      {node.children.map((child) => (
        <StructureNode
          key={child.id}
          node={child}
          depth={depth + 1}
          selectedId={selectedId}
          onSelect={onSelect}
        />
      ))}
    </NavLink>
  );
}

/** Navigator dell'albero di blocchi della bozza corrente. */
export default function EditorStructureNavigator(): JSX.Element {
  const rootIds = useBlockEditorStore(useShallow((state) => state.tree.map((node) => node.id)));
  const roots = useBlockEditorStore(useShallow((state) => state.tree));
  const selectedId = useSelectedId();
  const selectNode = useBlockEditorStore((state) => state.selectNode);

  return (
    <ScrollArea.Autosize mah="100%" p="sm">
      {rootIds.length === 0 ? (
        <Text size="sm" c="dimmed" p="sm">
          Nessun blocco nella bozza.
        </Text>
      ) : (
        roots.map((node) => (
          <StructureNode
            key={node.id}
            node={node}
            depth={0}
            selectedId={selectedId}
            onSelect={selectNode}
          />
        ))
      )}
    </ScrollArea.Autosize>
  );
}
