/**
 * Props da passare al componente di contenuto di un nodo contenitore (`CONTAINER_COMPONENTS`).
 * Ogni tipo ha il proprio insieme di props di registro, incompatibili fra loro (`section` è
 * layout a colonne/stile, `container` è flex/grid ADR-82): mai un solo oggetto condiviso. I
 * widget compositi sono in `resolve-composite-props.ts`.
 */
import { resolveDefaultDirection } from '../../../../components/blocks/blocks/Container';
import type { ContainerComponentProps } from './container-props.types';
import type { BlockNode } from '../block-tree.utils';
import {
  COMPOSITE_NODE_TYPES,
  resolveCompositeProps,
  type NodeLocationWithParentType,
  type WidgetParentCompositeProps,
} from './resolve-composite-props';

export type { NodeLocationWithParentType, WidgetParentCompositeProps };

type ResolvedProps = ContainerComponentProps extends infer U
  ? U extends unknown
    ? Omit<U, 'children'>
    : never
  : never;

function resolveContainerBlockProps(node: BlockNode): ResolvedProps {
  // `container` v2 (ADR-82): layout/spaziatura/bordo/sfondo sono valori liberi PropKind v2 resi
  // dal Runtime Style Bridge (`generateCanvasCss.ts`) via `id`, non props di questo componente.
  return {
    id: node.id,
    tag: node.props.tag,
    contentWidth: node.props.contentWidth,
    boxedWidth: node.props.boxedWidth,
    minHeight: node.props.minHeight,
    overflow: node.props.overflow,
    opacity: node.props.opacity,
    htmlId: node.props.htmlId,
    cssClass: node.props.cssClass,
    defaultDirection: resolveDefaultDirection(node),
    // Solo per l'overlay editor-only "Contorno griglia" (`grid-outline.utils.ts`); il Runtime
    // Style Bridge resta l'unico canale di stile reale, invariato (vedi il commento di testa
    // di `resolveContainerBlockProps`).
    layout: node.props.layout,
  };
}

function resolveGalleryProps(node: BlockNode): ResolvedProps {
  // Come `container`: `layout` passa dal Runtime Style Bridge; nessuna prop derivata dal genitore.
  return {
    id: node.id,
    galleryMode: node.props.galleryMode,
    lightbox: node.props.lightbox,
    customCssClass: node.props.customCssClass,
    customElementId: node.props.customElementId,
  };
}

function resolveSectionProps(node: BlockNode): ResolvedProps {
  return {
    styleSpaceBefore: node.props.styleSpaceBefore,
    styleSpaceAfter: node.props.styleSpaceAfter,
    stylePadding: node.props.stylePadding,
    styleBackground: node.props.styleBackground,
    columns: node.props.columns,
    gap: node.props.gap,
    alignItems: node.props.alignItems,
    justifyContent: node.props.justifyContent,
    contentWidth: node.props.contentWidth,
    maxWidth: node.props.maxWidth,
    columnRatio: node.props.columnRatio,
    styleBackgroundColor: node.props.styleBackgroundColor,
    styleColor: node.props.styleColor,
    stylePaddingTop: node.props.stylePaddingTop,
    stylePaddingRight: node.props.stylePaddingRight,
    stylePaddingBottom: node.props.stylePaddingBottom,
    stylePaddingLeft: node.props.stylePaddingLeft,
    styleMarginTop: node.props.styleMarginTop,
    styleMarginRight: node.props.styleMarginRight,
    styleMarginBottom: node.props.styleMarginBottom,
    styleMarginLeft: node.props.styleMarginLeft,
    styleLayer: node.props.styleLayer,
    styleHideDesktop: node.props.styleHideDesktop,
    styleHideTablet: node.props.styleHideTablet,
    styleHideMobile: node.props.styleHideMobile,
  };
}

export function resolveContainerComponentProps(
  node: BlockNode,
  location: NodeLocationWithParentType,
  parentCompositeProps: WidgetParentCompositeProps | undefined,
): ResolvedProps {
  if (node.type === 'navMenu') return {};
  if (node.type === 'container') return resolveContainerBlockProps(node);
  if (node.type === 'gallery') return resolveGalleryProps(node);
  if (node.type === 'form') return { formKey: node.props.formKey };
  if (COMPOSITE_NODE_TYPES.has(node.type)) {
    return resolveCompositeProps(node, location, parentCompositeProps);
  }
  return resolveSectionProps(node);
}
