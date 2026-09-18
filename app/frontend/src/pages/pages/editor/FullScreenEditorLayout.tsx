/**
 * Chrome dell'editor visivo full-screen (PLAN-F04-editor-visivo.md, evoluzione full-screen):
 * topbar + area di lavoro a tre colonne (sidebar widget/props, canvas, pannello struttura),
 * pensata per massimizzare lo spazio dedicato al canvas, come in un editor visivo stile
 * Elementor.
 *
 * **Chrome di una rotta dedicata, non un overlay.** Dopo ADR-54 questo componente è montato
 * dentro `PageStudio.tsx`, a sua volta dentro la rotta isolata `/studio/:guid`
 * (`LayoutStudio.tsx`, fuori da `LayoutProtected`): non c'è più una sidebar/topbar admin da
 * coprire né una scheda "Contenuto" che lo smonta/rimonta, quindi nessuna prop `active` da
 * propagare. Resta `position: fixed` a piena viewport (`FullScreenEditorLayout.module.css`,
 * z-index sopra il contenuto standard) — ridondante con `LayoutStudio` (già `100vw`×`100vh`),
 * ma innocuo: copre l'intera finestra per costruzione, a prescindere dall'albero di antenati
 * in cui viene montato (anche il Builder delle Sezioni Globali, sotto, che non passa da
 * `/studio/:guid`).
 *
 * Riusato anche dal Builder delle Sezioni Globali (`PageGlobalSectionBuilder.tsx`, ADR-40),
 * anch'esso una rotta a sé (`/global-sections/:guid/builder`, dentro `LayoutProtected`) — è
 * lo stesso principio già usato altrove nell'app per overlay a piena finestra
 * (`Modal`/`Drawer` di Mantine), applicato qui a un componente non-Mantine perché la chrome
 * dell'editor a blocchi ha bisogno di un controllo pixel-preciso sulle tre colonne che un
 * `Modal` non offre.
 *
 * **Breakpoint switcher e pannello struttura** leggono/scrivono `activeBreakpoint` e
 * `isStructurePanelOpen` di `useBlockEditorStore` direttamente (non via props): sono stato di
 * chrome dell'editor, non stato della Pagina — lo stesso motivo per cui undo/redo restano
 * qui e non in `BlockEditorPanel` (CLAUDE.md — selettori Zustand mirati, mai l'intero store).
 * `setActiveBreakpoint` deriva anche `activeViewport` (3 vie, solo il Property Inspector) —
 * vedi `viewportForBreakpoint` in `useBlockEditorStore.ts`.
 *
 * **Ospita il `DndContext` di dnd-kit** (PLAN-F04c-editor-maturo.md T7, esteso alla sidebar
 * Widgets): non vive più in `EditorCanvas`, perché ora una sorgente di drag (`WidgetPalette`,
 * dentro `.sidebar`) e le sue destinazioni (le drop-zone di `EditorBlockWrapper`, dentro
 * `.canvasArea`) sono fratelli, non l'una discendente dell'altra — `useDraggable`/`useDroppable`
 * funzionano solo condividendo la stessa istanza di `DndContext`, e questo componente è il
 * primo antenato comune fra i due.
 *
 * **Ponte di misura cross-frame (`ADR-72-canvas-iframe-portal-bridge.md` § "Decisione" punto
 * 3, `SPEC-F04-super-elementor.md` § 3.3)**: da quando il canvas centrale vive in un `<iframe>`
 * same-origin (`IframeCanvas.tsx`, montato al posto del vecchio `<EditorCanvas/>` diretto nei
 * children), il `DndContext` unico qui ospitato riceve una prop `measuring` non di default
 * (`iframe-canvas-measuring.utils.ts`, algoritmo portato invariato dal PoC T3,
 * `PageSpikePortalBridgeParent.tsx`): traduce il rettangolo dei nodi misurati dentro l'iframe
 * nel sistema di riferimento del documento la cui coordinata di puntatore è attiva per il drag
 * corrente. Nessun `Sensor` custom (`IframeBridgeSensor`, previsto da `ADR-70` § "Decisione"
 * punto 3, superato da ADR-72): il `PointerSensor` nativo già montato sotto riceve da solo
 * tutti gli eventi necessari, grazie alla cattura implicita del puntatore di Chromium.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { ActionIcon, Paper, Text } from '@mantine/core';
import { useElementSize, useMergedRef } from '@mantine/hooks';
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type ClientRect,
  type DragEndEvent,
  type DragStartEvent,
  type MeasuringConfiguration,
} from '@dnd-kit/core';
import {
  useActiveBreakpoint,
  useActiveBreakpoints,
  useBlockEditorStore,
  useCanRedo,
  useCanUndo,
  useIsPreviewMode,
  useIsSidebarOpen,
  useIsStructurePanelOpen,
} from '../../../hooks/useBlockEditorStore';
import { BREAKPOINT_LABELS, type ResolvedBreakpoint } from '../../../libs/breakpoints';
import { BLOCK_TYPES, type ResponsiveBreakpointName } from '../../../types/blocks.types';
import type { PageRecord, PageStatus } from '../../../types/pages.types';
import { blockIcon, defaultPropsFor } from './BlockPalette';
import EditorSidebar from './sidebar/EditorSidebar';
import IframeCanvas from './IframeCanvas';
import {
  isPaletteOrigin,
  shiftRect,
  toPlainRect,
  type DragOrigin,
} from './iframe-canvas-measuring.utils';
import Toolbar from './Toolbar';
import { useEditorShortcuts } from './useEditorShortcuts';
import styles from './FullScreenEditorLayout.module.css';

/** Payload di una zona di rilascio (`EditorBlockWrapper.tsx`): dove inserire il nodo trascinato. */
interface DropTarget {
  parentId: string | null;
  index: number;
}

