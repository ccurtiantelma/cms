/**
 * Chrome dell'editor attorno a un singolo nodo dell'albero (PLAN-F04-editor-visivo.md T4,
 * restyle Elementor Pro nel punto 4 di un task successivo): selezione, drag & drop
 * (dnd-kit), eliminazione ed inserimento posizionale.
 *
 * **Overlay hover/selezione unico (reversal esplicito e autorizzato, vedi il commento di
 * testa del blocco di render "Toolbar di selezione" più sotto).** Fra questo task e uno
 * precedente era esistita — poi deliberatamente rimossa — una barra di icone fissa per
 * ogni blocco (drag/duplica/elimina/modifica), sostituita da tre varianti di chrome
 * mutuamente esclusive per categoria (handle tab compatta delle Sezioni, badge informativo
 * dei contenitori, sola linguetta "Modifica" delle foglie). Il proprietario del progetto ha
 * chiesto e autorizzato consapevolmente di tornare a un overlay contestuale unico
 * (`BlockHoverOverlay.tsx`) con quei controlli (più "Seleziona genitore", aggiunto in un
 * round successivo) su **qualunque** blocco attivo — non
 * un'assunzione di questo file, una decisione presa altrove e qui solo implementata. "Sposta
 * su/giù", "Sposta dentro/fuori dal contenitore" e il menu "Cambia livello del titolo"
 * restano comunque raggiungibili solo dal menu contestuale (`CanvasContextMenu.tsx`, tasto
 * destro) — mai una seconda copia della stessa azione nell'overlay.
 *
 * **Split hover/selezione (round successivo, F04d-02).** I due stati ora portano segnali
 * distinti, mai sovrapposti sullo stesso blocco: hover senza selezione mostra solo il
 * bordo di categoria (v. `overlayBorderClassName` sotto) più un badge nome in alto a
 * sinistra (`.hoverBadge`); la toolbar di cinque controlli sopra è montata **solo** su
 * `isSelected`, ancorata in alto a destra (`BlockHoverOverlay.module.css`), non più al
 * centro del bordo superiore. Nessun controllo si è spostato: stessa toolbar, stesse
 * cinque azioni, solo la condizione di montaggio e la posizione sono cambiate.
 *
 * Ogni azione che cambia la struttura passa dallo store, che la verifica contro il
 * registro dei blocchi prima di applicarla: qui si decide solo se *offrirla* (es.
 * `canDropInto` per il drag & drop) — mai una regola scritta due volte.
 *
 * **Un solo renderer.** Il contenuto del blocco è renderizzato dai componenti di F02 T8,
 * invariati: `BlockRenderer` per le foglie. Per un contenitore la chrome deve inserirsi
 * *fra* il contenitore e i suoi figli (ogni figlio ha la propria toolbar), cosa che il
 * dispatcher ricorsivo non può fare dall'esterno: si riusa quindi lo **stesso** componente
 * di F02 (`CONTAINER_COMPONENTS`) passando i figli già avvolti. Nessun componente di blocco
 * viene riscritto qui: ciò che si vede nell'editor è ciò che pubblica il sito.
 *
 * Sottoscrizioni allo store: mirate per id (nodo, posizione fra i fratelli, id dei figli,
 * "sono io il selezionato?"). Nessun componente legge l'intero `tree` (NFR § Performance —
 * editor).
 *
 * **Overlay hover/selezione (PLAN-F04c-editor-maturo.md T8).** L'hover è promosso a stato
 * React locale (`isHovered`, mai Zustand: nessun altro componente lo consulta — verificato
 * su `EditorStructureNavigator.tsx`, che seleziona solo dal nome, non dal canvas — quindi
 * non è stato condiviso, CLAUDE.md § selettori mirati) invece di lasciarlo al solo CSS
 * `:hover`, che cascherebbe su ogni antenato del nodo puntato (il DOM di un figlio è
 * geometricamente dentro quello del padre). Gli handler usano **`onMouseOver`/`onMouseOut`**
 * (non `onMouseEnter`/`onMouseLeave`, che in React non attraversano mai il bubbling e per cui
 * `stopPropagation()` sarebbe un no-op): bubbling nativo + `stopPropagation()` sul nodo più
 * interno replica l'idioma già usato qui per il click-to-select, e garantisce che solo il
 * nodo effettivamente sotto il puntatore riceva lo stato "hovered".
 */
