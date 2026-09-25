/**
 * Auto-scroll del canvas durante il drag. Lo scroller reale del canvas è il documento
 * dell'`<iframe>` (`IframeCanvas.tsx`, `data-canvas-scroll-area`): `.canvasArea` del padre non
 * overflowa mai, quindi resta solo come ripiego. Il puntatore arriva da due documenti diversi
 * — quello del padre (drag da `WidgetPalette`) o quello dell'iframe (riordino di un nodo) —
 * quindi si ascolta `pointermove` su entrambi e lo si riporta nelle coordinate del padre
 * (offset e scala del riquadro dell'iframe, come `useCrossFrameMeasuring`). Soglia di ~60px dai
 * bordi superiore/inferiore, velocità proporzionale alla vicinanza al bordo (massima oltre il
 * bordo), `requestAnimationFrame` finché il puntatore resta nella zona. Cleanup ad ogni fine
 * drag e su unmount.
 *
 * Le zone di rilascio sono misurate una volta a inizio drag: dopo uno scroll (automatico o
 * a rotella) i loro rettangoli sono stantii e `pointerWithin` risolverebbe la zona sbagliata.
 * L'evento `scroll` del documento scrollato riesegue quindi `onScroll` (rimisura, a cura del
 * chiamante) al massimo una volta per frame.
 */
import { useEffect, useRef, type RefObject } from 'react';
import { frameScaleOf } from './iframe-canvas-measuring.utils';

export const EDGE_THRESHOLD_PX = 60;
export const MAX_SCROLL_SPEED_PX = 18;
/** Oltre il bordo (puntatore sopra la topbar / sotto il breadcrumb) la velocità resta al massimo. */
const OUTSIDE_BAND_PX = 120;

/**
 * Spostamento verticale (px, negativo = su) per un puntatore a `pointerY` in una fascia
 * `[top, bottom]`. `0` lontano dai bordi o oltre `OUTSIDE_BAND_PX` fuori dalla fascia.
 */
export function edgeScrollDelta(pointerY: number, top: number, bottom: number): number {
  const fromTop = pointerY - top;
  const fromBottom = bottom - pointerY;
  if (fromTop < EDGE_THRESHOLD_PX && fromTop > -OUTSIDE_BAND_PX) {
    return -MAX_SCROLL_SPEED_PX * Math.min(1, 1 - fromTop / EDGE_THRESHOLD_PX);
  }
  if (fromBottom < EDGE_THRESHOLD_PX && fromBottom > -OUTSIDE_BAND_PX) {
    return MAX_SCROLL_SPEED_PX * Math.min(1, 1 - fromBottom / EDGE_THRESHOLD_PX);
  }
  return 0;
}

interface UseEditorAutoScrollArgs {
  iframeElRef: RefObject<HTMLIFrameElement | null>;
  /** Ripiego: contenitore del padre che scrolla se il canvas non è in iframe/non scrolla. */
  canvasAreaRef: RefObject<HTMLElement | null>;
  isDragActive: boolean;
  /** Chiamata (al massimo una volta per frame) dopo ogni scroll durante il drag. */
  onScroll: () => void;
}

export function useEditorAutoScroll({
  iframeElRef,
  canvasAreaRef,
  isDragActive,
  onScroll,
}: UseEditorAutoScrollArgs): void {
  const onScrollRef = useRef(onScroll);
  useEffect(() => {
    onScrollRef.current = onScroll;
  }, [onScroll]);

  useEffect(() => {
    if (!isDragActive) return undefined;

    const iframe = iframeElRef.current;
    const iframeWindow = iframe?.contentWindow ?? null;
    const iframeDoc = iframe?.contentDocument ?? null;

    // Puntatore in coordinate del viewport del padre.
    let pointer: { x: number; y: number } | null = null;
    let frame: number | null = null;
    let remeasureFrame: number | null = null;

    function handleParentMove(event: PointerEvent): void {
      pointer = { x: event.clientX, y: event.clientY };
    }

    function handleIframeMove(event: PointerEvent): void {
      if (!iframe) return;
      const rect = iframe.getBoundingClientRect();
      const scale = frameScaleOf(rect.width, iframe.offsetWidth);
      pointer = { x: rect.left + event.clientX * scale, y: rect.top + event.clientY * scale };
    }

    function handleScroll(): void {
      if (remeasureFrame !== null) return;
      remeasureFrame = requestAnimationFrame(() => {
        remeasureFrame = null;
        onScrollRef.current();
      });
    }

    /** Scrolla `element` di `delta` px; `true` se si è mosso davvero. */
    function scrollBy(element: Element | null | undefined, delta: number): boolean {
      if (!element) return false;
      const before = element.scrollTop;
      element.scrollTop = before + delta;
      return element.scrollTop !== before;
    }

    function tick(): void {
      if (pointer) {
        const targets: { rect: DOMRect; element: Element | null | undefined }[] = [];
        if (iframe) {
          targets.push({
            rect: iframe.getBoundingClientRect(),
            element: iframeDoc?.scrollingElement,
          });
        }
        const canvasArea = canvasAreaRef.current;
        if (canvasArea) {
          targets.push({ rect: canvasArea.getBoundingClientRect(), element: canvasArea });
        }
        for (const { rect, element } of targets) {
          if (pointer.x < rect.left || pointer.x > rect.right) continue;
          const delta = edgeScrollDelta(pointer.y, rect.top, rect.bottom);
          if (delta !== 0 && scrollBy(element, delta)) break;
        }
      }
      frame = requestAnimationFrame(tick);
    }

    window.addEventListener('pointermove', handleParentMove);
    iframeWindow?.addEventListener('pointermove', handleIframeMove);
    iframeDoc?.addEventListener('scroll', handleScroll, { passive: true });
    canvasAreaRef.current?.addEventListener('scroll', handleScroll, { passive: true });
    frame = requestAnimationFrame(tick);

    const canvasAreaEl = canvasAreaRef.current;
    return () => {
      window.removeEventListener('pointermove', handleParentMove);
      iframeWindow?.removeEventListener('pointermove', handleIframeMove);
      iframeDoc?.removeEventListener('scroll', handleScroll);
      canvasAreaEl?.removeEventListener('scroll', handleScroll);
      if (frame !== null) cancelAnimationFrame(frame);
      if (remeasureFrame !== null) cancelAnimationFrame(remeasureFrame);
    };
  }, [iframeElRef, canvasAreaRef, isDragActive]);
}
