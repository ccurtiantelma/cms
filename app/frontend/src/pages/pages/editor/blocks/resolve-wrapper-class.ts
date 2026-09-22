import tokenStyles from '../../../../components/blocks/style-tokens.module.css';
import {
  resolveHideClassName,
  resolveResponsiveClassNames,
} from '../../../../components/blocks/style-tokens';
import type { BlockNode } from '../block-tree.utils';
import styles from '../EditorBlockWrapper.module.css';

interface WrapperClassFlags {
  isGlobalRef: boolean;
  isInvalid: boolean;
  isDragging: boolean;
  isHiddenForActiveViewport: boolean;
  isHiddenInCanvas: boolean;
}

/** `colSpan` (ADR-51): il grid item reale nel Canvas è questo wrapper, non la radice del campo. */
function resolveColSpanClassName(node: BlockNode): string {
  if (node.type === 'form-field') {
    return (
      resolveResponsiveClassNames(tokenStyles, 'colSpan', node.props.colSpan) ||
      tokenStyles.colSpan_default_12
    );
  }
  return node.type === 'form-submit' ? tokenStyles.colSpan_default_12 : '';
}

/** Classi del wrapper: solo classi, mai stili che tocchino il box model (la chrome è overlay). */
export function resolveWrapperClassName(node: BlockNode, flags: WrapperClassFlags): string {
  return [
    styles.wrapper,
    flags.isGlobalRef ? styles.globalRefBorder : '',
    resolveColSpanClassName(node),
    flags.isInvalid ? styles.invalid : '',
    flags.isDragging ? styles.dragging : '',
    resolveHideClassName(tokenStyles, 'hideDesktop', node.props.styleHideDesktop),
    resolveHideClassName(tokenStyles, 'hideTablet', node.props.styleHideTablet),
    resolveHideClassName(tokenStyles, 'hideMobile', node.props.styleHideMobile),
    flags.isHiddenForActiveViewport ? tokenStyles.previewHidden : '',
    flags.isHiddenInCanvas ? styles.hiddenInCanvas : '',
  ]
    .filter(Boolean)
    .join(' ');
}
