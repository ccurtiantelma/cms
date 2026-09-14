/**
 * IframeBridgeSensor — PoC per la Spike vincolante di ADR-70 § "Decisione" punto 4
 * (`docs/ai/adr/ADR-70-canvas-iframe-isolation-zustand-sync.md`).
 *
 * Implementa esattamente quanto descritto in ADR-70 § "Decisione" punto 3 e
 * SPEC-F04-super-elementor.md § 3.3:
 *   1. Ascolta pointerdown/pointermove/pointerup nativi su `frame.contentWindow.document`
 *      (accesso diretto perché same-origin).
 *   2. Traduce le coordinate sommando l'offset di `frame.getBoundingClientRect()`.
 *   3. "Inoltra l'evento tradotto al protocollo di attivazione che dnd-kit espone per un
 *      Sensor custom" — qui sta il punto che la spike deve verificare: l'unico protocollo di
 *      attivazione pubblico di dnd-kit è `Sensor.activators` (vedi
 *      `node_modules/@dnd-kit/core/dist/sensors/types.d.ts`), un array statico di
 *      `{ eventName: SyntheticEventName; handler }` che dnd-kit lega SOLO ai nodi che hanno
 *      chiamato `useDraggable(...)` nello stesso albero React del `DndContext` (vedi
 *      `useSyntheticListeners`/`useCombineActivators` in `core.esm.js`). Non esiste, nella
 *      superficie pubblica del pacchetto, un modo per "iniettare" un `id` attivo da fuori
 *      questo meccanismo. Questo file implementa quindi l'unica cosa che l'API pubblica
 *      permette: un `setup()` che ri-emette gli eventi tradotti come `PointerEvent` nativi sul
 *      `document` del padre, cosa che il DOM standard permette a prescindere da dnd-kit — NON
 *      un'iniezione diretta nel reducer di dnd-kit (nessuna API per farlo esiste).
 *
 * Nessuna nuova dipendenza npm (vincolo ADR-70 punto 6): solo API standard del browser
 * (`document.dispatchEvent`, `PointerEvent`, `getBoundingClientRect`) e l'interfaccia
 * `Sensor<T>` già esportata da `@dnd-kit/core`, già installato.
 */
import type { Sensor, SensorProps, SensorInstance } from '@dnd-kit/core';

/** Stato del bridge: quale iframe è "attivo" per la traduzione, impostato dal genitore
 * all'evento `load` (§ 1.2 di SPEC-F04-super-elementor.md) — non un parametro del costruttore
 * del Sensor, perché `setup()` non riceve argomenti (firma pubblica di dnd-kit, vedi
 * `sensors/types.d.ts`: `setup?(): Teardown | undefined`, zero parametri). */
let bridgedFrame: HTMLIFrameElement | null = null;

/** Chiamata dal genitore (`PageSpikeParent.tsx`, handler `onLoad` dell'iframe) per registrare
 * quale frame `IframeBridgeSensor.setup()` deve ascoltare. `null` allo smontaggio. */
export function registerIframeBridgeTarget(frame: HTMLIFrameElement | null): void {
  bridgedFrame = frame;
}

export interface SpikeBridgeLogEntry {
  ts: number;
  source: 'IframeBridgeSensor';
  phase: 'pointerdown' | 'pointermove' | 'pointerup';
  /** Coordinate originali nel documento dell'iframe. */
  raw: { x: number; y: number };
  /** Coordinate tradotte nel sistema di riferimento del documento padre (§ 3.3 punto 2). */
  translated: { x: number; y: number };
  /** Elemento del documento padre trovato a quelle coordinate tradotte via
   * `elementFromPoint` — indica se un ri-dispatch avrebbe un bersaglio utile diverso
   * dall'`<iframe>` stesso. */
  parentElementAtPoint: string;
}

/** Log diagnostico condiviso fra i due documenti (padre/iframe): tipizzato largo
 * (`unknown[]`) perché sia `IframeBridgeSensor` sia `spike-canvas-entry.tsx` vi scrivono
 * forme diverse di evento — una sola dichiarazione qui, riusata per `import type` altrove
 * invece di ridichiarare `Window` con un tipo diverso per file (errore TS2717). */
declare global {
  interface Window {
    __SPIKE_BRIDGE_LOG__?: unknown[];
  }
}

function pushLog(entry: SpikeBridgeLogEntry): void {
  const target = window.top ?? window;
  if (!target.__SPIKE_BRIDGE_LOG__) target.__SPIKE_BRIDGE_LOG__ = [];
  target.__SPIKE_BRIDGE_LOG__.push(entry);
}

function describeElement(el: Element | null): string {
  if (!el) return '(nessuno)';
  const id = el.id ? `#${el.id}` : '';
  const cls = el.className && typeof el.className === 'string' ? `.${el.className.split(' ').join('.')}` : '';
  return `${el.tagName.toLowerCase()}${id}${cls}`;
}

/**
 * `SensorOptions` vuoto: nessuna opzione di attivazione (`activationConstraint`) ha senso qui,
 * dato che questo sensore non attiva mai un drag per costruzione (§ vedi commento di testa) —
 * il suo unico ruolo è il ponte di coordinate per un drag già attivo nel padre.
 */
export type IframeBridgeSensorOptions = Record<string, never>;