import {
  createContext,
  createElement,
  memo,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { Text } from '@mantine/core';
import { useShallow } from 'zustand/react/shallow';
import { useDndContext, useDraggable, useDroppable } from '@dnd-kit/core';
import { notifications } from '@mantine/notifications';
import { BLOCK_TYPES } from '../../../types/blocks.types';
import {
  useActiveViewport,
  useBlockEditorStore,
  useContainerResizePercent,
  useIsHiddenInCanvas,
  useIsHoveredFromNavigator,
  useNodeById,
  type EditorViewport,
} from '../../../hooks/useBlockEditorStore';
import { findLocation, findNode, type BlockNode } from './block-tree.utils';
import { canDropInto } from './block-registry.utils';
import {
  containerWidthPercentFromPointer,
  formatContainerWidthBadge,
  readContainerWidthPercent,
  resolveContainerWidthSpec,
  resolveLayoutParentWidth,
  CONTAINER_WIDTH_PROP,
} from './container-resize.utils';
import ContainerResizeHandle from './components/ContainerResizeHandle';
import BlockRenderer from '../../../components/blocks/BlockRenderer';
import BlockErrorBoundary from '../../../components/blocks/BlockErrorBoundary';
import Section from '../../../components/blocks/blocks/Section';
import Container from '../../../components/blocks/blocks/Container';
import FormBlock from '../../../components/blocks/blocks/FormBlock';
import tokenStyles from '../../../components/blocks/style-tokens.module.css';
import { resolveHideClassName, resolveResponsiveClassNames } from '../../../components/blocks/style-tokens';
import ConfirmModal from '../../../components/ConfirmModal';
import BlockPalette, { blockIcon } from './BlockPalette';
import BlockHoverOverlay from './components/BlockHoverOverlay';
import InlineFloatingToolbar from './InlineFloatingToolbar';
import InlineFormattingToolbar, {
  HEADING_LEVELS,
  type HeadingLevel,
  type ToolbarAlign,
  type ToolbarFormat,
} from './InlineFormattingToolbar';
import styles from './EditorBlockWrapper.module.css';

const CONTAINER_WIDTH_SPEC = resolveContainerWidthSpec();
const COLUMN_RATIO_VALUES = ['equal', '33-66', '66-33'] as const;
type ColumnRatioValue = (typeof COLUMN_RATIO_VALUES)[number];
const COLUMN_RATIO_BOUNDARY_PERCENT: Record<ColumnRatioValue, number> = {
  equal: 50,
  '33-66': 33.333,
  '66-33': 66.667,
};

interface SectionContainerProps {
  children: ReactNode;
  styleSpaceBefore?: unknown;
  styleSpaceAfter?: unknown;
  stylePadding?: unknown;
  styleBackground?: unknown;
  columns?: unknown;
  gap?: unknown;
  alignItems?: unknown;
  contentWidth?: unknown;
  maxWidth?: unknown;
  columnRatio?: unknown;
  styleBackgroundColor?: unknown;
  styleColor?: unknown;
  stylePaddingTop?: unknown;
  stylePaddingRight?: unknown;
  stylePaddingBottom?: unknown;
  stylePaddingLeft?: unknown;
  styleMarginTop?: unknown;
  styleMarginRight?: unknown;
  styleMarginBottom?: unknown;
  styleMarginLeft?: unknown;
  styleLayer?: unknown;
  styleHideDesktop?: unknown;
  styleHideTablet?: unknown;
  styleHideMobile?: unknown;
}

/**
 * Props del blocco `container` (ADR-39): le sei props di layout flex
 * (`display`/`flexDirection`/`justifyContent`/`alignItems`/`wrap`/`gap`) più le due props
 * avanzate universali di ADR-38 § 6 (`customCssClass`/`customElementId`) — schema
 * indipendente da quello di `section`, mai un solo oggetto condiviso fra i contenitori del
 * registro (ADR-39 § 2: nessuna prop di stile su `container` in questo round).
 */
interface ContainerBlockProps {
  children: ReactNode;
  display?: unknown;
  flexDirection?: unknown;
  justifyContent?: unknown;
  alignItems?: unknown;
  wrap?: unknown;
  gap?: unknown;
  styleBackgroundColor?: unknown;
  styleColor?: unknown;
  customCssClass?: unknown;
  customElementId?: unknown;
}

/**
 * Props del blocco `form` (ADR-46 § 1, RFC-46 D1): unica prop dichiarata dal registro,
 * `formKey` — nessuna prop di stile (ADR-46 § Conformità).
 */
interface FormBlockContainerProps {
  children: ReactNode;
  formKey?: unknown;
}

/**
 * Unione delle props ammesse da un componente montato in `CONTAINER_COMPONENTS`: ogni
 * tipo contenitore del registro dichiara il proprio schema — qui `section`, `container`
 * (ADR-39) e `form` (ADR-46). Tutte le interfacce dichiarano solo `children` come
 * obbligatoria e ogni altra prop opzionale (`unknown`): strutturalmente compatibili con
 * l'unione, senza bisogno di `any` per tipizzare il record qui sotto.
 */
type ContainerComponentProps =
  SectionContainerProps | ContainerBlockProps | FormBlockContainerProps;

const CONTAINER_COMPONENTS: Record<string, (props: ContainerComponentProps) => JSX.Element> = {
  section: Section,
  container: Container,
  form: FormBlock,
};

/**
 * Props da passare al componente di contenuto quando il nodo è un contenitore
 * (`CONTAINER_COMPONENTS`): ogni tipo ha il proprio insieme di props di registro,
 * incompatibili l'uno con l'altro (`section` è layout a colonne/stile, `container` è
 * layout flex puro, ADR-39) — mai un solo oggetto condiviso passato a entrambi.
 */
function resolveContainerComponentProps(
  node: BlockNode,
):
  | Omit<SectionContainerProps, 'children'>
  | Omit<ContainerBlockProps, 'children'>
  | Omit<FormBlockContainerProps, 'children'> {
  if (node.type === 'container') {
    return {
      display: node.props.display,
      flexDirection: node.props.flexDirection,
      justifyContent: node.props.justifyContent,
      alignItems: node.props.alignItems,
      wrap: node.props.wrap,
      gap: node.props.gap,
      styleBackgroundColor: node.props.styleBackgroundColor,
      styleColor: node.props.styleColor,
      customCssClass: node.props.customCssClass,
      customElementId: node.props.customElementId,
    };
  }
  if (node.type === 'form') {
    return {
      formKey: node.props.formKey,
    };
  }
  return {
    styleSpaceBefore: node.props.styleSpaceBefore,
    styleSpaceAfter: node.props.styleSpaceAfter,
    stylePadding: node.props.stylePadding,
    styleBackground: node.props.styleBackground,
    columns: node.props.columns,
    gap: node.props.gap,
    alignItems: node.props.alignItems,
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

/**
 * Nome della prop di visibilità (ADR-37 § 3) per ciascun viewport del Device Switcher
 * (`FullScreenEditorLayout.tsx`, `EditorViewport`), ed etichetta italiana per il badge —
 * stessa formulazione di `blocks.types.ts` § meta.props (`Nascondi su Desktop/Tablet/
 * Mobile`), coniugata al participio per il messaggio del Canvas.
 */
const VIEWPORT_HIDE_PROP: Record<
  EditorViewport,
  'styleHideDesktop' | 'styleHideTablet' | 'styleHideMobile'
> = {
  desktop: 'styleHideDesktop',
  tablet: 'styleHideTablet',
  mobile: 'styleHideMobile',
};
const VIEWPORT_LABEL: Record<EditorViewport, string> = {
  desktop: 'Desktop',
  tablet: 'Tablet',
  mobile: 'Mobile',
};

/** Millisecondi di inattività prima che un `onTextInput`/`onHtmlInput`/`onLabelInput` raggiunga lo store (punto 1 del task). */
const EDIT_DEBOUNCE_MS = 300;

/** Id del nodo respinto dall'ultima validazione server-side, o `null`. */
const InvalidBlockContext = createContext<string | null>(null);

/** Rende disponibile a tutta la chrome il nodo colpevole dell'ultimo `400` di validazione. */
export function InvalidBlockProvider({
  invalidBlockId,
  children,
}: {
  invalidBlockId: string | null;
  children: ReactNode;
}): JSX.Element {
  return (
    <InvalidBlockContext.Provider value={invalidBlockId}>{children}</InvalidBlockContext.Provider>
  );
}

/**
 * Valore scalare effettivo di una prop responsive (`{ default, tablet?, mobile? }`, ADR-29)
 * al viewport indicato — solo la logica di fallback di `resolveResponsiveClassNames`
 * (`style-tokens.ts`), non la generazione di classi CSS: qui serve leggere il valore vero
 * per decidere *se* mostrare il resizer di colonne (punto 1 del task), non per disegnarlo.
 * Cascata `mobile → tablet → default`: un breakpoint senza valore proprio eredita quello
 * del breakpoint meno specifico immediatamente sopra, mai un errore silenzioso.
 */
function resolveEffectiveResponsiveValue(
  value: unknown,
  viewport: EditorViewport,
): string | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const envelope = value as Record<string, unknown>;
  if (viewport === 'mobile' && typeof envelope.mobile === 'string') return envelope.mobile;
  if (viewport !== 'desktop' && typeof envelope.tablet === 'string') return envelope.tablet;
  return typeof envelope.default === 'string' ? envelope.default : undefined;
}

interface EditorBlockWrapperProps {
  id: string;
}

/**
 * Attributi `data-*` di una zona di rilascio (dnd-kit T7): se il puntatore ci sta sopra
 * durante un trascinamento (`isOver`), e se quel drop sarebbe ammesso — letto con
 * `canDropInto` sull'albero corrente (`getState().tree`, non una sottoscrizione: durante
 * l'hover l'albero non cambia, è il solo `isOver`/`active` di dnd-kit a farlo, quindi non
 * serve un re-render pilotato dallo store per questo calcolo). I tre segni di rilascio
 * (linea, evidenziazione, rifiuto) sono tutti CSS su questi due attributi.
 */
function dropZoneAttrs(
  isOver: boolean,
  activeDragId: string | null,
  activeDragType: string | undefined,
  targetParentId: string | null,
): { 'data-over': boolean; 'data-rejected': boolean } {
  const rejected =
    isOver && activeDragId !== null
      ? !canDropInto(
          useBlockEditorStore.getState().tree,
          activeDragId,
          targetParentId,
          activeDragType,
        )
      : false;
  return { 'data-over': isOver, 'data-rejected': rejected };
}

interface ColumnDropTargetProps {
  parentId: string;
  columnIndex: number;
  columnCount: number;
  activeDragId: string | null;
  activeDragType: string | undefined;
}

/** Bersaglio visibile per inserire un blocco nella singola colonna di una Section. */
function ColumnDropTarget({
  parentId,
  columnIndex,
  columnCount,
  activeDragId,
  activeDragType,
}: ColumnDropTargetProps): JSX.Element {
  const { setNodeRef, isOver } = useDroppable({
    id: `section-column:${parentId}:${columnIndex}`,
    data: { parentId, index: columnIndex },
  });

  return (
    <div
      ref={setNodeRef}
      className={styles.columnDropTarget}
      style={{ left: `${(columnIndex * 100) / columnCount}%`, width: `${100 / columnCount}%` }}
      {...dropZoneAttrs(isOver, activeDragId, activeDragType, parentId)}
      aria-label={`Drop target Colonna ${columnIndex + 1}`}
    />
  );
}

const EditorBlockWrapper = memo(function EditorBlockWrapper({
  id,
}: EditorBlockWrapperProps): JSX.Element | null {
  const node = useNodeById(id);
  const location = useBlockEditorStore(useShallow((state) => findLocation(state.tree, id)));
  const childIds = useBlockEditorStore(
    useShallow((state) => findNode(state.tree, id)?.children.map((child) => child.id) ?? []),
  );
  const isSelected = useBlockEditorStore((state) => state.selectedId === id);
  const isInvalid = useContext(InvalidBlockContext) === id;
  const activeViewport = useActiveViewport();
  const selectNode = useBlockEditorStore((state) => state.selectNode);
  const removeBlockAction = useBlockEditorStore((state) => state.removeBlockAction);
  const updateBlockPropsAction = useBlockEditorStore((state) => state.updateBlockPropsAction);
  const setContainerResizePreview = useBlockEditorStore((state) => state.setContainerResizePreview);
  const clearContainerResizePreview = useBlockEditorStore(
    (state) => state.clearContainerResizePreview,
  );
  const commitContainerWidthAction = useBlockEditorStore(
    (state) => state.commitContainerWidthAction,
  );
  /** "Occhio" del pannello Struttura/Navigator (`EditorStructureNavigator.tsx`): nascosto solo qui nel canvas, mai persistito. */
  const isHiddenInCanvas = useIsHiddenInCanvas(id);
  /** Riga corrispondente sotto il puntatore nel pannello Struttura/Navigator — stesso trattamento visivo dell'hover nel canvas. */
  const isHoveredFromNavigator = useIsHoveredFromNavigator(id);

  const [confirmOpened, setConfirmOpened] = useState(false);
  /** Solo il nodo direttamente sotto il puntatore (vedi commento di testa). */
  const [isHovered, setIsHovered] = useState(false);

  /**
   * Debounce (punto 1 del task) per `onTextInput`/`onHtmlInput`/`onLabelInput`: il DOM
   * resta l'unica fonte di verità mentre si digita (invariato, vedi `Heading.tsx`), ma lo
   * store riceve comunque un `updateBlockPropsAction` dopo {@link EDIT_DEBOUNCE_MS}ms di
   * inattività, così l'undo stack e ogni altro consumatore dello store non restano indietro
   * di un intero paragrafo. `useRef`, non `useDebouncedCallback` di `@mantine/hooks`: le sue
   * semantiche di cancel/flush non sono verificate in questo codebase, un timer manuale è
   * sotto controllo diretto (vedi nota di contesto del task).
   */
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Nodo DOM del wrapper (punto 2 del task, disaccoppiamento drag/testo): stesso elemento
   * di `setDragRef` sotto (dnd-kit), letto qui in più per due usi che non gli appartengono
   * — trovare il `contentEditable` del nodo per `InlineFloatingToolbar` (via
   * `querySelector`, non un secondo ref forwardato da `RichText.tsx`, che resterebbe così
   * senza dipendenze di editor) e verificare, in `onFocus`/`onBlur`, se il focus è dentro
   * un discendente in editing.
   */
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  /**
   * `true` mentre il focus è dentro un discendente `contentEditable` di questo nodo (punto
   * 2 del task): disabilita il drag dello stesso nodo (`useDraggable({ disabled })` sotto)
   * finché dura, così un trascinamento accidentale non interrompe una selezione di testo
   * in corso. `onFocus`/`onBlur` bubbling nativo (React 17+): risale anche dai contenitori
   * che ospitano un figlio in editing, disabilitando anche il loro drag — conservativo per
   * costruzione, mai un buco di sicurezza nell'altro verso.
   */
  const [isEditingText, setIsEditingText] = useState(false);

  /**
   * Stato del drag del resizer inter-colonna (punto 1 del task), mai in Zustand: nessun
   * altro componente lo consulta, e durante il drag cambia ad ogni `pointermove` — uno
   * stato React (o peggio, di store) qui produrrebbe un re-render per pixel spostato.
   * `null` a riposo; `lastValue` evita `updateBlockPropsAction` ridondanti quando il
   * puntatore si muove dentro la stessa zona di snap.
   */
  const columnResizeRef = useRef<{ containerEl: HTMLElement; lastValue: ColumnRatioValue } | null>(
    null,
  );

  /**
   * `true` mentre la maniglia di ridimensionamento di questo `container` è sotto
   * trascinamento (E03, punto 2): disabilita il drag dnd-kit dello stesso nodo
   * (`useDraggable({ disabled })` sotto), altrimenti il `PointerSensor` del `DndContext`
   * interpreterebbe lo stesso `pointermove` come l'inizio di uno spostamento del blocco e
   * il container partirebbe dietro al puntatore invece di allargarsi. Stato React e non
   * `useRef` proprio perché `useDraggable` deve vederlo cambiare: due render per gesto
   * (inizio e fine), non uno per pixel.
   */
  const [isResizingWidth, setIsResizingWidth] = useState(false);

  /**
   * Dati del gesto di ridimensionamento in corso, mai in Zustand: `originLeft` (bordo
   * sinistro del nodo al `pointerdown`, fisso per tutta la durata — un `justifyContent`
   * centrato lo farebbe altrimenti scivolare sotto le dita) e `parentWidth` (larghezza del
   * contenitore padre) si misurano una volta sola all'inizio, non ad ogni `pointermove`:
   * un `getBoundingClientRect()` per pixel forzerebbe un reflow sincrono ad ogni evento.
   * `lastPercent` è ciò che verrà committato al rilascio.
   */
  const widthResizeRef = useRef<{
    originLeft: number;
    parentWidth: number;
    lastPercent: number;
  } | null>(null);

  /** Cancella un dispatch debounced in sospeso, se c'è (blur, deselezione, unmount). */
  function cancelDebouncedUpdate(): void {
    if (debounceTimerRef.current !== null) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
  }

  /** Rimanda un `updateBlockPropsAction` a dopo {@link EDIT_DEBOUNCE_MS}ms di inattività. */
  function scheduleDebouncedUpdate(props: Record<string, unknown>): void {
    cancelDebouncedUpdate();
    debounceTimerRef.current = setTimeout(() => {
      debounceTimerRef.current = null;
      updateBlockPropsAction(id, props);
    }, EDIT_DEBOUNCE_MS);
  }

  /**
   * Risolve il `contentEditable` di `richText` per `InlineFloatingToolbar` (punto 1 del
   * task): identità stabile fra i render (nessuna dipendenza reattiva, legge `wrapperRef`
   * solo al momento della chiamata) — evita che l'effetto di ascolto della selezione del
   * componente si stacchi e riattacchi ad ogni render di questo wrapper.
   */
  const getRichTextTarget = useCallback(
    () => wrapperRef.current?.querySelector<HTMLElement>('[contenteditable="true"]') ?? null,
    [],
  );

  /**
   * Commit immediato di `html` (`richText`): stessa funzione dietro `onHtmlChange` (blur)
   * e dietro un comando della `InlineFloatingToolbar` (Grassetto/Corsivo/Link/Allineamento/
   * Cancella formattazione) — un clic sulla barra è già un'azione discreta e deliberata,
   * come un `blur`, mai un tasto da debounced.
   */
  function commitHtml(nextHtml: string): void {
    cancelDebouncedUpdate();
    updateBlockPropsAction(id, { html: nextHtml });
  }

  /**
   * Indicatori mostrati da `InlineFormattingToolbar` (T-integrazione-toolbar): a differenza
   * di `InlineFloatingToolbar` (che legge `document.queryCommandState`, valido solo mentre il
   * `contentEditable` ha il focus) questa barra è visibile anche **prima** che il blocco
   * entri in editing (`isSelected && !isEditingText`, vedi il montaggio più sotto) — quando
   * il nodo non ha il focus `queryCommandState` non è attendibile. Lo stile calcolato del
   * `contentEditable` resta un'indicazione corretta indipendentemente dal focus: solo un
   * suggerimento UX (nessuna scrittura, nessun blocco al salvataggio), coerente con
   * "validazione client solo UX" (CLAUDE.md § dominio CMS) applicato qui allo stato mostrato
   * invece che a un errore.
   */
  const [formattingIndicators, setFormattingIndicators] = useState<{
    bold: boolean;
    italic: boolean;
    align: ToolbarAlign;
  }>({ bold: false, italic: false, align: 'left' });

  /**
   * `true` quando l'utente ha chiuso esplicitamente `InlineFormattingToolbar` per questo giro
   * di selezione (bottone "Chiudi"): resettato ad ogni cambio di nodo/uscita dalla selezione,
   * mai persistito — riaprire il blocco (nuova selezione) la rimostra sempre.
   */
  const [formattingToolbarDismissed, setFormattingToolbarDismissed] = useState(false);

  /** Rilegge grassetto/corsivo/allineamento dallo stile calcolato del `contentEditable` (vedi commento sopra). */
  function refreshFormattingIndicators(): void {
    const target = getRichTextTarget();
    if (!target) return;
    const computed = window.getComputedStyle(target);
    const weight = Number.parseInt(computed.fontWeight, 10);
    const align: ToolbarAlign =
      computed.textAlign === 'center'
        ? 'center'
        : computed.textAlign === 'right' || computed.textAlign === 'end'
          ? 'right'
          : computed.textAlign === 'justify'
            ? 'justify'
            : 'left';
    setFormattingIndicators({
      bold: !Number.isNaN(weight) ? weight >= 600 : computed.fontWeight === 'bold',
      italic: computed.fontStyle === 'italic',
      align,
    });
  }

  /**
   * Applica un comando a **tutto** il contenuto del blocco (non a una selezione parziale,
   * che qui non esiste — la barra è visibile prima dell'editing): seleziona l'intero
   * `contentEditable`, esegue il comando, e affida l'HTML risultante a `commitHtml` — lo
   * stesso canale di commit di ogni altro comando di formattazione di questo file (undo/redo
   * incluso). `execCommand`: stessa scelta tecnica di `InlineFloatingToolbar.tsx` (vedi il
   * suo commento di testa), non un secondo motore di rich text.
   */
  function applyFormattingCommand(command: string, value?: string): void {
    const target = getRichTextTarget();
    if (!target) return;
    target.focus();
    const selection = window.getSelection();
    if (selection) {
      selection.removeAllRanges();
      const range = document.createRange();
      range.selectNodeContents(target);
      selection.addRange(range);
    }
    document.execCommand(command, false, value);
    commitHtml(target.innerHTML);
    refreshFormattingIndicators();
  }

  /**
   * Grassetto/Corsivo: comando diretto su tutto il blocco. "Link" non ha qui un modo di
   * raccogliere l'URL (questa barra non ha un campo di testo, a differenza del popover di
   * `InlineFloatingToolbar`): si avvisa l'utente di passare dall'editing in-place, dove la
   * barra ancorata alla selezione offre il campo dedicato — nessun secondo modo di inserire
   * un link inventato qui.
   */
  function handleToggleFormat(format: ToolbarFormat): void {
    if (format === 'bold') {
      applyFormattingCommand('bold');
      return;
    }
    if (format === 'italic') {
      applyFormattingCommand('italic');
      return;
    }
    notifications.show({
      color: 'blue',
      message: 'Seleziona del testo nel blocco per inserire un link.',
    });
  }

  /** Allineamento: stesso comando `justify*` di `InlineFloatingToolbar.tsx`, applicato a tutto il blocco. */
  function handleAlignChange(align: ToolbarAlign): void {
    const command =
      align === 'center'
        ? 'justifyCenter'
        : align === 'right'
          ? 'justifyRight'
          : align === 'justify'
            ? 'justifyFull'
            : 'justifyLeft';
    applyFormattingCommand(command);
  }

  /**
   * Cambio rapido di `heading.level` (gap #4): un click discreto, non una digitazione —
   * `updateBlockPropsAction` diretto, mai {@link scheduleDebouncedUpdate}, stesso canale già
   * usato dalla voce equivalente del menu "Cambia livello del titolo" nella toolbar
   * integrata più sotto (`HEADING_LEVELS.map`), qui solo raggiungibile un passaggio prima
   * (barra ancorata visibile appena il nodo è selezionato, senza aprire un menu).
   */
  function handleHeadingLevelChange(level: HeadingLevel): void {
    updateBlockPropsAction(id, { level });
  }

  /**
   * `true` solo su un `richText` selezionato ma non ancora in editing (`isEditingText`,
   * definito più sotto — click dentro il `contentEditable`): appena l'editing comincia, la
   * barra ancorata alla selezione viva (`InlineFloatingToolbar`, montata più in basso) prende
   * il suo posto — mai le due insieme sullo stesso nodo (vedi commento di testa di
   * `InlineFormattingToolbar.tsx`).
   */
  const showRichTextFormattingToolbar = Boolean(
    isSelected && !isEditingText && node?.type === 'richText' && !formattingToolbarDismissed,
  );

  /**
   * Controllo rapido del livello titolo (gap #4): stesso momento di
   * {@link showRichTextFormattingToolbar}, ma su `heading` — mutuamente esclusivi per
   * costruzione (`node.type` non può essere contemporaneamente `'richText'` e `'heading'`),
   * condividono lo stesso stato di chiusura esplicita (`formattingToolbarDismissed`) perché
   * rappresentano lo stesso "giro di selezione" del punto di vista dell'utente.
   */
  const showHeadingLevelToolbar = Boolean(
    isSelected && !isEditingText && node?.type === 'heading' && !formattingToolbarDismissed,
  );

  // Nuova selezione (o nuovo nodo): la chiusura esplicita di un giro precedente non deve
  // restare appiccicata a un blocco diverso, né sopravvivere a una deselezione/riselezione
  // dello stesso.
  useEffect(() => {
    if (isSelected) setFormattingToolbarDismissed(false);
  }, [id, isSelected]);

  // Indicatori aggiornati non appena la barra compare (selezione) o rientra da un editing
  // appena concluso (blur) — mai mentre resta nascosta, per non leggere lo stile calcolato
  // di un nodo che potrebbe non esistere più. Solo `richText`: la modalità `heading` non ha
  // indicatori di stile calcolato, solo il livello già letto direttamente dalle props.
  useEffect(() => {
    if (showRichTextFormattingToolbar) refreshFormattingIndicators();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refreshFormattingIndicators legge wrapperRef via getRichTextTarget, identità stabile (useCallback senza dipendenze reattive)
  }, [showRichTextFormattingToolbar]);

  // Il timer in sospeso non deve mai sparare contro un nodo deselezionato o smontato: sia
  // il cambio di `id` sia il flip di `isSelected` (l'`editing` passato a `BlockRenderer`
  // diventa `undefined`) rieseguono questo effetto, la cui funzione di cleanup cancella il
  // timer del giro precedente — lo stesso percorso copre anche lo smontaggio.
  useEffect(() => {
    return () => cancelDebouncedUpdate();
  }, [id, isSelected]);

  /**
   * Drag & drop (dnd-kit, T7). Lo stato del trascinamento in corso non entra mai nello
   * store Zustand: `active`/`isOver` vivono nel `DndContext` di `EditorCanvas.tsx`, letti
   * qui solo per decidere cosa disegnare durante l'hover.
   */
  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    isDragging,
  } = useDraggable({
    id,
    data: { type: node?.type },
    // Il trascinamento generale del nodo cede sempre il passo a un gesto più specifico già
    // in corso sullo stesso puntatore: editing di testo (punto 2 di T9) o ridimensionamento
    // della maniglia (E03, punto 2).
    disabled: isEditingText || isResizingWidth,
  });
  const { setNodeRef: setDropBeforeRef, isOver: isOverBefore } = useDroppable({
    id: `before:${id}`,
    data: { parentId: location?.parentId ?? null, index: location?.index ?? 0 },
  });
  const { setNodeRef: setDropAfterRef, isOver: isOverAfter } = useDroppable({
    id: `after:${id}`,
    data: { parentId: location?.parentId ?? null, index: (location?.index ?? 0) + 1 },
  });
  const { setNodeRef: setDropInsideRef, isOver: isOverInside } = useDroppable({
    id: `inside:${id}`,
    data: { parentId: id, index: childIds.length },
  });
  const { active } = useDndContext();
  const activeDragId = active ? String(active.id) : null;
  const activeDragType = active
    ? (active.data.current as { type?: string } | undefined)?.type
    : undefined;

  /**
   * Ampiezza che questo nodo sta assumendo mentre la sua maniglia è sotto trascinamento
   * (E03, punto 3), `null` a riposo o se il gesto riguarda un altro container. Sottoscrive
   * solo il proprio id: il ridimensionamento di un fratello non ri-renderizza questo
   * wrapper. Chiamato qui, sopra la guardia di uscita, perché è un hook.
   */
  const resizePreviewPercent = useContainerResizePercent(id);

  // Il nodo può sparire dall'albero fra un render e l'altro (eliminato da questa stessa
  // toolbar): non è un errore, semplicemente non c'è più nulla da renderizzare.
  if (!node || !location) return null;
  // Alias non-`undefined` per le funzioni dichiarate più sotto: la guardia sopra restringe
  // `node` solo nello scope sincrono di questo render, non dentro le closure delle funzioni
  // annidate (`handleCopyStyle` ecc.) — TypeScript non propaga il narrowing oltre un confine
  // di funzione.
  const currentNode = node;

  const descriptor = BLOCK_TYPES.find((entry) => entry.type === node.type);
  const label = descriptor?.meta?.label ?? node.type;
  const ContainerComponent = CONTAINER_COMPONENTS[node.type];
  // `childrenAllow === '*'` (sentinel di ADR-39 § 4, `container`): esplicito, non più la
  // coincidenza `'*'.length === 1 > 0` — un contenitore con qualunque tipo ammesso è
  // comunque un contenitore, indipendentemente da come il registro esprime l'ammissione.
  const isContainer =
    descriptor?.childrenAllow === '*' || (descriptor?.childrenAllow.length ?? 0) > 0;
  /**
   * Icona del tipo di blocco per il badge nome mostrato su hover (`.hoverBadge`, restyle
   * Elementor Pro, punto 4 del task). `createElement`, non un tag JSX `<Icon />`
   * assegnato a una variabile locale: `blockIcon` restituisce sempre lo stesso
   * riferimento stabile di `ICON_MAP` (mai una funzione creata a questo render), ma per
   * l'analisi statica di React Compiler (`react-hooks/static-components`) un tag JSX con
   * nome dinamico è indistinguibile da un componente creato a ogni render — stesso
   * idioma già in uso in `WidgetPalette.tsx`.
   */
  const badgeIconElement = createElement(blockIcon(descriptor?.meta?.icon), {
    size: 12,
    'aria-hidden': true,
  });

  /**
   * Variante Elementor, solo su `section` (T-layout-colonne-section): bordo d'accento
   * magenta al posto del bordo blu generico di hover/selezione — il resto della chrome
   * (badge, toolbar, drop-zone) resta identico per ogni tipo di blocco, questa Section
   * ha in più solo la linguetta d'azione sostitutiva più sotto.
   */
  const isSection = node.type === 'section';

  /**
   * Resizer inter-colonna (punto 1 del task): solo su `section` con esattamente due figli
   * e il valore effettivo di `columns` per il viewport attivo (`activeViewport`, Device
   * Switcher) che risolve a `'2'` — `columnRatio` non è responsive (`section.block.ts`),
   * "significativa solo con 2 colonne" (registro, `meta.help`). Mai su `Section.tsx`
   * (ADR-22 § 5, SSR pubblica condivide quel componente): la maniglia vive solo qui.
   */
  const showColumnResizer =
    isSection &&
    childIds.length === 2 &&
    resolveEffectiveResponsiveValue(currentNode.props.columns, activeViewport) === '2';
  const currentColumnRatio: ColumnRatioValue = COLUMN_RATIO_VALUES.includes(
    currentNode.props.columnRatio as ColumnRatioValue,
  )
    ? (currentNode.props.columnRatio as ColumnRatioValue)
    : 'equal';

  /** Livello corrente del titolo per il controllo rapido H2-H6 (gap #4): stesso fallback `'h2'` già usato dal menu "Cambia livello del titolo" della toolbar integrata. */
  const currentHeadingLevel: HeadingLevel = HEADING_LEVELS.includes(
    currentNode.props.level as HeadingLevel,
  )
    ? (currentNode.props.level as HeadingLevel)
    : 'h2';

  /**
   * Numero di colonne effettivo per il viewport attivo, per il segnaposto dello stato
   * vuoto sotto (bug collasso colonne): una `section` a più colonne senza figli renderizzava
   * un solo `.emptyContainer` come unico grid item di `.section` (ADR-31 § 7) — la griglia
   * CSS lo piazza nella prima traccia e le tracce successive restano vuote e invisibili,
   * indistinguibile da una sezione a colonna singola. Stesso fallback di `Section.tsx`/
   * `style-tokens.module.css`: nessun valore risolto → 1 colonna implicita.
   */
  const effectiveColumnsCount = (() => {
    const parsed = Number(
      resolveEffectiveResponsiveValue(currentNode.props.columns, activeViewport),
    );
    return Number.isInteger(parsed) && parsed >= 1 && parsed <= 4 ? parsed : 1;
  })();

  /** Enum più vicino fra i tre stop di `columnRatio` in base alla frazione [0,1] corrente. */
  function resolveColumnRatioFromFraction(fraction: number): ColumnRatioValue {
    if (fraction < 0.4) return '33-66';
    if (fraction > 0.6) return '66-33';
    return 'equal';
  }

  /**
   * Avvia il drag: il contenitore di riferimento per il calcolo della frazione è il DOM
   * vero della `<section>` — non un ref dedicato (Section.tsx non forwarda ref, e non va
   * toccato per questo task): `.childrenArea` (`display: contents`, sotto) è il genitore
   * DOM diretto della maniglia, e la `<section>` è il genitore di `.childrenArea`.
   */
  function handleColumnResizerPointerDown(event: ReactPointerEvent<HTMLDivElement>): void {
    event.stopPropagation();
    const handle = event.currentTarget;
    const containerEl = handle.parentElement?.parentElement;
    if (!containerEl) return;
    handle.setPointerCapture(event.pointerId);
    columnResizeRef.current = { containerEl, lastValue: currentColumnRatio };
  }

  /**
   * Soglia minima 10% (task): già naturalmente rispettata, i tre stop disponibili (50/50,
   * 33/66, 66/33) sono tutti a distanza ≥10% dai bordi — nessun clamp aggiuntivo necessario
   * oltre al `Math.min`/`Math.max` che tiene la frazione dentro [0,1].
   */
  function handleColumnResizerPointerMove(event: ReactPointerEvent<HTMLDivElement>): void {
    const drag = columnResizeRef.current;
    if (!drag) return;
    const rect = drag.containerEl.getBoundingClientRect();
    if (rect.width === 0) return;
    const fraction = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    const nextValue = resolveColumnRatioFromFraction(fraction);
    if (nextValue !== drag.lastValue) {
      drag.lastValue = nextValue;
      updateBlockPropsAction(id, { columnRatio: nextValue });
    }
  }

  /** Fine drag (`pointerup`/`pointercancel`): rilascia la cattura, azzera lo stato. */
  function handleColumnResizerPointerEnd(event: ReactPointerEvent<HTMLDivElement>): void {
    const handle = event.currentTarget;
    if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
    columnResizeRef.current = null;
  }

  /**
   * Visibilità per breakpoint (ADR-37 § 3) nel Canvas: il nodo è "nascosto sul
   * dispositivo attivo" quando la prop scalare corrispondente al `Device Switcher`
   * corrente (`activeViewport`) è `true` — mai in base al reale `display:none` delle
   * media query di `style-tokens.module.css` (queste rispondono alla larghezza vera
   * della finestra del browser dell'admin, non al viewport simulato). Il blocco deve
   * restare selezionabile e modificabile anche mentre è nascosto per quel dispositivo:
   * `tokenStyles.previewHidden`, applicata sotto, sostituisce il `display:none` reale
   * ereditato dal componente di contenuto con la sola attenuazione visiva.
   */
  const isHiddenForActiveViewport = currentNode.props[VIEWPORT_HIDE_PROP[activeViewport]] === true;

  /**
   * `colSpan` (ADR-51, `form-field`/`form-submit`): dentro `.fields` di
   * `FormBlock.module.css` (griglia a 12 colonne) il grid item reale nel Canvas è
   * **questo** `.wrapper`, non la radice di `FormFieldBlock.tsx` (`grid-column` da
   * `colSpan`) né quella di `FormSubmitBlock.tsx` (`grid-column: 1 / -1` fisso) — un
   * livello più a fondo per via della chrome dell'editor, quindi il `grid-column` che quei
   * componenti calcolano sulla propria radice non ha alcun effetto sul posizionamento nella
   * griglia del genitore, e il nodo resta relegato a un'unica traccia stretta invece di
   * estendersi alla larghezza prevista. Sul sito pubblico (`BlockRenderer.tsx`, nessun
   * wrapper interposto) quel div è già il grid item diretto, dove la classe fa già effetto:
   * stessa risoluzione (stesso fallback a `span 12` per `form-field`, `span 12` — equivalente
   * a `1 / -1` su una griglia di 12 colonne — per `form-submit`, che non dichiara `colSpan`),
   * applicata qui in più perché qui serve a un elemento diverso, non in sostituzione.
   */
  const formFieldColSpanClassName =
    currentNode.type === 'form-field'
      ? resolveResponsiveClassNames(tokenStyles, 'colSpan', currentNode.props.colSpan) ||
        tokenStyles.colSpan_default_12
      : currentNode.type === 'form-submit'
        ? tokenStyles.colSpan_default_12
        : '';

  /**
   * Solo `container` (ADR-39) ha una prop di larghezza dichiarata dal registro
   * ({@link CONTAINER_WIDTH_SPEC}): questo booleano resta ristretto al tipo esatto, a
   * differenza di `isContainer` sopra (che include anche `section` e ogni futuro tipo
   * contenitore) — governa **solo** {@link showContainerResizeHandle} più sotto, mai la
   * colorazione hover/selezione (vedi `className`/Handle Bar, che usano `isContainer`).
   */
  const isContainerBlockType = node.type === 'container';

  /**
   * Maniglia di ridimensionamento orizzontale (E03, punto 1): solo su un `container`
   * **selezionato** — mai su hover, mai su `section` (che ha già il proprio resizer
   * inter-colonna più sotto), mai se il registro non dichiara la prop di larghezza
   * ({@link CONTAINER_WIDTH_SPEC}).
   */
  const showContainerResizeHandle =
    isContainerBlockType && isSelected && CONTAINER_WIDTH_SPEC !== null;

  /** Percentuale già persistita sul nodo, `null` se la prop è assente o di altra forma. */
  const persistedWidthPercent = readContainerWidthPercent(currentNode.props[CONTAINER_WIDTH_PROP]);

  /**
   * Ampiezza da disegnare: l'anteprima del trascinamento vince sul valore persistito
   * finché il gesto dura, poi torna a essere quella persistita — che nel frattempo il
   * commit ha reso uguale, quindi nessuno sfarfallio al rilascio.
   */
  const effectiveWidthPercent = resizePreviewPercent ?? persistedWidthPercent;

  /**
   * Larghezza applicata al wrapper del nodo. Inline e non una classe: è una percentuale
   * continua, non esprimibile come classe statica (stesso idioma del `left` della maniglia
   * inter-colonna). `flexGrow: 0`/`flexShrink: 0` sono necessari quanto la larghezza: dentro
   * un `container` flex il valore di default `flex-shrink: 1` rimpicciolirebbe comunque il
   * nodo appena la riga si riempie, e la larghezza appena scelta non sarebbe quella resa.
   */
  const widthStyle =
    effectiveWidthPercent === null
      ? undefined
      : { width: `${effectiveWidthPercent}%`, flexGrow: 0, flexShrink: 0 };

  /**
   * Avvio del gesto: si misurano **una volta sola** il bordo sinistro del nodo e la
   * larghezza del contenitore padre, e si cattura il puntatore sulla maniglia — da qui in
   * poi ogni `pointermove`/`pointerup` arriva alla maniglia anche se il puntatore esce dal
   * suo box di 10px, che a un trascinamento veloce succede sempre.
   *
   * Il padre di riferimento non è il genitore DOM diretto del wrapper (`.childrenArea` è
   * `display: contents`, un elemento senza box): {@link resolveLayoutParentWidth} risale
   * fino al primo antenato con una larghezza reale.
   */
  function handleWidthResizePointerDown(event: ReactPointerEvent<HTMLDivElement>): void {
    event.stopPropagation();
    if (!CONTAINER_WIDTH_SPEC) return;
    const wrapperEl = wrapperRef.current;
    const parentWidth = resolveLayoutParentWidth(wrapperEl);
    if (!wrapperEl || parentWidth === null) return;

    const originLeft = wrapperEl.getBoundingClientRect().left;
    // Punto di partenza del badge: la larghezza che il nodo ha davvero adesso, non il solo
    // valore persistito — un container senza prop di larghezza mostra comunque subito la
    // propria ampiezza corrente invece di un badge vuoto.
    const startPercent =
      containerWidthPercentFromPointer(
        originLeft + wrapperEl.getBoundingClientRect().width,
        originLeft,
        parentWidth,
        CONTAINER_WIDTH_SPEC,
      ) ?? CONTAINER_WIDTH_SPEC.max;

    event.currentTarget.setPointerCapture(event.pointerId);
    widthResizeRef.current = { originLeft, parentWidth, lastPercent: startPercent };
    setIsResizingWidth(true);
    setContainerResizePreview(id, startPercent);
  }

  /** Trascinamento: solo anteprima visiva, mai una voce di history (E03, punto 3). */
  function handleWidthResizePointerMove(event: ReactPointerEvent<HTMLDivElement>): void {
    const drag = widthResizeRef.current;
    if (!drag || !CONTAINER_WIDTH_SPEC) return;
    const percent = containerWidthPercentFromPointer(
      event.clientX,
      drag.originLeft,
      drag.parentWidth,
      CONTAINER_WIDTH_SPEC,
    );
    if (percent === null) return;
    drag.lastPercent = percent;
    setContainerResizePreview(id, percent);
  }

  /**
   * Rilascio: **un solo** punto di undo/redo per l'intero trascinamento
   * (`commitContainerWidthAction`), che azzera anche l'anteprima.
   */
  function handleWidthResizePointerUp(event: ReactPointerEvent<HTMLDivElement>): void {
    const handle = event.currentTarget;
    if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
    const drag = widthResizeRef.current;
    widthResizeRef.current = null;
    setIsResizingWidth(false);
    if (!drag) return;
    commitContainerWidthAction(id, drag.lastPercent);
  }

  /**
   * Gesto interrotto dal sistema (`pointercancel`: puntatore perso, gesto rubato dal
   * browser): l'anteprima si butta via **senza** committare — un trascinamento che non è
   * mai stato concluso non è una modifica che l'utente ha chiesto.
   */
  function handleWidthResizePointerCancel(event: ReactPointerEvent<HTMLDivElement>): void {
    const handle = event.currentTarget;
    if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
    widthResizeRef.current = null;
    setIsResizingWidth(false);
    clearContainerResizePreview();
  }

  /**
   * Bordo di hover/selezione (restyle Elementor Pro, richiesta esplicita del task, punto
   * 4): un solo azzurro `#2271b1` in tutto l'editor, ma con un trattamento diverso per
   * categoria di blocco — non più lo stesso `.hovered`/`.selected` indifferenziato di
   * prima.
   * - Sezioni (`isSection`): bordo sottile pieno su hover **o** selezione (`.hovered`).
   * - Colonne (`isContainerBlockType`, il solo contenitore diverso da `section` nel
   *   registro attuale, ADR-39): bordo tratteggiato (`.columnHovered`) — la spec lo lega
   *   esplicitamente al solo hover; esteso qui anche alla selezione, altrimenti un
   *   `container` selezionato ma non sotto il puntatore resterebbe privo di qualunque
   *   segnale visivo (deviazione dichiarata in consegna).
   * - Widget singoli (foglie): bordo pieno solo su selezione (`.selected`), mai su hover
   *   — lettura letterale della spec ("bordo continuo azzurro ... su selezione").
   */
  // L'hover del navigator (riga sorvolata nel pannello Struttura/Navigator) conta come
  // hover del canvas per la sola evidenziazione del bordo — stesso principio dell'hover
  // locale del puntatore, mai una terza variante di colore.
  const isHoveredEffective = isHovered || isHoveredFromNavigator;
  const overlayBorderClassName = isContainerBlockType
    ? isHoveredEffective || isSelected
      ? styles.columnHovered
      : ''
    : isSection
      ? isHoveredEffective || isSelected
        ? styles.hovered
        : ''
      : isSelected
        ? styles.selected
        : '';

  const className = [
    styles.wrapper,
    overlayBorderClassName,
    formFieldColSpanClassName,
    isInvalid ? styles.invalid : '',
    isDragging ? styles.dragging : '',
    resolveHideClassName(tokenStyles, 'hideDesktop', currentNode.props.styleHideDesktop),
    resolveHideClassName(tokenStyles, 'hideTablet', currentNode.props.styleHideTablet),
    resolveHideClassName(tokenStyles, 'hideMobile', currentNode.props.styleHideMobile),
    isHiddenForActiveViewport ? tokenStyles.previewHidden : '',
    // "Occhio" del navigator (stato UI, mai persistito): a differenza di
    // `previewHidden` sopra, che solo attenua mantenendo il nodo selezionabile,
    // qui l'intento dichiarato dall'utente è "nascondi" — `display: none` reale.
    isHiddenInCanvas ? styles.hiddenInCanvas : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <>
      <div
        ref={(element) => {
          setDragRef(element);
          wrapperRef.current = element;
        }}
        className={className}
        // Larghezza del container ridimensionato (E03): anteprima durante il gesto, valore
        // persistito a riposo, `undefined` per ogni altro blocco — mai un `style` inline
        // vuoto sui blocchi che non c'entrano.
        style={widthStyle}
        data-block-type={node.type}
        // Bersaglio dello scroll-sync del pannello Struttura/Navigator
        // (`EditorStructureNavigator.tsx`): `querySelector('[data-block-id="…"]')` dal
        // navigator porta il blocco selezionato in vista nel canvas.
        data-block-id={node.id}
        // Bersaglio di selezione da tastiera (T-canvas-cleanup): rimpiazza l'`UnstyledButton`
        // testuale rimosso dalla toolbar, che era l'unico modo di selezionare senza mouse.
        // `aria-label` porta il tipo di blocco che prima si leggeva nel badge/etichetta
        // testuale, ora solo iconici. `event.target !== currentTarget` esclude i tasti
        // premuti dentro un discendente focusabile (link del blocco Button, testo in
        // editing) dal riselezionare questo nodo — solo Invio/Spazio sul bordo del wrapper
        // stesso attivano la selezione.
        tabIndex={0}
        aria-label={label}
        onClick={(event) => {
          // Il click seleziona il nodo più interno: senza stop, la selezione risalirebbe
          // fino alla sezione che lo contiene.
          event.stopPropagation();
          selectNode(id);
        }}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return;
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            event.stopPropagation();
            selectNode(id);
          }
        }}
        onFocus={(event) => {
          // Solo un discendente in editing (mai il wrapper stesso, raggiunto da tab — vedi
          // `onKeyDown` sopra): disabilita il drag di questo nodo finché dura (punto 2 del
          // task, `useDraggable({ disabled: isEditingText })` più sopra).
          if (
            event.target !== event.currentTarget &&
            (event.target as HTMLElement).isContentEditable
          ) {
            setIsEditingText(true);
          }
        }}
        onBlur={(event) => {
          if ((event.target as HTMLElement).isContentEditable) {
            setIsEditingText(false);
          }
        }}
        onMouseOver={(event) => {
          // Stesso principio del click qui sopra: `stopPropagation` impedisce all'evento
          // (nativo, con bubbling) di risalire al wrapper del contenitore che lo ospita,
          // che altrimenti si marcherebbe "hovered" insieme a questo nodo.
          event.stopPropagation();
          setIsHovered(true);
        }}
        onMouseOut={(event) => {
          event.stopPropagation();
          setIsHovered(false);
        }}
        onMouseEnter={(event) => event.stopPropagation()}
        onMouseLeave={(event) => event.stopPropagation()}
      >
        {/*
          Zona di rilascio "prima di questo nodo": riordino/spostamento fra fratelli.
          Annidata qui dentro (non più fratello del wrapper, T-layout-colonne-section):
          vedi il commento di testa di `.dropZone` in EditorBlockWrapper.module.css.
        */}
        <div
          ref={setDropBeforeRef}
          className={`${styles.dropZone} ${styles.dropZoneBefore}`}
          {...dropZoneAttrs(isOverBefore, activeDragId, activeDragType, location.parentId)}
        />

        {/*
          Maniglia di ridimensionamento orizzontale del `container` (E03, punto 1). Vive
          qui dentro — non accanto ai figli come il resizer inter-colonna di `section` — 
          perché ridimensiona **questo** nodo rispetto al proprio contenitore padre, non
          il confine fra due figli: il riferimento è il bordo destro del wrapper, e
          `.wrapper` è già `position: relative` (EditorBlockWrapper.module.css).
        */}
        {showContainerResizeHandle && (
          <ContainerResizeHandle
            percent={effectiveWidthPercent}
            isResizing={isResizingWidth}
            ariaLabel={
              effectiveWidthPercent === null
                ? 'Ridimensiona la larghezza del Contenitore'
                : `Ridimensiona la larghezza del Contenitore (attuale: ${formatContainerWidthBadge(effectiveWidthPercent)})`
            }
            onPointerDown={handleWidthResizePointerDown}
            onPointerMove={handleWidthResizePointerMove}
            onPointerUp={handleWidthResizePointerUp}
            onPointerCancel={handleWidthResizePointerCancel}
          />
        )}

        {/*
          `InlineFormattingToolbar` (T-integrazione-toolbar): overlay ancorato al bordo
          superiore del blocco, non un pannello fisso — `position: absolute` dentro
          `.wrapper` (già `position: relative`), stesso principio geometrico dell'overlay
          unico poco sotto (`BlockHoverOverlay.tsx`), non un secondo calcolo via
          `getBoundingClientRect`:
          l'ancoraggio "al bordo superiore di *questo* elemento" è esattamente ciò che il
          layout CSS relativo/assoluto risolve da solo, senza bisogno di rimisurare il DOM
          ad ogni render (a differenza di `InlineFloatingToolbar`, che insegue una
          *selezione di testo* — un bersaglio che si sposta dentro il blocco, quello sì
          calcolato via `getBoundingClientRect`). Sopra la Handle Bar (riga distinta,
          `.formattingToolbarAnchor`), mai sullo stesso rigo: eviterebbe la sovrapposizione
          quando entrambe sono visibili (`isSelected` le mostra entrambe).
        */}
        {showRichTextFormattingToolbar && (
          <div className={styles.formattingToolbarAnchor}>
            <InlineFormattingToolbar
              mode="text"
              isBold={formattingIndicators.bold}
              isItalic={formattingIndicators.italic}
              activeAlign={formattingIndicators.align}
              onToggleFormat={handleToggleFormat}
              onAlignChange={handleAlignChange}
              onClose={() => setFormattingToolbarDismissed(true)}
              blockName={label}
            />
          </div>
        )}

        {/*
          Controllo rapido del livello titolo (gap #4, T-integrazione-toolbar): stessa
          posizione/stesso anchor CSS di `InlineFormattingToolbar` in modalità testo sopra —
          le due condizioni (`showRichTextFormattingToolbar`/`showHeadingLevelToolbar`) sono
          mutuamente esclusive per `node.type`, mai montate insieme. Non sostituisce il menu
          "Cambia livello del titolo" della toolbar integrata più sotto (visibile solo su
          hover/selezione, dietro un click aggiuntivo): questo è l'equivalente immediato,
          senza aprire un menu, dello stesso identico comando.
        */}
        {showHeadingLevelToolbar && (
          <div className={styles.formattingToolbarAnchor}>
            <InlineFormattingToolbar
              mode="heading"
              headingLevel={currentHeadingLevel}
              onLevelChange={handleHeadingLevelChange}
              onClose={() => setFormattingToolbarDismissed(true)}
              blockName={label}
            />
          </div>
        )}

        {/*
          Toolbar di selezione: montata per qualunque tipo di blocco (Sezioni, Colonne,
          widget foglia) solo quando `isSelected` (mai sul solo hover — quello mostra
          invece il badge nome subito sotto, mai i due insieme sullo stesso blocco,
          richiesta esplicita di un round successivo del task) — reversal esplicito e
          autorizzato dal proprietario del progetto delle tre varianti mutuamente esclusive
          per categoria che vivevano qui prima (Handle Tab di Sezione, badge informativo di
          Colonna, linguetta "Modifica" di foglia): cinque controlli sempre nello stesso
          posto (`BlockHoverOverlay.tsx`) — trascina (`attributes`/`listeners` dnd-kit di
          sempre), seleziona genitore (`selectNode(location.parentId)`, disabilitato su un
          nodo di radice), duplica (`duplicateNodeAction`), elimina (apre lo stesso
          `ConfirmModal` già montato più sotto, mai un secondo modal), modifica
          (`selectNode`, già imposta `activeSidebarTab: 'properties'`). "Sposta su/giù",
          "Sposta dentro/fuori dal contenitore" e il menu "Cambia livello del titolo" restano
          raggiungibili solo dal menu contestuale (tasto destro, `CanvasContextMenu.tsx`) —
          mai una seconda copia della stessa azione qui. Gli `aria-label` dei quattro
          pulsanti preesistenti riprendono il formato già cercato dagli helper Playwright
          pre-esistenti in
          `e2e/tests/helpers/page-editor.ts` prima della rimozione della vecchia toolbar
          unica.
        */}
        {isSelected && (
          <BlockHoverOverlay
            id={id}
            label={label}
            parentId={location.parentId}
            attributes={attributes}
            listeners={listeners}
            onDelete={() => setConfirmOpened(true)}
          />
        )}

        {/*
          Badge nome del blocco (qualunque tipo, non più solo Colonne): icona + nome del
          tipo nell'angolo superiore sinistro interno, nessun pulsante — mostrato solo su
          hover **senza** selezione (`isHovered && !isSelected`), lasciando il posto alla
          toolbar di selezione sopra appena il nodo viene selezionato. `pointer-events:
          none`: puramente informativo, il click-to-select del wrapper (`onClick` sul `div`
          principale) resta l'unico modo di selezionare questo nodo, invariato.
        */}
        {isHovered && !isSelected && (
          <span className={styles.hoverBadge} aria-hidden="true">
            {badgeIconElement}
            <Text size="xs" fw={500} className={styles.hoverBadgeLabel}>
              {label}
            </Text>
          </span>
        )}

        {/*
          Badge "Nascosto su [Device]" (ADR-37 § 3): sempre visibile quando il nodo è
          nascosto sul dispositivo attivo del Device Switcher — non solo su hover/
          selezione come la Handle Bar sopra, altrimenti l'attenuazione applicata dal
          contenuto (`tokenStyles.previewHidden`) resterebbe senza spiegazione appena il
          puntatore si allontana. `aria-hidden`: puramente informativo, nessuna azione.
        */}
        {isHiddenForActiveViewport && (
          <span className={styles.hiddenBadge} aria-hidden="true">
            Nascosto su {VIEWPORT_LABEL[activeViewport]}
          </span>
        )}

        {isContainer && ContainerComponent ? (
          <BlockErrorBoundary>
            <ContainerComponent {...resolveContainerComponentProps(currentNode)}>
              {/*
                Evidenziazione "dentro questo contenitore" (dnd-kit T7): overlay a sé
                (`position: absolute; inset: 0`, EditorBlockWrapper.module.css), non più
                un box che avvolge i figli — un contenitore a griglia (ADR-31) deve
                mostrare i propri figli come veri grid item del genitore, non annidati
                dentro un unico wrapper che collasserebbe la griglia a una sola colonna
                (il bug che questo file corregge). Magenta su `section` (T-layout-colonne-
                section), blu generico su ogni altro contenitore futuro.
              */}
              <div
                ref={setDropInsideRef}
                className={[
                  styles.containerDropZone,
                  isSection ? styles.containerDropZoneSection : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                {...dropZoneAttrs(isOverInside, activeDragId, activeDragType, id)}
              />

              {isSection &&
                effectiveColumnsCount > 1 &&
                Array.from({ length: effectiveColumnsCount }).map((_, columnIndex) => (
                  <ColumnDropTarget
                    key={`column-drop-${columnIndex}`}
                    parentId={id}
                    columnIndex={columnIndex}
                    columnCount={effectiveColumnsCount}
                    activeDragId={activeDragId}
                    activeDragType={activeDragType}
                  />
                ))}

              {childIds.length === 0 ? (
                effectiveColumnsCount > 1 ? (
                  // Un segnaposto per traccia della griglia (`.childrenArea`, `display:
                  // contents`, stessa tecnica del ramo "figli presenti" sotto): ogni box
                  // diventa un vero grid item di `.section`, tutte le colonne configurate
                  // restano visibili e affiancate anche a zero figli.
                  <div className={styles.childrenArea}>
                    {Array.from({ length: effectiveColumnsCount }).map((_, slotIndex) => (
                      <div
                        key={slotIndex}
                        className={styles.emptyContainer}
                        // Seleziona questo contenitore come target prima di aprire il menu
                        // di inserimento (F08 STEP 3): stesso `stopPropagation` del click-
                        // to-select del wrapper più sopra, mai la selezione risale a un
                        // antenato.
                        onClick={(event) => {
                          event.stopPropagation();
                          selectNode(id);
                        }}
                      >
                        <BlockPalette
                          parentId={id}
                          parentType={node.type}
                          label="Aggiungi Blocco"
                          size="xs"
                          variant="light"
                        />
                        <Text size="xs" c="dimmed" className={styles.emptyContainerHint}>
                          Colonna vuota — trascina qui un blocco
                        </Text>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div
                    className={styles.emptyContainer}
                    onClick={(event) => {
                      event.stopPropagation();
                      selectNode(id);
                    }}
                  >
                    <BlockPalette
                      parentId={id}
                      parentType={node.type}
                      label="Aggiungi blocco"
                      size="sm"
                      variant="light"
                      iconOnly
                      triggerClassName={styles.emptyContainerTrigger}
                    />
                    <Text size="xs" c="dimmed" className={styles.emptyContainerHint}>
                      Contenitore vuoto — trascina qui un blocco
                    </Text>
                  </div>
                )
              ) : (
                // `display: contents` (EditorBlockWrapper.module.css): questo `div` non
                // genera un box proprio, i wrapper dei blocchi figli diventano grid item
                // diretti di `ContainerComponent` (`.section`) invece di finire tutti
                // dentro l'unica cella di questo `div` — la correzione del bug: prima la
                // griglia CSS del genitore vedeva un solo grid item (questo wrapper), ora
                // uno per figlio, come sul sito pubblico (`BlockRenderer.tsx`).
                <div className={styles.childrenArea}>
                  {childIds.map((childId) => (
                    <EditorBlockWrapper key={childId} id={childId} />
                  ))}
                  {/*
                    Maniglia di resize inter-colonna (punto 1 del task): `position: absolute`
                    (EditorBlockWrapper.module.css) la esclude dal posizionamento automatico
                    della griglia CSS (stesso principio di `.containerDropZone`/`.dropZone`
                    sopra), quindi non conta come terzo grid item. `left` inline: percentuale
                    calcolata dal valore corrente di `columnRatio`, non esprimibile come
                    classe statica (stesso idioma di `.contextMenuAnchor` più sopra).
                  */}
                  {showColumnResizer && (
                    <div
                      className={styles.columnResizer}
                      style={{ left: `${COLUMN_RATIO_BOUNDARY_PERCENT[currentColumnRatio]}%` }}
                      role="separator"
                      aria-orientation="vertical"
                      aria-label={`Ridimensiona le colonne della Section (attuale: ${currentColumnRatio})`}
                      onClick={(event) => event.stopPropagation()}
                      onPointerDown={handleColumnResizerPointerDown}
                      onPointerMove={handleColumnResizerPointerMove}
                      onPointerUp={handleColumnResizerPointerEnd}
                      onPointerCancel={handleColumnResizerPointerEnd}
                    />
                  )}
                </div>
              )}
            </ContainerComponent>
          </BlockErrorBoundary>
        ) : (
          <BlockRenderer
            node={node}
            // Editing in-place (T9): solo sul nodo selezionato, mai su hover — coerente con
            // "editing del testo direttamente nel canvas quando il blocco è selezionato".
            // `onTextChange`/`onHtmlChange`/`onLabelChange` (commit su `blur`) passano sempre
            // da `updateBlockPropsAction` (mai una mutazione diretta): resta un comando
            // invertibile sull'undo stack, come ogni altra modifica di props di questo file.
            // `onTextInput`/`onHtmlInput`/`onLabelInput` (ad ogni tasto) dispatchano invece
            // con debounce (`scheduleDebouncedUpdate`, punto 1 del task) — il `blur`
            // corrispondente cancella sempre il debounce pendente prima del proprio dispatch
            // immediato, così non corrono mai in coppia contro lo stesso valore stantio. Il
            // tipo del nodo decide quale coppia è pertinente — `Heading`/`RichText`/`Button`
            // ignorano le altre due.
            editing={
              isSelected
                ? {
                    editable: true,
                    onTextChange: (nextText) => {
                      cancelDebouncedUpdate();
                      updateBlockPropsAction(id, { text: nextText });
                    },
                    onTextInput: (nextText) => scheduleDebouncedUpdate({ text: nextText }),
                    onHtmlChange: commitHtml,
                    onHtmlInput: (nextHtml) => scheduleDebouncedUpdate({ html: nextHtml }),
                    onLabelChange: (nextLabel) => {
                      cancelDebouncedUpdate();
                      updateBlockPropsAction(id, { label: nextLabel });
                    },
                    onLabelInput: (nextLabel) => scheduleDebouncedUpdate({ label: nextLabel }),
                  }
                : undefined
            }
          />
        )}

        {/*
          Barra di formattazione fluttuante (InlineFloatingToolbar.tsx): solo su `richText`
          selezionato, mai su `heading` — la sua prop `text` è `plainText` per il registro
          (SPEC-F02-blocchi.md § 3.3), Grassetto/Corsivo/Link ne cambierebbero il `kind`,
          modifica di schema fuori scope qui (CLAUDE.md § Ask first). `targetRef` trova il
          `contentEditable` dentro questo stesso wrapper via `querySelector` — nessun ref
          forwardato da `RichText.tsx`, che così non acquisisce dipendenze di editor.
        */}
        {isSelected && node.type === 'richText' && (
          <InlineFloatingToolbar getTarget={getRichTextTarget} onApplied={commitHtml} />
        )}

        {confirmOpened && (
          <ConfirmModal
            opened
            onClose={() => setConfirmOpened(false)}
            onConfirm={() => {
              removeBlockAction(id);
              setConfirmOpened(false);
            }}
            title={`Elimina blocco "${label}"`}
            confirmLabel="Elimina"
            confirmColor="red"
            // Stesso motivo/stesso valore del `ConfirmModal` di `BlockEditorPanel.tsx` e
            // della tendina di stato in `PagePageDetail.tsx`: sopra la chrome full-screen
            // dell'editor (z-index 1000, `FullScreenEditorLayout.module.css`). Il Modal è
            // montato in portale (default Mantine), fuori dal wrapper del blocco che lo
            // apre: senza questo z-index esplicito il suo bottone "Elimina" resterebbe
            // dietro l'overlay, mai cliccabile.
            zIndex={1100}
          >
            {childIds.length > 0
              ? `Il blocco e i suoi ${childIds.length} blocchi figli vengono rimossi dalla bozza. L'eliminazione diventa definitiva al salvataggio.`
              : "Il blocco viene rimosso dalla bozza. L'eliminazione diventa definitiva al salvataggio."}
          </ConfirmModal>
        )}

        {/*
          Zona di rilascio "dopo questo nodo": chiude l'ultimo gap del suo livello.
          Stessa ragione della zona "prima" più sopra: annidata qui dentro invece che
          fratello del wrapper, per non diventare un grid item vero in una `section` a
          più colonne (T-layout-colonne-section).
        */}
        <div
          ref={setDropAfterRef}
          className={`${styles.dropZone} ${styles.dropZoneAfter}`}
          {...dropZoneAttrs(isOverAfter, activeDragId, activeDragType, location.parentId)}
        />
      </div>
    </>
  );
});

export default EditorBlockWrapper;
