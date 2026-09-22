/**
 * Auto-scroll del canvas durante il drag: dnd-kit non espone comodamente le coordinate
 * assolute del puntatore via `onDragMove` (solo il delta dal punto di partenza), quindi un
 * listener nativo `pointermove` su `window` è il modo più diretto. Soglia di ~60px dai bordi
 * superiore/inferiore di `.canvasArea`, velocità proporzionale alla vicinanza al bordo,
 * `requestAnimationFrame` per uno scroll continuo finché il puntatore resta nella zona soglia.
 * Cleanup (listener + `rAF` pendente) ad ogni fine drag e su unmount.
 */
import { useEffect, type RefObject } from 'react';

const EDGE_THRESHOLD_PX = 60;
const MAX_SCROLL_SPEED_PX = 18;

/** `scrollRef`: il contenitore che scrolla davvero (`.canvasArea`); `isDragActive`: drag in corso. */
export function useEditorAutoScroll(
  scrollRef: RefObject<HTMLElement | null>,
  isDragActive: boolean,
): void {
  useEffect(() => {
    if (!isDragActive) return undefined;

    let pointerY: number | null = null;
    let frame: number | null = null;

    function handlePointerMove(event: PointerEvent): void {
      pointerY = event.clientY;
    }

    function tick(): void {
      const canvasEl = scrollRef.current;
      if (canvasEl && pointerY !== null) {
        const rect = canvasEl.getBoundingClientRect();
        const distanceFromTop = pointerY - rect.top;
        const distanceFromBottom = rect.bottom - pointerY;
        if (distanceFromTop >= 0 && distanceFromTop < EDGE_THRESHOLD_PX) {
          canvasEl.scrollTop -= MAX_SCROLL_SPEED_PX * (1 - distanceFromTop / EDGE_THRESHOLD_PX);
        } else if (distanceFromBottom >= 0 && distanceFromBottom < EDGE_THRESHOLD_PX) {
          canvasEl.scrollTop += MAX_SCROLL_SPEED_PX * (1 - distanceFromBottom / EDGE_THRESHOLD_PX);
        }
      }
      frame = requestAnimationFrame(tick);
    }

    window.addEventListener('pointermove', handlePointerMove);
    frame = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [scrollRef, isDragActive]);
}