/**
 * Informazioni sul blocco trascinato correnti, per la "ghost card" del `DragOverlay`
 * (punto 2 del task): etichetta + nome dell'icona del registro (`meta.icon`), risolta con
 * la stessa `blockIcon` di `BlockPalette.tsx` — coerente con l'aspetto delle voci della
 * palette, mai un secondo mapping icona duplicato qui.
 */
interface DraggedBlockInfo {
  label: string;
  iconName: string | undefined;
}

/**
 * Larghezza (px) del device frame simulato per il breakpoint `name`, o `undefined` per
 * `'default'` (fluido, `.viewportDesktop`) — Sub-Task "Frame WYSIWYG In-Place & Breakpoint
 * Switcher". Letta da `ResolvedBreakpoint.widthPx` (`libs/breakpoints.ts`, calcolato
 * direttamente da `config.maxWidth`/`config.minWidth` del DTO, mai da un parsing della
 * stringa `mediaQuery`): la stessa lista già ordinata e filtrata per `active` che alimenta
 * `BreakpointSwitcher.tsx`, non un secondo calcolo. `undefined` anche nel caso limite in cui
 * `name` non sia (più) fra i breakpoint attivi (es. la configurazione del sito è cambiata
 * mentre l'editor era aperto con quel breakpoint selezionato): il frame torna fluido invece
 * di mostrare una larghezza stantia.
 */
function resolveFrameWidthPx(
  name: ResponsiveBreakpointName,
  activeBreakpoints: readonly ResolvedBreakpoint[],
): number | undefined {
  return activeBreakpoints.find((breakpoint) => breakpoint.name === name)?.widthPx;
}

/**
 * Larghezza (px) della sidebar sinistra aperta — stessa costante usata per posizionare
 * `.sidebarToggle` sul bordo verticale della sidebar (`left` inline sotto). Il valore vero
 * della larghezza resta dichiarato in CSS (`EditorSidebar.module.css` `.root`,
 * `FullScreenEditorLayout.module.css` `.sidebar`): questa costante esiste solo perché lo
 * stile inline della maniglia non può leggere un valore da un CSS Module, e deve restare
 * in sincrono con quei due file a mano (restyle Elementor Pro, griglia widget a 3 colonne).
 */
const SIDEBAR_WIDTH = 340;

/**
 * Legge dal payload di dnd-kit (`event.active.data.current`, valorizzato sia da
 * `WidgetPalette` — drag di un tipo nuovo dalla sidebar — sia da `useDraggable` in
 * `EditorBlockWrapper.tsx` — drag di riordino di un nodo esistente) etichetta e icona del
 * tipo di blocco trascinato. Stesso `type` in entrambi i casi: la sola differenza è
 * `isNew` (letto altrove, in `handleDragEnd`), qui irrilevante — l'aspetto della ghost
 * card è identico per i due casi (minimo richiesto dal task).
 */
function draggedBlockInfo(event: DragStartEvent): DraggedBlockInfo {
  const type = (event.active.data.current as { type?: string } | undefined)?.type;
  const descriptor = type ? BLOCK_TYPES.find((entry) => entry.type === type) : undefined;
  return {
    label: descriptor?.meta?.label ?? type ?? 'Blocco',
    iconName: descriptor?.meta?.icon,
  };
}

