/**
 * Shell orchestratrice della chrome dell'editor attorno a un singolo nodo dell'albero
 * (PLAN-F04 T4; "Wave 1 — Block Chrome & Interactivity"). Compone soltanto contenuto
 * (`BlockRenderer`/`BlockContainerBody`, gli stessi componenti F02 del sito pubblico), hook
 * (`useBlockNodeState`, `useBlockDrag`, `useBlockResize`, `useBlockTextEditing`, …) e chrome
 * (`BlockSelectionChrome`, `BlockHoverToolbar`, `BlockBadges`, `BlockResizeHandles`,
 * `BlockModals`). Ogni azione strutturale passa dallo store, che la verifica contro il registro.
 *
 * **Chrome fuori dal flusso (ADR-92).** Cornice, badge e toolbar sono `position: absolute`
 * (`pointer-events: none` per la cornice): non alterano il box model del contenuto.
 * `#2271b1` Sezioni/Container, `#a435c0` Widget foglia.
 */
import { memo, useContext, useRef, type CSSProperties } from 'react';
import {
  useActiveViewport,
  useBlockEditorStore,
  useIsHiddenInCanvas,
  useIsHoveredFromNavigator,
} from '../../../hooks/useBlockEditorStore';
import BlockRenderer from '../../../components/blocks/BlockRenderer';
import {
  InvalidBlockContext,
  InvalidBlockProvider,
  VIEWPORT_HIDE_PROP,
  VIEWPORT_LABEL,
  resolveBlockLevelColor,
} from './blocks/block-wrapper.constants';
import BlockChromeLayer from './blocks/BlockChromeLayer';
import BlockContainerBody from './blocks/BlockContainerBody';
import BlockModals from './blocks/BlockModals';
import { CONTAINER_COMPONENTS } from './blocks/container-components';
import { resolveBlockKind } from './blocks/resolve-block-kind';
import { resolveWrapperClassName } from './blocks/resolve-wrapper-class';
import BlockDropZone from './blocks/BlockDropZone';
import { useBlockDrag } from './blocks/useBlockDrag';
import { useBlockModalState } from './blocks/useBlockModalState';
import { useBlockNodeState } from './blocks/useBlockNodeState';
import { useBlockResize } from './blocks/useBlockResize';
import { useBlockTextEditing } from './blocks/useBlockTextEditing';
import { useBlockWrapperEvents } from './blocks/useBlockWrapperEvents';
import { useModalTriggerPanel } from './blocks/useModalTriggerPanel';
import { useOverlayAnchorInside } from './blocks/useOverlayAnchorInside';

// Retro-compatibilità: `BlockEditorPanel`, `PageGlobalSectionBuilder` e `PageSiteTemplateBuilder`
// importano il provider da questo modulo.
export { InvalidBlockProvider };

interface EditorBlockWrapperProps {
  id: string;
}

