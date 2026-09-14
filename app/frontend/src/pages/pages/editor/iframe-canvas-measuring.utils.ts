/**
 * Primitive pure per la funzione di misura cross-frame di `measuring.droppable.measure`/
 * `measuring.draggable.measure` del `DndContext` (`ADR-72-canvas-iframe-portal-bridge.md` §
 * "Decisione" punto 3, `SPEC-F04-super-elementor.md` § 3.3) — obbligo architetturale, non un
 * dettaglio lasciato al momento della scrittura del codice: senza questa traduzione, un drag
 * che attraversa il confine iframe↔padre risolve sempre `over: null` (collisione mai
 * rilevata), perché `element.getBoundingClientRect()` di un nodo il cui `ownerDocument` è
 * quello dell'iframe restituisce coordinate relative al **viewport dell'iframe stesso**, mai
 * tradotte nell'offset del suo riquadro nella pagina padre, mentre il puntatore arriva al
 * `PointerSensor` del padre con coordinate assolute nel viewport della **pagina padre**.
 *
 * Solo le primitive pure (senza ref) vivono qui: la chiusura che legge `iframeElRef.current`/
 * `dragOriginRef.current` resta dichiarata dentro `FullScreenEditorLayout.tsx` come
 * `useCallback` locale — stessa forma esatta del PoC T3
 * (`app/frontend/src/spikes/dnd-iframe-portal/PageSpikePortalBridgeParent.tsx`, righe 253-273,
 * `measureCrossFrame`), non una fabbrica che riceve i ref come argomenti: passare un ref come
 * argomento a una funzione esterna durante il render è segnalato da `eslint-plugin-react-hooks`
 * (`react-hooks/refs`, "Cannot access refs during render") perché non può verificare
 * staticamente che la lettura di `.current` avvenga solo più tardi, nella chiusura restituita
 * — il pattern corretto tiene la lettura dei ref nello stesso componente che li possiede.
 *
 * Algoritmo portato **invariato** da `PageSpikePortalBridgeParent.tsx`, verificato con mouse
 * reale (Playwright `page.mouse`, non eventi sintetici), 10/10 run deterministici,
 * `e2e/tests/spike-dnd-iframe-portal-bridge.spec.ts`. Nessuna reimplementazione della
 * geometria nativa: solo `element.getBoundingClientRect()` come base, più la somma/sottrazione
 * dell'offset di `iframe.getBoundingClientRect()` quando l'`ownerDocument` del nodo misurato
 * differisce dal documento di riferimento del drag attivo.
 *
 * Nessun `Sensor` custom: resta l'API pubblica `MeasuringConfiguration` di `@dnd-kit/core`
 * (`measuring` prop di `DndContext`), nessun fork, nessuna patch al pacchetto.
 */
import type { ClientRect } from '@dnd-kit/core';

/**
 * Prefisso id sintetico delle tessere di `WidgetPalette.tsx` (drag di un tipo nuovo dalla
 * sidebar, mai un nodo già esistente nell'albero) — stessa convenzione usata dal PoC T3 per
 * determinare il documento di riferimento del drag attivo dall'origine del nodo trascinato,
 * non da uno stato globale mutabile fuori dal ciclo di vita del drag.
 */
const PALETTE_DRAG_ID_PREFIX = 'new-block:';

/** Documento di riferimento del drag attivo: `'parent'` per un'origine `WidgetPalette` (documento
 * padre), `'iframe'` per il riordino di un nodo già esistente nell'albero (DOM portato
 * nell'iframe, `IframeCanvas.tsx`). `null` quando nessun drag è in corso. */
export type DragOrigin = 'parent' | 'iframe' | null;

/** Un drag ha origine dalla palette (documento padre) quando il suo id porta il prefisso
 * sintetico `new-block:` — stessa convenzione di `WidgetPalette.tsx`. */
export function isPaletteOrigin(activeId: string): boolean {
  return activeId.startsWith(PALETTE_DRAG_ID_PREFIX);
}

/** Adatta un `DOMRect` nativo alla forma `ClientRect` di `@dnd-kit/core`, senza traduzione. */
export function toPlainRect(rect: DOMRect): ClientRect {
  return {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
    bottom: rect.bottom,
    right: rect.right,
  };
}

/** Trasla un `DOMRect` di `(dx, dy)`, preservando le sue dimensioni. */
export function shiftRect(rect: DOMRect, dx: number, dy: number): ClientRect {
  const top = rect.top + dy;
  const left = rect.left + dx;
  return {
    top,
    left,
    width: rect.width,
    height: rect.height,
    bottom: top + rect.height,
    right: left + rect.width,
  };
}
