/**
 * Maniglia generica di ridimensionamento per qualunque prop `kind: 'unitValue'` limitata a
 * `px`/`%` (ADR-71-resize-handles-unita-dinamiche.md § "Decisione" punti 1-2/5-6,
 * SPEC-F04-super-elementor.md § 4.2). Generalizza il gesto già esistente per
 * `container.styleFlexBasis` (`components/ContainerResizeHandle.tsx` +
 * `handleWidthResizePointerDown/Move/Up/Cancel` in `EditorBlockWrapper.tsx`, **non toccati**
 * da questo file) alle nuove props `styleWidth`/`styleHeight` (`container`/`image`) e ai
 * quattro margini per lato (`button`/`heading`/`richText`/`image`).
 *
 * A differenza di `ContainerResizeHandle.tsx` (puramente presentazionale: riceve gli handler
 * del gesto già pronti da `EditorBlockWrapper.tsx`, che possiede il gesto), questo
 * componente possiede l'intero gesto al proprio interno — il contratto delle props
 * ({@link ResizeHandleProps}) è letteralmente quello di `SPEC-F04-super-elementor.md` § 4.2
 * e non lascia spazio a handler esterni. `min`/`max`/`units` arrivano già risolti dal
 * chiamante (`EditorBlockWrapper.tsx`, via `resolveResizePropSpec` di
 * `resize-handle.utils.ts`) — questo componente non li ricalcola né li duplica (ADR-38 § 2).
 *
 * Meccanica (ADR-71 § "Decisione" punto 5): al `pointerdown` si cattura esplicitamente il
 * puntatore (`setPointerCapture`, nessun listener su `document`/`window` — stesso idioma
 * della maniglia esistente, indipendente per costruzione dal confine di un eventuale canvas
 * in iframe) e si misura una volta sola il contenitore padre lungo l'asse richiesto. Durante
 * il trascinamento si scrive solo un'anteprima nello store (fuori dalla history). Al
 * rilascio si clampa il valore finale e si committa con l'azione già esistente
 * `updateBlockPropsAction` — **nessuna azione nuova** nello store per questo meccanismo
 * (ADR-71 § "Decisione" punto 5, ultimo capoverso).
 */
import { useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { Text } from '@mantine/core';
import {
  useBlockEditorStore,
  useNodeById,
  usePropResizePreview,
} from '../../../hooks/useBlockEditorStore';
import {
  clampResizeValue,
  formatResizeBadge,
  pixelDeltaToUnitDelta,
  readUnitValue,
  resolveLayoutParentSize,
  resolveResizeDirection,
  toUnitValue,
  type ResizeHandleAxis,
  type ResizeHandlePropName,
  type ResizeHandleUnit,
} from './resize-handle.utils';
import styles from './ResizeHandle.module.css';

/** Contratto letterale di SPEC-F04-super-elementor.md § 4.2. */
export interface ResizeHandleProps {
  blockId: string;
  propName: ResizeHandlePropName;
  axis: ResizeHandleAxis;
  /** Dal `PropSpec` dichiarato nel registro, mai un valore hardcoded nel componente (§ 4.2). */
  min: number;
  max: number;
  units: readonly ['px', '%'];
}

/** Etichetta leggibile per l'`aria-label`, indicizzata sul nome della prop pilotata. */
const PROP_LABELS: Record<ResizeHandlePropName, string> = {
  styleWidth: 'larghezza',
  styleHeight: 'altezza',
  styleMarginTop: 'margine superiore',
  styleMarginBottom: 'margine inferiore',
  styleMarginLeft: 'margine sinistro',
  styleMarginRight: 'margine destro',
};

/** Famiglia di colore CSS (`--resize-handle-color`, `ResizeHandle.module.css`): dimensione vs spaziatura. */
const PROP_COLOR: Record<ResizeHandlePropName, string> = {
  styleWidth: '#0ca678',
  styleHeight: '#0ca678',
  styleMarginTop: '#f08c00',
  styleMarginBottom: '#f08c00',
  styleMarginLeft: '#f08c00',
  styleMarginRight: '#f08c00',
};

/**
 * Dati del gesto in corso, catturati per closure al `pointerdown` — mai ricostruiti da
 * `props`/dallo store durante il trascinamento (stesso principio di `widthResizeRef` in
 * `EditorBlockWrapper.tsx`): un `pointermove` non deve ripetere la misura del contenitore
 * padre né rileggere `props[propName]` a ogni evento.
 */
interface ResizeDragState {
  originCoord: number;
  parentSize: number;
  unit: ResizeHandleUnit;
  startValue: number;
  lastValue: number;
}

export default function ResizeHandle({ blockId, propName, axis, min, max, units }: ResizeHandleProps) {
  const node = useNodeById(blockId);
  const updateBlockPropsAction = useBlockEditorStore((state) => state.updateBlockPropsAction);
  const setPropResizePreview = useBlockEditorStore((state) => state.setPropResizePreview);
  const clearPropResizePreview = useBlockEditorStore((state) => state.clearPropResizePreview);
  const preview = usePropResizePreview(blockId, propName);
  const [isResizing, setIsResizing] = useState(false);
  const dragRef = useRef<ResizeDragState | null>(null);

  /**
   * Avvio del gesto: si misura **una volta sola** il contenitore padre lungo l'asse
   * richiesto e si cattura il puntatore sulla maniglia. La maniglia è montata come figlia
   * diretta di `.wrapper` del blocco (`EditorBlockWrapper.module.css`, già
   * `position: relative`, stesso contratto di `ContainerResizeHandle`): `event.currentTarget.parentElement`
   * è quindi il wrapper stesso, il cui genitore reale nel layout va risalito con
   * {@link resolveLayoutParentSize} (il genitore DOM diretto, `.childrenArea`, è
   * `display: contents` e non genera un box misurabile).
   */
  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>): void {
    event.stopPropagation();
    const handleEl = event.currentTarget;
    const wrapperEl = handleEl.parentElement;
    if (!wrapperEl) return;
    const parentSize = resolveLayoutParentSize(wrapperEl, axis);
    if (parentSize === null) return;

    // Valore/unità di partenza: quello già persistito se in un'unità che questa maniglia
    // pilota, altrimenti il minimo dichiarato nella prima unità ammessa (es. un valore
    // salvato in precedenza in `vw` non viene interpretato/convertito a occhio — ADR-71 §
    // "Decisione" punto 2, ultima frase — il trascinamento riparte da un valore noto).
    const persisted = readUnitValue(node?.props[propName], units);
    const unit = persisted?.unit ?? units[0];
    const startValue = persisted?.value ?? min;

    handleEl.setPointerCapture(event.pointerId);
    dragRef.current = {
      originCoord: axis === 'horizontal' ? event.clientX : event.clientY,
      parentSize,
      unit,
      startValue,
      lastValue: startValue,
    };
    setIsResizing(true);
    setPropResizePreview(blockId, propName, startValue, unit);
  }

  /** Trascinamento: solo anteprima visiva, mai una voce di history (ADR-71 § "Decisione" punto 5). */
  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>): void {
    const drag = dragRef.current;
    if (!drag) return;
    const currentCoord = axis === 'horizontal' ? event.clientX : event.clientY;
    const deltaPx = (currentCoord - drag.originCoord) * resolveResizeDirection(propName);
    const deltaUnit = pixelDeltaToUnitDelta(deltaPx, drag.unit, drag.parentSize);
    const nextValue = clampResizeValue(drag.startValue + deltaUnit, { min, max });
    if (nextValue === drag.lastValue) return;
    drag.lastValue = nextValue;
    setPropResizePreview(blockId, propName, nextValue, drag.unit);
  }

  /**
   * Rilascio: clamping finale (già garantito ad ogni `pointermove`, qui riapplicato per
   * chiusura di principio — mai un valore fuori `[min, max]` verso
   * `updateBlockPropsAction`) e **un solo** commit tramite l'azione già esistente
   * (nessuna azione di commit dedicata a differenza di `commitContainerWidthAction`/
   * `commitColumnRatioAction`, ADR-71 § "Decisione" punto 5, ultimo capoverso).
   */
  function handlePointerUp(event: ReactPointerEvent<HTMLDivElement>): void {
    const handleEl = event.currentTarget;
    if (handleEl.hasPointerCapture(event.pointerId)) handleEl.releasePointerCapture(event.pointerId);
    const drag = dragRef.current;
    dragRef.current = null;
    setIsResizing(false);
    clearPropResizePreview();
    if (!drag) return;
    const finalValue = clampResizeValue(drag.lastValue, { min, max });
    updateBlockPropsAction(blockId, { [propName]: toUnitValue(finalValue, drag.unit) });
  }

  /**
   * Gesto interrotto dal sistema (`pointercancel`): l'anteprima si butta via **senza**
   * committare — un trascinamento mai concluso non è una modifica che l'utente ha chiesto
   * (stesso principio di `handleWidthResizePointerCancel`).
   */
  function handlePointerCancel(event: ReactPointerEvent<HTMLDivElement>): void {
    const handleEl = event.currentTarget;
    if (handleEl.hasPointerCapture(event.pointerId)) handleEl.releasePointerCapture(event.pointerId);
    dragRef.current = null;
    setIsResizing(false);
    clearPropResizePreview();
  }

  const axisClassName = axis === 'horizontal' ? styles.axisHorizontal : styles.axisVertical;
  const handleClassName = [styles.handle, axisClassName, isResizing ? styles.handleActive : '']
    .filter(Boolean)
    .join(' ');
  const colorStyle = { '--resize-handle-color': PROP_COLOR[propName] } as CSSProperties;
  const label = PROP_LABELS[propName];
  const ariaLabel =
    preview === null
      ? `Ridimensiona ${label}`
      : `Ridimensiona ${label} (attuale: ${formatResizeBadge(preview.value, preview.unit)})`;

  return (
    <div
      className={handleClassName}
      style={colorStyle}
      data-testid={`resize-handle-${propName}`}
      data-prop={propName}
      // `separator` con orientamento coerente con l'asse — stesso ruolo ARIA della maniglia
      // esistente di `container.styleFlexBasis`.
      role="separator"
      aria-orientation={axis === 'horizontal' ? 'vertical' : 'horizontal'}
      aria-label={ariaLabel}
      // Il click sulla maniglia non deve risalire al wrapper del blocco (che
      // riselezionerebbe il nodo) né al contenitore che lo ospita.
      onClick={(event) => event.stopPropagation()}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
    >
      <span className={styles.grip} aria-hidden="true" />
      {isResizing && preview !== null && (
        <Text size="xs" fw={600} className={styles.badge} data-testid={`resize-handle-badge-${propName}`}>
          {formatResizeBadge(preview.value, preview.unit)}
        </Text>
      )}
    </div>
  );
}
