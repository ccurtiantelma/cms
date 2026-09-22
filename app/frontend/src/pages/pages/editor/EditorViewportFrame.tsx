/**
 * Frame centrale dell'editor (Sub-Task "Frame WYSIWYG In-Place & Breakpoint Switcher"):
 * `.canvasArea` scrollabile + device frame simulato per il breakpoint attivo, con scaling
 * puramente visivo quando il frame eccede lo spazio disponibile, attorno a `IframeCanvas`
 * (ADR-72). Esporta anche `ViewportDimensionLabel`, l'etichetta informativa del breakpoint.
 */
import type { CSSProperties, ReactNode, RefObject } from 'react';
import { useElementSize, useMergedRef } from '@mantine/hooks';
import {
  useActiveBreakpoint,
  useActiveBreakpoints,
  useIsPreviewMode,
} from '../../../hooks/useBlockEditorStore';
import { BREAKPOINT_LABELS, type ResolvedBreakpoint } from '../../../libs/breakpoints';
import type { ResponsiveBreakpointName } from '../../../types/blocks.types';
import IframeCanvas from './IframeCanvas';
import styles from './FullScreenEditorLayout.module.css';

/**
 * Larghezza (px) del device frame per il breakpoint `name`, o `undefined` per `'default'`
 * (fluido) o se `name` non è più fra i breakpoint attivi (config del sito cambiata a editor
 * aperto): il frame torna fluido invece di mostrare una larghezza stantia. Letta da
 * `ResolvedBreakpoint.widthPx`, mai da un parsing della `mediaQuery`.
 */
function resolveFrameWidthPx(
  name: ResponsiveBreakpointName,
  activeBreakpoints: readonly ResolvedBreakpoint[],
): number | undefined {
  return activeBreakpoints.find((breakpoint) => breakpoint.name === name)?.widthPx;
}

/** Etichetta discreta con la larghezza del frame simulato, solo per i breakpoint non fluidi. */
export function ViewportDimensionLabel(): JSX.Element | null {
  const activeBreakpoint = useActiveBreakpoint();
  const frameWidthPx = resolveFrameWidthPx(activeBreakpoint, useActiveBreakpoints());
  if (frameWidthPx === undefined) return null;
  return (
    <div className={styles.viewportDimensionLabel}>
      {BREAKPOINT_LABELS[activeBreakpoint]} · {frameWidthPx}px
    </div>
  );
}

export interface EditorViewportFrameProps {
  /** Elemento `<iframe>` del canvas, sollevato per la misura cross-frame di dnd-kit. */
  iframeElRef: RefObject<HTMLIFrameElement | null>;
  /** Ref di `.canvasArea`, letto dall'auto-scroll durante il drag. */
  canvasAreaRef: RefObject<HTMLDivElement | null>;
  /** Contenuto del canvas (`canvasTree`), proiettato nell'iframe da `IframeCanvas`. */
  children: ReactNode;
}

export default function EditorViewportFrame({
  iframeElRef,
  canvasAreaRef,
  children,
}: EditorViewportFrameProps): JSX.Element {
  const activeBreakpoint = useActiveBreakpoint();
  const frameWidthPx = resolveFrameWidthPx(activeBreakpoint, useActiveBreakpoints());
  const isPreviewMode = useIsPreviewMode();
  // Larghezza reale di `.canvasArea`: un breakpoint largo può eccedere lo spazio a
  // disposizione, `frameScale` riduce solo visivamente (`transform: scale`) — la larghezza
  // dichiarata resta il pixel reale dell'`<iframe>`, per far scattare le sue media query.
  const { ref: sizeRef, width: canvasAreaWidth } = useElementSize<HTMLDivElement>();
  const setCanvasAreaRef = useMergedRef(canvasAreaRef, sizeRef);

  const isFluidFrame = frameWidthPx === undefined;
  // `Math.min(1, ...)`: mai zoom-in. `canvasAreaWidth === 0` (prima della misura) ⇒ nessuna riduzione.
  const frameScale =
    !isFluidFrame && canvasAreaWidth > 0 ? Math.min(1, canvasAreaWidth / frameWidthPx) : 1;
  const viewportFrameStyle: CSSProperties | undefined = isFluidFrame
    ? undefined
    : { width: `${frameWidthPx}px`, transform: `scale(${frameScale})` };

  return (
    <div
      className={styles.canvasArea}
      ref={setCanvasAreaRef}
      // Disattiva i contorni hover/selezione del canvas (`[data-preview-mode='true']` in
      // `EditorBlockWrapper.module.css`).
      data-preview-mode={isPreviewMode || undefined}
      // Confine di clipping usato da `EditorBlockWrapper.tsx` (anti-clip della toolbar di
      // selezione) via `closest()`.
      data-canvas-scroll-area="true"
    >
      <div
        className={`${styles.viewportContainer} ${isFluidFrame ? styles.viewportDesktop : styles.viewportFramed}`}
        style={viewportFrameStyle}
        data-breakpoint={activeBreakpoint}
      >
        <IframeCanvas ref={iframeElRef as RefObject<HTMLIFrameElement>}>{children}</IframeCanvas>
      </div>
    </div>
  );
}
