import { BLOCK_TYPES } from '../../../../types/blocks.types';
import type { BlockNode } from '../block-tree.utils';

/** Classificazione del nodo dal registro dei blocchi: cosa è, e quindi quale chrome offrire. */
export function resolveBlockKind(node: BlockNode, parentId: string | null) {
  const descriptor = BLOCK_TYPES.find((entry) => entry.type === node.type);
  // Un `container` migrato da `section` (`migrate-section-to-container.ts`, ADR-82) porta
  // `props.tag === 'section'`: identità "Sezione" preservata attraverso la migrazione, stessa
  // chrome (badge viola, toolbar dedicata) di un nodo `type === 'section'` legacy non ancora migrato.
  const isSection = node.type === 'section' || (node.type === 'container' && node.props?.tag === 'section');
  const isContainerBlockType = node.type === 'container';
  const isContainerOrSection = isSection || isContainerBlockType;
  return {
    iconName: descriptor?.meta?.icon,
    label: descriptor?.meta?.label ?? node.type,
    // `childrenAllow === '*'` (ADR-39 § 4, `container`) o un elenco non vuoto: è un contenitore.
    isContainer: descriptor?.childrenAllow === '*' || (descriptor?.childrenAllow.length ?? 0) > 0,
    isSection,
    isContainerBlockType,
    isContainerOrSection,
    /** Puntatore a una Sezione Globale (ADR-55): foglia, bordo viola sempre visibile. */
    isGlobalRef: node.type === 'globalRef',
    isTopLevelContainerOrSection: parentId === null && isContainerOrSection,
    isTopLevelSection: isSection && parentId === null,
  };
}
