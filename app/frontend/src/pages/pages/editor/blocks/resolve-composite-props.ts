/**
 * Props dei sette widget compositi CSS-only (ADR-57 § 2, ADR-59). Ogni nodo è un
 * `EditorBlockWrapper` indipendente montato per `id`: `groupName`/`exclusive`/`defaultChecked`/
 * `transition`/`index`/`count`, che `BlockRenderer.tsx` calcola dal `case` del genitore, qui si
 * derivano da tipo/props del genitore e posizione fra i fratelli. Stessa logica di calcolo del
 * dispatcher pubblico, mai divergente.
 */
import { resolveCarouselTransition } from '../../../../components/blocks/blocks/CarouselBlock';
import type { BlockLocation, BlockNode } from '../block-tree.utils';

/** Posizione di un nodo (`BlockLocation`) più il tipo del genitore. */
export interface NodeLocationWithParentType extends BlockLocation {
  parentType: string | undefined;
}

/**
 * Props del genitore rilevanti solo per i tre "item" compositi (`accordionItem`/`tabPanel`/
 * `carouselSlide`): mai l'intero oggetto props, per non far ri-renderizzare l'item a ogni
 * modifica non pertinente del genitore.
 */
export interface WidgetParentCompositeProps {
  exclusive?: unknown;
  autoplay?: unknown;
  transition?: unknown;
}

export const COMPOSITE_NODE_TYPES: ReadonlySet<string> = new Set([
  'accordion',
  'accordionItem',
  'tabs',
  'tabPanel',
  'carousel',
  'carouselSlide',
  'modalTrigger',
]);

export function resolveCompositeProps(
  node: BlockNode,
  location: NodeLocationWithParentType,
  parentCompositeProps: WidgetParentCompositeProps | undefined,
): Record<string, unknown> {
  switch (node.type) {
    case 'accordionItem': {
      // `groupName` solo se il genitore è davvero un `accordion` con `exclusive:true`.
      const exclusive =
        location.parentType === 'accordion' && parentCompositeProps?.exclusive === true;
      return {
        title: node.props.title,
        groupName: exclusive ? `accordion-${location.parentId}` : undefined,
      };
    }
    case 'tabPanel': {
      // `groupName` condiviso e `defaultChecked` sul primo pannello solo se il genitore è `tabs`;
      // un `tabPanel` isolato ha un gruppo suo e resta sempre aperto (difensivo).
      const parentIsTabs = location.parentType === 'tabs';
      return {
        label: node.props.label,
        groupName: parentIsTabs ? `tabs-${location.parentId}` : `tabpanel-${node.id}`,
        defaultChecked: parentIsTabs ? location.index === 0 : true,
      };
    }
    case 'carousel':
      return {
        transition: resolveCarouselTransition(node.props.autoplay, node.props.transition),
      };
    case 'carouselSlide': {
      // `transition` effettiva del genitore (la slide non dichiara `autoplay`/`transition`),
      // `index`/`count` dalla posizione fra i fratelli; isolata = singola slide statica.
      const parentIsCarousel = location.parentType === 'carousel';
      return {
        slideId: node.id,
        transition: parentIsCarousel
          ? resolveCarouselTransition(
              parentCompositeProps?.autoplay,
              parentCompositeProps?.transition,
            )
          : 'manual-scroll',
        index: parentIsCarousel ? location.index : 0,
        count: parentIsCarousel ? location.siblingsCount : 1,
      };
    }
    case 'modalTrigger':
      return {
        nodeId: node.id,
        triggerLabel: node.props.triggerLabel,
        animation: node.props.animation,
      };
    default:
      // `accordion`/`tabs`: wrapper puri, il raggruppamento vive sui figli.
      return {};
  }
}
