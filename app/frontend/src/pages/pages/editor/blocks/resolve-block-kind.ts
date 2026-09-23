import { BLOCK_TYPES } from '../../../../types/blocks.types';
import type { BlockNode } from '../block-tree.utils';
import { resolveEffectiveResponsiveValue } from './block-wrapper.constants';

/**
 * `true` se `node` è una Sezione: `type === 'section'` legacy, o un `container` migrato
 * (`migrate-section-to-container.ts`, ADR-82) che porta `props.tag === 'section'` — identità
 * "Sezione" preservata attraverso la migrazione, stessa chrome (badge viola, toolbar dedicata,
 * label "Sezione" nel breadcrumb e nell'Inspector) di un nodo `type === 'section'` non ancora
 * migrato. Unica fonte di verità: sia `resolveBlockKind` sia `getNodeLabel` la richiamano,
 * nessuna duplicazione della condizione altrove.
 */
export function isSection(node: BlockNode): boolean {
  return node.type === 'section' || (node.type === 'container' && node.props?.tag === 'section');
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Base non-responsive di un valore `kind: 'layout'` (ADR-82): spacchetta l'envelope `{default, tablet, mobile}` se presente, altrimenti tratta il valore come già "piatto" (retrocompatibilità). */
function baseLayoutValue(layout: unknown): Record<string, unknown> | undefined {
  if (!isPlainObject(layout)) return undefined;
  return isPlainObject(layout.default) ? (layout.default as Record<string, unknown>) : layout;
}

/**
 * `true` se `node` è una Colonna: un `container` figlio diretto di una struttura a griglia/riga
 * — una `section` (o `container` con `tag: 'section'`) con `columns` effettivo > 1, oppure un
 * `container` il cui `layout` (ADR-82) è `display: 'grid'` o `display: 'flex'` con `direction`
 * `row`/`row-reverse` (default flex). Unica fonte di verità per la label "Colonna" (breadcrumb
 * e Inspector la richiamano entrambi via {@link getNodeLabel}, mai duplicata).
 */
export function isColumn(node: BlockNode, parent: BlockNode | null): boolean {
  if (node.type !== 'container' || !parent) return false;

  if (isSection(parent)) {
    const columnsValue = resolveEffectiveResponsiveValue(parent.props?.columns, 'desktop');
    return Number(columnsValue) > 1;
  }

  if (parent.type === 'container') {
    const base = baseLayoutValue(parent.props?.layout);
    if (!base) return false;
    const display = (base.display as string | undefined) ?? 'flex';
    if (display === 'grid') return true;
    const direction = (base.direction as string | undefined) ?? 'row';
    return display === 'flex' && (direction === 'row' || direction === 'row-reverse');
  }

  return false;
}

/**
 * Etichetta di un nodo per breadcrumb e Inspector: "Sezione"/"Colonna" hanno priorità sulla
 * label generica di registro (`Contenitore` per `container`) — stessa gerarchia semantica
 * Sezione > Colonna > Componente in entrambi i punti dell'UI, un solo posto in cui è scritta.
 */
export function getNodeLabel(node: BlockNode, parent: BlockNode | null): string {
  if (isSection(node)) return 'Sezione';
  if (isColumn(node, parent)) return 'Colonna';
  const descriptor = BLOCK_TYPES.find((entry) => entry.type === node.type);
  return descriptor?.meta?.label ?? node.type;
}

/** Classificazione del nodo dal registro dei blocchi: cosa è, e quindi quale chrome offrire. */
export function resolveBlockKind(node: BlockNode, parentId: string | null) {
  const descriptor = BLOCK_TYPES.find((entry) => entry.type === node.type);
  const section = isSection(node);
  const isContainerBlockType = node.type === 'container';
  const isContainerOrSection = section || isContainerBlockType;
  return {
    iconName: descriptor?.meta?.icon,
    label: descriptor?.meta?.label ?? node.type,
    // `childrenAllow === '*'` (ADR-39 § 4, `container`) o un elenco non vuoto: è un contenitore.
    isContainer: descriptor?.childrenAllow === '*' || (descriptor?.childrenAllow.length ?? 0) > 0,
    isSection: section,
    isContainerBlockType,
    isContainerOrSection,
    /** Puntatore a una Sezione Globale (ADR-55): foglia, bordo viola sempre visibile. */
    isGlobalRef: node.type === 'globalRef',
    isTopLevelContainerOrSection: parentId === null && isContainerOrSection,
    isTopLevelSection: section && parentId === null,
  };
}
