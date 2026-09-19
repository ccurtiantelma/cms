/**
 * Indicatori fissi della cornice del tema (THEME - HEADER / THEME - FOOTER) e barra
 * breadcrumb gerarchica in calce al canvas. Montati da `EditorCanvas.tsx`, quindi nel
 * documento isolato dell'iframe (ADR-72): niente Mantine, solo CSS Modules e icone SVG.
 *
 * I badge sono decorazioni non editabili: `pointer-events: none`, nessun `EditorBlockWrapper`,
 * nessun id nell'albero — la cornice del tema non è parte del flusso di montaggio della pagina.
 */
import { memo } from 'react';
import { IconLock } from '@tabler/icons-react';
import { useShallow } from 'zustand/react/shallow';
import { useBlockEditorStore } from '../../../hooks/useBlockEditorStore';
import { BLOCK_TYPES } from '../../../types/blocks.types';
import { findPath } from './block-tree.utils';
import styles from './CanvasThemeFrame.module.css';

export const ThemeFrameBadge = memo(function ThemeFrameBadge({
  area,
}: {
  area: 'header' | 'footer';
}): JSX.Element {
  const title = area === 'header' ? 'THEME - HEADER' : 'THEME - FOOTER';
  return (
    <div
      className={styles.themeFrame}
      data-testid={`theme-frame-${area}`}
      data-theme-frame={area}
      aria-label={`${title}: Tutte le aree (non modificabile)`}
    >
      <span className={styles.themeFrameBadge}>
        <IconLock size={12} aria-hidden="true" />
        <span className={styles.themeFrameTitle}>{title}</span>
        <span className={styles.themeFrameScope}>Tutte le aree</span>
      </span>
    </div>
  );
});

function labelOf(type: string): string {
  return BLOCK_TYPES.find((entry) => entry.type === type)?.meta?.label ?? type;
}

/** Breadcrumb "Pagina > … > blocco selezionato": ogni segmento risale l'albero via store. */
export function CanvasBreadcrumbBar(): JSX.Element {
  const selectNode = useBlockEditorStore((state) => state.selectNode);
  // Stringhe primitive (`id\u0000type`): `useShallow` confronta gli elementi per riferimento,
  // oggetti nuovi a ogni selezione causerebbero un loop di render.
  const pathKeys = useBlockEditorStore(
    useShallow((state) =>
      state.selectedId
        ? findPath(state.tree, state.selectedId).map((n) => `${n.id}\u0000${n.type}`)
        : [],
    ),
  );
  const path = pathKeys.map((key) => {
    const [id, type] = key.split('\u0000');
    return { id, type };
  });

  return (
    <nav
      className={styles.breadcrumbBar}
      aria-label="Percorso del blocco selezionato"
      data-testid="canvas-breadcrumb"
      // Un click sulla barra non deve deselezionare (onClick dello sfondo del canvas).
      onClick={(event) => event.stopPropagation()}
    >
      <ol className={styles.breadcrumbList}>
        <li className={styles.breadcrumbItem}>
          <button
            type="button"
            className={styles.breadcrumbSegment}
            data-current={path.length === 0 || undefined}
            aria-current={path.length === 0 ? 'location' : undefined}
            onClick={() => selectNode(null)}
          >
            Pagina
          </button>
        </li>
        {path.map((node, index) => {
          const isLast = index === path.length - 1;
          return (
            <li key={node.id} className={styles.breadcrumbItem}>
              <span className={styles.breadcrumbSeparator} aria-hidden="true">
                ›
              </span>
              <button
                type="button"
                className={styles.breadcrumbSegment}
                data-current={isLast || undefined}
                aria-current={isLast ? 'location' : undefined}
                onClick={() => selectNode(node.id)}
              >
                {labelOf(node.type)}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