const EditorBlockWrapper = memo(function EditorBlockWrapper({
  id,
}: EditorBlockWrapperProps): JSX.Element | null {
  const { node, location, childIds, parentCompositeProps } = useBlockNodeState(id);
  const isSelected = useBlockEditorStore((state) => state.selectedId === id);
  const isInvalid = useContext(InvalidBlockContext) === id;
  const activeViewport = useActiveViewport();
  const selectNode = useBlockEditorStore((state) => state.selectNode);
  /** Il nodo selezionato è un figlio diretto di questo: contorno gerarchico tratteggiato. */
  const isParentOfSelected = useBlockEditorStore(
    (state) => state.selectedId !== null && childIds.includes(state.selectedId),
  );
  /** "Occhio" del Navigator: nascosto solo nel canvas, mai persistito. */
  const isHiddenInCanvas = useIsHiddenInCanvas(id);
  /** Riga sotto il puntatore nel Navigator: stesso trattamento visivo dell'hover nel canvas. */
  const isHoveredFromNavigator = useIsHoveredFromNavigator(id);

  const modals = useBlockModalState();
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  const modalTrigger = useModalTriggerPanel(node);
  const textEditing = useBlockTextEditing(id, isSelected);
  const { isHovered, eventProps } = useBlockWrapperEvents({
    id,
    onAnchorClick: modalTrigger.onAnchorClick,
    onFocus: textEditing.onFocus,
    onBlur: textEditing.onBlur,
  });
  const resize = useBlockResize({
    id,
    node,
    wrapperRef,
    isSelected,
    activeViewport,
    childCount: childIds.length,
  });
  const drag = useBlockDrag({
    id,
    type: node?.type,
    parentId: location?.parentId,
    index: location?.index,
    childCount: childIds.length,
    disabled: textEditing.isEditingText || resize.isResizing,
  });
  const overlayAnchoredInside = useOverlayAnchorInside(wrapperRef, isSelected);

  // Il nodo può sparire dall'albero fra un render e l'altro: non c'è più nulla da renderizzare.
  if (!node || !location) return null;

  const {
    iconName,
    label,
    isContainer,
    isSection,
    isContainerBlockType,
    isContainerOrSection,
    isGlobalRef,
    isTopLevelContainerOrSection,
    isTopLevelSection,
  } = resolveBlockKind(node, location.parentId);

  /** Visibilità per breakpoint (ADR-37 § 3): il nodo resta selezionabile, solo attenuato. */
  const isHiddenForActiveViewport = node.props[VIEWPORT_HIDE_PROP[activeViewport]] === true;
  // Cornice (ADR-92): selezione > hover; mai su `globalRef` (ha il proprio bordo permanente).
  const chromeState = isGlobalRef
    ? null
    : isSelected
      ? 'selected'
      : isHovered || isHoveredFromNavigator
        ? 'hover'
        : null;

  const className = resolveWrapperClassName(node, {
    isGlobalRef,
    isInvalid,
    isDragging: drag.isDragging,
    isHiddenForActiveViewport,
    isHiddenInCanvas,
  });

  return (
    <div
      ref={(element) => {
        drag.setDragRef(element);
        wrapperRef.current = element;
      }}
      className={className}
      style={
        {
          ...resize.widthStyle,
          '--block-level-color': resolveBlockLevelColor(
            isGlobalRef,
            isTopLevelSection,
            isContainerOrSection,
          ),
        } as CSSProperties
      }
      data-block-type={node.type}
      // Posizionamento nella griglia di pagina (ADR-98, `.blockStack` in `EditorCanvas.module.css`):
      // solo i contenitori radice `full`/`full-width` occupano tutte le tracce.
      data-content-width={
        (node.type === 'container' || node.type === 'section') &&
        (node.props.contentWidth === 'full' || node.props.contentWidth === 'full-width')
          ? 'full'
          : undefined
      }
      // Bersaglio dello scroll-sync del Navigator (`querySelector('[data-block-id="…"]')`).
      data-block-id={node.id}
      data-modal-open={modalTrigger.isOpen ? 'true' : undefined}
      data-parent-of-selected={isParentOfSelected ? 'true' : undefined}
      aria-label={label}
      {...eventProps}
    >
      <BlockDropZone
        position="before"
        registerRef={drag.setDropBeforeRef}
        isOver={drag.isOverBefore}
        activeDragId={drag.activeDragId}
        activeDragType={drag.activeDragType}
        parentId={location.parentId}
      />

      <BlockChromeLayer
        node={node}
        location={location}
        label={label}
        iconName={iconName}
        chromeState={chromeState}
        isHovered={isHovered}
        isSelected={isSelected}
        isGlobalRef={isGlobalRef}
        isSection={isSection}
        isContainer={isContainer}
        isContainerBlockType={isContainerBlockType}
        isContainerOrSection={isContainerOrSection}
        tone={isSection ? 'section' : isContainer ? 'container' : 'widget'}
        isTopLevelContainerOrSection={isTopLevelContainerOrSection}
        hiddenOnViewportLabel={isHiddenForActiveViewport ? VIEWPORT_LABEL[activeViewport] : null}
        anchorInside={overlayAnchoredInside}
        dragHandle={drag}
        onSelect={() => selectNode(id)}
        onDelete={modals.openConfirm}
        onSaveAsPreset={modals.openPreset}
        onConvertToGlobalSection={modals.openConvert}
      />

      {isContainer && CONTAINER_COMPONENTS[node.type] ? (
        <BlockContainerBody
          node={node}
          location={location}
          parentCompositeProps={parentCompositeProps}
          childIds={childIds}
          isSection={isSection}
          columnsCount={resize.effectiveColumnsCount}
          showColumnResizer={resize.showColumnResizer}
          columnRatio={resize.effectiveColumnRatio}
          isResizingColumns={resize.isResizingColumns}
          columnHandlers={resize.columnHandlers}
          registerDropInside={drag.setDropInsideRef}
          isOverInside={drag.isOverInside}
          activeDragId={drag.activeDragId}
          activeDragType={drag.activeDragType}
          renderChild={(childId) => <EditorBlockWrapper key={childId} id={childId} />}
        />
      ) : (
        // `isEditorCanvas`: segnaposto "testo vuoto" (mai sul sito pubblico); `editing` solo se selezionato.
        <BlockRenderer node={node} isEditorCanvas editing={textEditing.editing} />
      )}

      <BlockModals
        node={node}
        label={label}
        childCount={childIds.length}
        confirmOpened={modals.confirmOpened}
        presetOpened={modals.presetOpened}
        convertOpened={modals.convertOpened}
        onCloseConfirm={modals.closeConfirm}
        onClosePreset={modals.closePreset}
        onCloseConvert={modals.closeConvert}
      />

      <BlockDropZone
        position="after"
        registerRef={drag.setDropAfterRef}
        isOver={drag.isOverAfter}
        activeDragId={drag.activeDragId}
        activeDragType={drag.activeDragType}
        parentId={location.parentId}
      />
    </div>
  );
});

export default EditorBlockWrapper;
