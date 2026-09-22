/**
 * Sottoscrizioni allo store per il nodo `id`, tutte mirate: nessun componente legge l'intero
 * `tree` (NFR § Performance). `location` porta anche il tipo del genitore (per filtrare i tipi
 * ammessi dal "+" della toolbar); `parentCompositeProps` solo `exclusive`/`autoplay`/`transition`
 * del genitore e solo per i tre item compositi (ADR-59).
 */
import { useShallow } from 'zustand/react/shallow';
import { useBlockEditorStore, useNodeById } from '../../../../hooks/useBlockEditorStore';
import { findLocation, findNode } from '../block-tree.utils';
import { WIDGET_ITEM_TYPES } from './block-wrapper.constants';

export function useBlockNodeState(id: string) {
  const node = useNodeById(id);
  const location = useBlockEditorStore(
    useShallow((state) => {
      const found = findLocation(state.tree, id);
      if (!found) return undefined;
      const parentType = found.parentId ? findNode(state.tree, found.parentId)?.type : undefined;
      return { ...found, parentType };
    }),
  );
  const childIds = useBlockEditorStore(
    useShallow((state) => findNode(state.tree, id)?.children.map((child) => child.id) ?? []),
  );
  const parentCompositeProps = useBlockEditorStore(
    useShallow((state) => {
      if (!node || !WIDGET_ITEM_TYPES.has(node.type) || !location?.parentId) return undefined;
      const parent = findNode(state.tree, location.parentId);
      if (!parent) return undefined;
      return {
        exclusive: parent.props.exclusive,
        autoplay: parent.props.autoplay,
        transition: parent.props.transition,
      };
    }),
  );
  return { node, location, childIds, parentCompositeProps };
}