export interface FullScreenEditorLayoutProps {
  /** Titolo della Pagina in editing, mostrato accanto al pulsante "Torna alla Dashboard". */
  pageTitle: string;
  /**
   * La Pagina in editing, per intero — usata dal Locale Switcher (F05/T6) per conoscere
   * `guid`/`locale`/`translationGroupId` e proporre le traduzioni del gruppo. Non sostituisce
   * `pageTitle` sopra (già usato altrove in questo componente) per non allargare un diff che
   * non serve a quel punto d'uso.
   *
   * **Opzionale** da F06 (ADR-40): questo layout è riusato anche dal Builder delle Sezioni
   * Globali, che non sono Pagine e non hanno né `locale` né gruppo di traduzione. Assente ⇒
   * il Locale Switcher non viene montato, invece di essere alimentato con una Pagina finta.
   */
  page?: PageRecord;
  /** Rotta admin della lista Pagine — destinazione di "Torna alla Dashboard". */
  backHref: string;
  /**
   * L'albero in editing diverge dalla bozza salvata: governa il badge di stato salvataggio
   * (CLAUDE.md § dominio CMS — segnale esplicito, mai overwrite silenzioso).
   */
  hasUnsavedChanges: boolean;
  /** Salvataggio della bozza in corso — stato `loading` del pulsante primario. */
  saving: boolean;
  /** Salva la bozza corrente (`PATCH` con lock ottimistico, gestito dal chiamante). */
  onSaveDraft: () => void;
  onSaveAsTemplate?: () => void;
  templateSaving?: boolean;
  /**
   * Genera e apre l'anteprima in una nuova scheda. `undefined` quando la Pagina non è in
   * bozza: il backend nega il token su ogni altro stato (ADR-25), quindi il pulsante non
   * compare invece di offrire un'azione che risponderebbe sempre con un errore. Propagato a
   * `Toolbar` (icona "occhio" in alto a destra).
   */
  onPreview?: () => void;
  /** Stato di caricamento del pulsante "Anteprima". */
  previewLoading?: boolean;
  /** Contenuto del pannello destro "Struttura/Navigator", visibile solo se aperto. */
  structurePanel?: ReactNode;
  /** Contenuto del canvas centrale (l'albero di blocchi in editing). */
  children: ReactNode;
  /**
   * Propaga a `EditorSidebar` (scheda "Pagina", E01) il salvataggio riuscito/il conflitto di
   * versione del form compatto Titolo/Slug/SEO essenziale — stessi callback già passati a
   * `BlockEditorPanel` dal dettaglio, non una seconda coppia. Assenti quando `page` non è
   * fornita (Builder delle Sezioni Globali, ADR-40): la scheda "Pagina" resta senza contenuto
   * editabile in quel contesto.
   */
  onPageUpdated?: (page: PageRecord) => void;
  onVersionConflict?: () => void;
  /**
   * Stato/transizioni ammesse e handler di cambio stato per il menu "Cambia Stato" — vedi lo
   * stesso commento su `BlockEditorPanelProps` in `BlockEditorPanel.tsx`. Opzionali per lo
   * stesso motivo di `onPageUpdated` sopra (Builder Sezioni Globali, che non ha una macchina a
   * stati Pagina): il menu resta vuoto/nascosto in quel contesto invece di ricevere
   * transizioni inventate. Propagati a `Toolbar` (in alto a destra, bordi squadrati, altezza
   * piena della topbar — non più in fondo alla sidebar sinistra).
   */
  pageStatus?: PageStatus;
  visibleTransitions?: readonly PageStatus[];
  statusSubmitting?: boolean;
  onRequestStatusChange?: (target: PageStatus) => void;
}

/**
 * Layout full-screen dell'editor visivo a blocchi: topbar (60px) + area di lavoro a tre
 * colonne (sidebar widget/props, canvas reattivo al viewport simulato, pannello struttura).
 */