/**
 * Nota di conformità con l'interfaccia pubblica `Sensor<T>`:
 * dnd-kit richiede una classe con `new (props: SensorProps<T>) => SensorInstance` più
 * `static activators`. `activators: []` è deliberato, non un placeholder dimenticato: nessun
 * nodo di questo sensore vive nell'albero React del `DndContext` (i nodi trascinabili
 * dell'iframe stanno in un secondo root React, § "Modello ad albero" di
 * SPEC-F04-super-elementor.md), quindi non c'è alcun nodo a cui `useSyntheticListeners`
 * potrebbe legare un handler di questo sensore. Vedi PLAN-F04-dnd-iframe-spike.md per l'esito
 * completo su cosa questo implica.
 */
export class IframeBridgeSensor implements SensorInstance {
  static activators: Sensor<IframeBridgeSensorOptions>['activators'] = [];

  autoScrollEnabled = false;

  constructor(_props: SensorProps<IframeBridgeSensorOptions>) {
    // Mai istanziato da dnd-kit: `activators` è vuoto, quindi
    // `bindActivatorToSensorInstantiator` (core.esm.js:3177) non ha alcun handler di questo
    // sensore a cui agganciarsi. Il costruttore esiste solo per soddisfare `Sensor<T>`.
  }

  /**
   * Chiamato una sola volta da `useSensorSetup` (core.esm.js:2334) al mount del `DndContext`
   * del padre, indipendentemente da quale nodo verrà trascinato — è l'UNICO punto della
   * superficie pubblica di dnd-kit dove questo sensore può eseguire codice arbitrario prima
   * che un drag inizi. Qui si registrano i listener nativi sul documento dell'iframe (§ 3.3
   * punto 1 della spec) e si ri-emettono come eventi nativi sul documento padre (§ 3.3 punto
   * 3, nei limiti di ciò che l'API pubblica permette — vedi commento di testa del file).
   */
  static setup(): () => void {
    let attachedDoc: Document | null = null;
    let detachFns: Array<() => void> = [];

    function translate(clientX: number, clientY: number): { x: number; y: number } {
      if (!bridgedFrame) return { x: clientX, y: clientY };
      const rect = bridgedFrame.getBoundingClientRect();
      return { x: clientX + rect.left, y: clientY + rect.top };
    }

    function forward(phase: SpikeBridgeLogEntry['phase'], event: PointerEvent): void {
      const { x, y } = translate(event.clientX, event.clientY);
      const parentTarget = document.elementFromPoint(x, y);

      pushLog({
        ts: Date.now(),
        source: 'IframeBridgeSensor',
        phase,
        raw: { x: event.clientX, y: event.clientY },
        translated: { x, y },
        parentElementAtPoint: describeElement(parentTarget),
      });

      // Ri-emissione come PointerEvent nativo sul documento padre: l'unico modo, con sola
      // API standard del browser, di far "vedere" al padre un evento fisicamente originato
      // nell'iframe. Un PointerSensor GIÀ istanziato nel padre (drag iniziato su un nodo del
      // padre stesso, es. la tessera della palette) ascolta pointermove/pointerup sul
      // `document` del padre (vedi `AbstractPointerSensor`) e lo riceverebbe come se fosse
      // avvenuto lì — MA questo non registra/attiva alcun drag nuovo: `elementFromPoint` nel
      // padre trova al più l'elemento `<iframe>` stesso (opaco), mai un nodo dell'albero
      // dentro l'iframe, perché quell'albero non esiste nel DOM del padre.
      const synthetic = new PointerEvent(phase, {
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: y,
        pointerId: event.pointerId,
        pointerType: event.pointerType,
        button: event.button,
        buttons: event.buttons,
      });
      (parentTarget ?? document).dispatchEvent(synthetic);
    }

    function handlePointerDown(event: PointerEvent): void {
      forward('pointerdown', event);
    }
    function handlePointerMove(event: PointerEvent): void {
      forward('pointermove', event);
    }
    function handlePointerUp(event: PointerEvent): void {
      forward('pointerup', event);
    }

    function tryAttach(): void {
      const doc = bridgedFrame?.contentWindow?.document ?? null;
      if (!doc || doc === attachedDoc) return;
      detach();
      doc.addEventListener('pointerdown', handlePointerDown);
      doc.addEventListener('pointermove', handlePointerMove);
      doc.addEventListener('pointerup', handlePointerUp);
      attachedDoc = doc;
      detachFns = [
        () => doc.removeEventListener('pointerdown', handlePointerDown),
        () => doc.removeEventListener('pointermove', handlePointerMove),
        () => doc.removeEventListener('pointerup', handlePointerUp),
      ];
    }

    function detach(): void {
      detachFns.forEach((fn) => fn());
      detachFns = [];
      attachedDoc = null;
    }

    // `bridgedFrame` è impostato dal padre solo dopo l'evento `load` dell'iframe (§ 1.2 della
    // spec), quindi può arrivare dopo che `setup()` è già girato una volta: poll leggero,
    // stesso compromesso già accettato altrove nel codebase per l'assenza di un evento
    // "iframe bridge ready" dedicato in questo PoC (in produzione sarebbe l'evento di § 2.1).
    const pollId = window.setInterval(tryAttach, 100);
    tryAttach();

    return () => {
      window.clearInterval(pollId);
      detach();
    };
  }
}
