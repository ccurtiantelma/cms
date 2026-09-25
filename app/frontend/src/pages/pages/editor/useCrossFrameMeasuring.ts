/**
 * Ponte di misura cross-frame per `measuring.droppable/draggable.measure` del `DndContext`
 * (`ADR-72-canvas-iframe-portal-bridge.md` § "Decisione" punto 3, `SPEC-F04-super-elementor.md`
 * § 3.3): traduce il rettangolo dei nodi misurati dentro l'`<iframe>` del canvas nel sistema di
 * riferimento del documento la cui coordinata di puntatore è attiva per il drag corrente.
 * Algoritmo portato invariato da `FullScreenEditorLayout.tsx`, a sua volta dal PoC T3.
 *
 * La lettura di `iframeElRef.current`/`dragOriginRef.current` resta dentro il `useCallback`
 * locale a questo hook (mai una fabbrica esterna che riceve i ref come argomenti: il rule
 * `react-hooks/refs` segnala quel pattern). `dragOriginRef` è di proprietà dell'hook e
 * restituito, così `EditorDnDProvider` lo imposta a inizio drag e lo azzera a fine drag.
 */
import { useCallback, useMemo, useRef, type MutableRefObject, type RefObject } from 'react';
import type { ClientRect, MeasuringConfiguration } from '@dnd-kit/core';
import {
  frameScaleOf,
  rectIntoIframeSpace,
  rectIntoParentSpace,
  toPlainRect,
  type DragOrigin,
} from './iframe-canvas-measuring.utils';

export interface CrossFrameMeasuring {
  measuring: MeasuringConfiguration;
  dragOriginRef: MutableRefObject<DragOrigin>;
}

/** `iframeElRef`: l'elemento `<iframe>` del canvas, sollevato da `IframeCanvas.tsx`. */
export function useCrossFrameMeasuring(
  iframeElRef: RefObject<HTMLIFrameElement | null>,
): CrossFrameMeasuring {
  const dragOriginRef = useRef<DragOrigin>(null);

  const measureCrossFrame = useCallback(
    (element: Element): ClientRect => {
      const rect = element.getBoundingClientRect();
      const iframe = iframeElRef.current;
      const origin = dragOriginRef.current;
      if (!iframe || !origin) return toPlainRect(rect);

      const elementIsInIframe = element.ownerDocument === iframe.contentDocument;
      const frameRect = iframe.getBoundingClientRect();
      // Il frame può essere ridotto visivamente (`transform: scale`): senza la scala, la
      // traslazione da sola sfasa ogni zona di rilascio proporzionalmente alla distanza dall'origine.
      const scale = frameScaleOf(frameRect.width, iframe.offsetWidth);

      if (origin === 'parent' && elementIsInIframe) {
        return rectIntoParentSpace(rect, frameRect, scale);
      }
      if (origin === 'iframe' && !elementIsInIframe) {
        return rectIntoIframeSpace(rect, frameRect, scale);
      }
      return toPlainRect(rect);
    },
    [iframeElRef],
  );

  const measuring: MeasuringConfiguration = useMemo(
    () => ({
      droppable: { measure: measureCrossFrame },
      draggable: { measure: measureCrossFrame },
    }),
    [measureCrossFrame],
  );

  return { measuring, dragOriginRef };
}