export default function FullScreenEditorLayout({
  pageTitle,
  page,
  backHref,
  hasUnsavedChanges,
  saving,
  onSaveDraft,
  onSaveAsTemplate,
  templateSaving,
  onPreview,
  previewLoading,
  structurePanel,
  children,
  onPageUpdated,
  onVersionConflict,
  pageStatus,
  visibleTransitions,
  statusSubmitting,
  onRequestStatusChange,
}: FullScreenEditorLayoutProps): JSX.Element {
  // Breakpoint a 7 vie (ADR-76) simulato ORA dal canvas (`BreakpointSwitcher.tsx`, topbar) e
  // l'elenco di quelli attivi per il sito (già filtrati/ordinati da `resolveActiveBreakpoints()`):
  // il primo pilota `data-breakpoint`/la larghezza del frame sotto, il secondo risolve quella
  // larghezza in pixel reali (`resolveFrameWidthPx`). `setActiveBreakpoint` aggiorna anche
  // `activeViewport` (3 vie) per conto proprio (vedi `viewportForBreakpoint` nello store): il
  // Property Inspector non ha bisogno di essere letto/scritto da qui.
  const activeBreakpoint = useActiveBreakpoint();
  const activeBreakpoints = useActiveBreakpoints();
  const setActiveBreakpoint = useBlockEditorStore((state) => state.setActiveBreakpoint);
  // Il pulsante che apriva/chiudeva questo pannello è stato rimosso dalla topbar (E01): la
  // stessa "Struttura" è già raggiungibile dalla sidebar sinistra (`EditorSidebar`, scheda
  // "Struttura"). `isStructurePanelOpen` resta comunque letto qui sotto — parte a `false`
  // (default dello store) e non ha più modo di diventare `true`, quindi il pannello non
  // monta mai — invece di rimuovere anche il markup del pannello destro, fuori scope di
  // questo task (CLAUDE.md — solo il task corrente, zero refactoring fuori scope).
  const isStructurePanelOpen = useIsStructurePanelOpen();
  const isSidebarOpen = useIsSidebarOpen();
  const toggleSidebar = useBlockEditorStore((state) => state.toggleSidebar);
  // "Anteprima Pura" (E01): il pulsante "occhio" della topbar che la attivava ora apre invece
  // l'anteprima reale della Pagina in una nuova scheda (richiesta esplicita del task —
  // `onPreview` su `Toolbar`, non più `onTogglePreviewMode`). `isPreviewMode` non ha più modo
  // di diventare `true` (nessun trigger residuo), quindi `isSidebarVisible`/`disabled`/
  // `data-preview-mode` sotto restano sempre nel loro stato "non in anteprima" — letti ancora
  // da qui invece di rimuovere il markup che dipende da loro, fuori scope di questo task
  // (CLAUDE.md — solo il task corrente, zero refactoring fuori scope), stesso principio di
  // `isStructurePanelOpen` sopra.
  const isPreviewMode = useIsPreviewMode();
  const isSidebarVisible = isSidebarOpen && !isPreviewMode;
  const undo = useBlockEditorStore((state) => state.undo);
  const redo = useBlockEditorStore((state) => state.redo);
  const canUndo = useCanUndo();
  const canRedo = useCanRedo();
  const addBlockAction = useBlockEditorStore((state) => state.addBlockAction);
  const moveNodeToAction = useBlockEditorStore((state) => state.moveNodeToAction);

  const [draggedBlock, setDraggedBlock] = useState<DraggedBlockInfo | null>(null);
  // ADR-34 § 5: secondo punto di apertura della libreria sezioni, accanto agli altri
  // controlli della topbar (struttura, anteprima, undo/redo) — sempre `parentId: null`,
  // in coda alla radice.
  // Motore delle scorciatoie da tastiera dell'editor (undo/redo/elimina/deseleziona/
  // duplica): sempre attivo — questo componente è la chrome di un'intera rotta dedicata
  // (`/studio/:guid`), non più un pannello che condivide il DOM con altre schede.
  useEditorShortcuts();

  /*
   * Nessuna idratazione dei Global Design Tokens qui: l'aspetto del Canvas — colori,
   * tipografia, spaziature — deriva ora dal `ThemeConfig` dell'Editor tema, applicato da
   * `IframeCanvas.tsx` sul documento dell'iframe (ADR-72; prima di quell'ADR era
   * `EditorCanvas.tsx` ad applicarlo sul documento padre). È la stessa fonte che veste il
   * sito pubblicato, quindi il Canvas mostra ciò che il visitatore vedrà invece di un
   * secondo sistema di stile parallelo.
   */

  /** Contenitore che scrolla davvero durante il drag (punto 3 del task): `.canvasArea`, non
   * `.canvasRoot` di `EditorCanvas.module.css` (che non ha `overflow` proprio). */
  const canvasAreaRef = useRef<HTMLDivElement | null>(null);
  /** `requestAnimationFrame` dell'auto-scroll in corso, per poterlo cancellare al cleanup. */
  const autoScrollFrameRef = useRef<number | null>(null);
  /** Ultima posizione verticale nota del puntatore durante il drag, letta dal loop `rAF`. */
  const pointerYRef = useRef<number | null>(null);

  /**
   * Larghezza reale disponibile di `.canvasArea` (Sub-Task "Frame WYSIWYG In-Place &
   * Breakpoint Switcher"): un breakpoint largo (es. `widescreen`, `minWidth` 2400px) può
   * eccedere lo spazio a disposizione — `frameScale` sotto ricalcola un fattore di riduzione
   * puramente visivo (`transform: scale(...)`, mai una riduzione della larghezza dichiarata
   * del frame, che deve restare il pixel reale letto dall'`<iframe>` per far scattare le sue
   * vere media query) ogni volta che questa larghezza cambia. `useMergedRef` (stesso principio
   * di `IframeCanvas.tsx` § `assignRefs`) combina questo ref con `canvasAreaRef` sopra, che
   * resta il riferimento imperativo letto dall'auto-scroll durante il drag.
   */
  const { ref: canvasSizeRef, width: canvasAreaWidth } = useElementSize<HTMLDivElement>();
  const setCanvasAreaRef = useMergedRef(canvasAreaRef, canvasSizeRef);

  /**
   * Riferimento sincrono all'elemento `<iframe>` del canvas, sollevato da `IframeCanvas.tsx`
   * tramite il ref forwardato (`ADR-72` § "Decisione" punto 3): la funzione di misura
   * cross-frame ne legge `getBoundingClientRect()`/`contentDocument` ad ogni misura, senza
   * passare da uno stato React (che introdurrebbe un giro di render fra il montaggio
   * dell'iframe e la disponibilità della misura corretta).
   */
  const iframeElRef = useRef<HTMLIFrameElement | null>(null);
  /**
   * Documento di riferimento del drag corrente (`'parent'`/`'iframe'`/`null`), impostato in
   * `handleDragStart` dall'origine del nodo trascinato (convenzione `new-block:` di
   * `WidgetPalette.tsx`, stessa di `isPaletteOrigin`) e azzerato in `handleDragEnd`/
   * `onDragCancel` — mai uno stato globale mutabile fuori dal ciclo di vita del drag (ADR-72
   * § "Decisione" punto 3, ultimo capoverso).
   */
  const dragOriginRef = useRef<DragOrigin>(null);

  /**
   * Funzione di misura cross-frame per `measuring.droppable/draggable.measure` del
   * `DndContext` sotto (ADR-72 § "Decisione" punto 3): algoritmo portato invariato da
   * `PageSpikePortalBridgeParent.tsx` (PoC T3), verificato con mouse reale 10/10 run
   * deterministici. La lettura di `iframeElRef.current`/`dragOriginRef.current` resta dentro
   * questo `useCallback` locale (mai passata come argomento a una fabbrica esterna: il rule
   * `react-hooks/refs` segnala la lettura di un ref fuori dal componente che lo possiede
   * durante il render) — `[]` di dipendenze: entrambi i ref sono stabili per l'intera vita del
   * componente, letti in modo imperativo solo quando `dnd-kit` invoca la funzione, mai durante
   * il render di questo componente.
   */
  const measureCrossFrame = useCallback((element: Element): ClientRect => {
    const rect = element.getBoundingClientRect();
    const iframe = iframeElRef.current;
    const origin = dragOriginRef.current;
    if (!iframe || !origin) return toPlainRect(rect);

    const elementIsInIframe = element.ownerDocument === iframe.contentDocument;
    const frameRect = iframe.getBoundingClientRect();

    if (origin === 'parent' && elementIsInIframe) {
      return shiftRect(rect, frameRect.left, frameRect.top);
    }
    if (origin === 'iframe' && !elementIsInIframe) {
      return shiftRect(rect, -frameRect.left, -frameRect.top);
    }
    return toPlainRect(rect);
  }, []);

  const measuring: MeasuringConfiguration = useMemo(
    () => ({
      droppable: { measure: measureCrossFrame },
      draggable: { measure: measureCrossFrame },
    }),
    [measureCrossFrame],
  );

  // Puntatore + tastiera (dnd-kit T7): la tastiera è anche la via deterministica per i test
  // E2E futuri. `distance` evita che un click sulla maniglia (selezione, tooltip), o un
  // click-to-add su una tessera della palette widget, venga scambiato per un trascinamento
  // di un pixel — 5px invece di 4 per lo stesso motivo con più margine.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  function handleDragStart(event: DragStartEvent): void {
    // Origine del drag corrente (ADR-72 § "Decisione" punto 3): una tessera di
    // `WidgetPalette` (id `new-block:<type>`, documento padre) contro il riordino di un nodo
    // già esistente nell'albero (DOM portato nell'iframe da `IframeCanvas.tsx`). Letto dalla
    // funzione di misura cross-frame ad ogni `getBoundingClientRect()`.
    dragOriginRef.current = isPaletteOrigin(String(event.active.id)) ? 'parent' : 'iframe';
    setDraggedBlock(draggedBlockInfo(event));
  }

  function handleDragEnd(event: DragEndEvent): void {
    dragOriginRef.current = null;
    setDraggedBlock(null);
    const { active, over } = event;
    if (!over) return;
    const target = over.data.current as DropTarget | undefined;
    if (!target) return;
    const activeData = active.data.current as { type?: string; isNew?: boolean } | undefined;
    if (activeData?.isNew) {
      // Sorgente: una tessera di `WidgetPalette` (id sintetico `new-block:<type>`, mai un
      // nodo dell'albero). Stessa `addBlockAction` che usa la `Menu` click-to-add di
      // `BlockPalette` — il drag & drop è solo un secondo modo di invocarla.
      const descriptor = BLOCK_TYPES.find((entry) => entry.type === activeData.type);
      if (!descriptor) return;
      addBlockAction(target.parentId, descriptor.type, target.index, defaultPropsFor(descriptor));
      return;
    }
    // Nessuna azione nuova: lo stesso comando invertibile e validato che muovono i
    // pulsanti indent/outdent/su/giù. `moveNodeToAction` no-opera da sola se il registro
    // non ammette il tipo lì, o se la destinazione è il nodo stesso o un suo discendente.
    moveNodeToAction(String(active.id), target.parentId, target.index);
  }

  // Larghezza dichiarata del frame per il breakpoint simulato (`undefined` ⇒ `'default'`
  // fluido, `.viewportDesktop`) e fattore di riduzione puramente visivo quando eccede lo
  // spazio disponibile di `.canvasArea` (punto 4 del task, `resolveFrameWidthPx` sopra).
  const frameWidthPx = resolveFrameWidthPx(activeBreakpoint, activeBreakpoints);
  const isFluidFrame = frameWidthPx === undefined;
  // `Math.min(1, ...)`: un frame già più stretto dell'area disponibile non va mai ingrandito
  // (nessuno zoom-in), solo mai fatto traboccare orizzontalmente. `canvasAreaWidth === 0`
  // (primo render, prima che `ResizeObserver` misuri) ⇒ nessuna riduzione ancora applicata,
  // stesso principio prudente di un frame più stretto dell'area.
  const frameScale =
    !isFluidFrame && frameWidthPx && canvasAreaWidth > 0
      ? Math.min(1, canvasAreaWidth / frameWidthPx)
      : 1;
  // Stile inline sopra la classe base `.viewportContainer` (che porta già la `transition`
  // fluida su `width`/`transform`, riusata invariata): il frame fluido (`'default'`) non
  // riceve alcuno stile inline, resta pilotato solo da `.viewportDesktop` come oggi.
  const viewportFrameStyle: CSSProperties | undefined = isFluidFrame
    ? undefined
    : { width: `${frameWidthPx}px`, transform: `scale(${frameScale})` };

  const isDragActive = draggedBlock !== null;

  /**
   * Auto-scroll del canvas durante il drag (punto 3 del task): dnd-kit non espone
   * comodamente le coordinate assolute del puntatore via `onDragMove` (solo il delta dal
   * punto di partenza), quindi un listener nativo `pointermove` su `window` è il modo più
   * diretto — coerente con lo stile già in uso nel codebase per interazioni non coperte
   * dagli hook di React (`EditorBlockWrapper.tsx`, resizer inter-colonna). Soglia di ~60px
   * dai bordi superiore/inferiore di `.canvasArea`, velocità proporzionale alla vicinanza
   * al bordo, `requestAnimationFrame` per uno scroll continuo e fluido finché il puntatore
   * resta nella zona soglia. Cleanup (listener + `rAF` pendente) ad ogni fine drag —
   * l'array di dipendenze `[isDragActive]` lo esegue anche su unmount, per costruzione di
   * `useEffect`.
   */
  useEffect(() => {
    if (!isDragActive) return undefined;

    const EDGE_THRESHOLD_PX = 60;
    const MAX_SCROLL_SPEED_PX = 18;

    function handlePointerMove(event: PointerEvent): void {
      pointerYRef.current = event.clientY;
    }

    function tick(): void {
      const canvasEl = canvasAreaRef.current;
      const pointerY = pointerYRef.current;
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
      autoScrollFrameRef.current = requestAnimationFrame(tick);
    }

    window.addEventListener('pointermove', handlePointerMove);
    autoScrollFrameRef.current = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      if (autoScrollFrameRef.current !== null) {
        cancelAnimationFrame(autoScrollFrameRef.current);
        autoScrollFrameRef.current = null;
      }
      pointerYRef.current = null;
    };
  }, [isDragActive]);

  return (
    <div className={styles.root}>
      <Toolbar
        pageTitle={pageTitle}
        backHref={backHref}
        activeBreakpoint={activeBreakpoint}
        onBreakpointChange={setActiveBreakpoint}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={undo}
        onRedo={redo}
        hasUnsavedChanges={hasUnsavedChanges}
        saving={saving}
        onSaveDraft={onSaveDraft}
        onSaveAsTemplate={onSaveAsTemplate}
        templateSaving={templateSaving}
        pageStatus={pageStatus}
        onPreview={onPreview}
        previewLoading={previewLoading}
        visibleTransitions={visibleTransitions}
        statusSubmitting={statusSubmitting}
        onRequestStatusChange={onRequestStatusChange}
        trailingActions={
          <>
            {/* Import/Export JSON (ADR-56 § 3): utilità di migrazione contenuto, mai "I
                miei Template" — nessuna libreria personale, solo un file scaricato/caricato
                dal browser. "Esporta JSON" agisce sul blocco selezionato in radice o
                annidato: `disabled` quando nulla è selezionato, invece di un click che non
                farebbe nulla. */}
          </>
        }
      />

      {/*
        Label discreta sotto la Topbar con la larghezza del device frame simulato, solo per i
        breakpoint non fluidi (`'default'` resta escluso, `isFluidFrame` sopra) — puramente
        informativa, nessun effetto sul rendering: la larghezza reale del frame resta pilotata
        solo da `viewportFrameStyle` sotto.
      */}
      {!isFluidFrame && (
        <div className={styles.viewportDimensionLabel}>
          {BREAKPOINT_LABELS[activeBreakpoint]} · {frameWidthPx}px
        </div>
      )}

      <DndContext
        sensors={sensors}
        // `pointerWithin` invece di `closestCenter`: le drop-zone sono strisce sottili
        // (`.dropZone`, 6px) annidate dentro contenitori grandi (`.containerDropZone`).
        // `closestCenter` sceglie il *centro* più vicino, che spesso è quello del
        // contenitore anche col puntatore sopra la striscia sottile del figlio; `pointerWithin`
        // sceglie solo fra le zone che contengono davvero il puntatore, coerente col
        // comportamento atteso di un editor stile Elementor.
        collisionDetection={pointerWithin}
        // Ponte di misura cross-frame (ADR-72 § "Decisione" punto 3, commento di testa del
        // file): senza questo, un drag che attraversa il confine iframe↔padre risolve sempre
        // `over: null`, perché il rettangolo dei nodi portati nell'iframe verrebbe misurato
        // nel sistema di riferimento locale dell'iframe, mai tradotto nell'offset del suo
        // riquadro nella pagina padre.
        measuring={measuring}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={() => {
          dragOriginRef.current = null;
          setDraggedBlock(null);
        }}
      >
        <div className={styles.canvasShell}>
          <div className={styles.workArea}>
            {/*
            Sempre montata (mai `isSidebarOpen && (...)`): smontare `EditorSidebar` ne
            perderebbe lo stato interno (`activeSidebarTab`, scroll) ogni volta che si
            richiude — oltre a impedire la transizione di larghezza sotto, che richiede
            l'elemento presente per animare `flex-basis` invece di comparire/sparire di
            colpo. `styles.sidebarCollapsed` porta la larghezza a 0 mantenendo il nodo nel
            DOM.
          */}
            <aside
              className={`${styles.sidebar} ${isSidebarVisible ? '' : styles.sidebarCollapsed}`}
            >
              <EditorSidebar
                page={page}
                onPageUpdated={onPageUpdated}
                onVersionConflict={onVersionConflict}
              />
            </aside>

            {/*
              Freccina di collasso/espansione (stile Elementor): sostituisce l'icona "occhio"
              rimossa dalla topbar — stesso `toggleSidebar`/`isSidebarVisible` di prima, solo
              spostata sul bordo della sidebar sinistra, verticalmente centrata. Posizionata
              come fratello di `.sidebar` dentro `.workArea` (`position: relative`), non
              dentro l'`aside`: quando la sidebar collassa a `flex-basis: 0` il suo contenuto
              sparisce (`overflow: hidden`), quindi la maniglia deve vivere fuori per restare
              cliccabile in entrambi gli stati. La posizione orizzontale segue `left` inline
              (`SIDEBAR_WIDTH` aperta, 0 chiusa) invece di una seconda classe CSS, per la
              stessa transizione morbida di `.sidebar` (`flex-basis 200ms ease`, vedi CSS
              module).
            */}
            <ActionIcon
              variant="default"
              size="sm"
              radius="xl"
              className={styles.sidebarToggle}
              style={{ left: isSidebarVisible ? SIDEBAR_WIDTH : 0 }}
              aria-label={
                isSidebarVisible ? 'Comprimi pannello sinistro' : 'Espandi pannello sinistro'
              }
              aria-pressed={isSidebarVisible}
              disabled={isPreviewMode}
              onClick={toggleSidebar}
            >
              {isSidebarVisible ? <IconChevronLeft size={14} /> : <IconChevronRight size={14} />}
            </ActionIcon>

            <div
              className={styles.canvasArea}
              ref={setCanvasAreaRef}
              // "Anteprima Pura" (E01): disattiva i contorni hover/selezione del canvas —
              // vedi la regola `[data-preview-mode='true']` in
              // `EditorBlockWrapper.module.css`, gate CSS puro, nessuna prop nuova sul
              // wrapper di ogni blocco.
              data-preview-mode={isPreviewMode || undefined}
              // Confine reale di clipping (`overflow-y: auto`) usato da
              // `EditorBlockWrapper.tsx` (anti-clip della toolbar di selezione,
              // `BlockHoverOverlay.tsx`) per sapere se il blocco selezionato è troppo
              // vicino al bordo superiore scrollabile per ospitare la toolbar sopra di sé —
              // trovato con `closest()`, mai un secondo ref passato in giù per questo solo
              // scopo.
              data-canvas-scroll-area="true"
            >
              {/*
              `data-breakpoint` non pilota nessuna media query nuova (il sync col rendering
              responsive dei blocchi passa già dalla larghezza reale dell'`<iframe>` sotto,
              ridimensionato a `frameWidthPx` — vere media query CSS, non classi finte):
              resta solo un aggancio dichiarativo per selettori CSS/E2E futuri sul breakpoint
              simulato, senza introdurre un secondo sistema di breakpoint. `viewportFrameStyle`
              (`undefined` per `'default'`) porta la larghezza esatta in px e il fattore di
              riduzione visiva (`transform: scale(...)`, punto 4 del task) sopra la classe
              base `.viewportContainer`, che porta già la `transition` fluida riusata invariata
              da prima di questo task — l'animazione resta fluida qualunque sia il breakpoint.
            */}
              <div
                className={`${styles.viewportContainer} ${isFluidFrame ? styles.viewportDesktop : styles.viewportFramed}`}
                style={viewportFrameStyle}
                data-breakpoint={activeBreakpoint}
              >
                {/*
                  Canvas incapsulato in iframe same-origin (ADR-72): `IframeCanvas` proietta
                  `children` (il `canvasTree`, oggi `InvalidBlockProvider > EditorCanvas`, non
                  toccato dal chiamante) dentro `iframe.contentDocument` via `createPortal`,
                  restando nello stesso albero React di questo `DndContext`. Il ref sollevato è
                  l'elemento `<iframe>` stesso: unico wiring richiesto da `measuring` sopra per
                  leggere sincronicamente `getBoundingClientRect()`/`contentDocument`.
                */}
                <IframeCanvas ref={iframeElRef}>{children}</IframeCanvas>
              </div>
            </div>

            {isStructurePanelOpen && (
              <aside className={styles.structurePanel} aria-label="Struttura della pagina">
                {structurePanel}
              </aside>
            )}
          </div>
        </div>

        <DragOverlay>
          {draggedBlock
            ? (() => {
                // "Ghost card" semitrasparente (punto 2 del task): la trasparenza va sul
                // contenuto (`styles.dragGhostContent`), non sul `Paper` bordo — un bordo
                // sbiadito sarebbe meno leggibile del contenuto sbiadito. `DragOverlay` di
                // dnd-kit segue già il cursore da solo: nessun calcolo di posizione qui.
                const DraggedIcon = blockIcon(draggedBlock.iconName);
                return (
                  <Paper withBorder p="xs" radius="sm" shadow="md">
                    <div className={styles.dragGhostContent}>
                      <DraggedIcon size={16} />
                      <Text size="sm" fw={600}>
                        {draggedBlock.label}
                      </Text>
                    </div>
                  </Paper>
                );
              })()
            : null}
        </DragOverlay>
      </DndContext>

      {/* Input file nascosto dietro l'`ActionIcon` "Importa JSON" sopra (ADR-56 § 3):
          `display: none` via `hidden`, mai un elemento visibile — il click è delegato dal
          `ref` (`handleImportClick`). */}
    </div>
  );
}
