/**
 * Chrome dell'editor attorno a un singolo nodo dell'albero (PLAN-F04-editor-visivo.md T4):
 * selezione, riordino fra fratelli, spostamento dentro/fuori da un contenitore, inserimento
 * posizionale di un blocco nuovo sopra o sotto questo, eliminazione, e — sui contenitori —
 * il trigger della palette per aggiungere figli.
 *
 * Ogni azione che cambia la struttura passa dallo store, che la verifica contro il registro
 * dei blocchi prima di applicarla: qui si decide solo se *offrirla*, e con la stessa
 * funzione (`canContainType`) che lo store userà per accettarla — mai con una regola
 * scritta due volte.
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
  memo,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { ActionIcon, Group, Menu, Text, Tooltip } from '@mantine/core';
import { useShallow } from 'zustand/react/shallow';
import { useDndContext, useDraggable, useDroppable } from '@dnd-kit/core';
import {
  IconArrowDown,
  IconArrowUp,
  IconCopy,
  IconCornerLeftUp,
  IconGripVertical,
  IconHeading,
  IconIndentDecrease,
  IconIndentIncrease,
  IconPlus,
  IconTrash,
  IconX,
} from '@tabler/icons-react';
import { BLOCK_TYPES, type BlockTypeDescriptor } from '../../../types/blocks.types';
import { useBlockEditorStore, useNodeById } from '../../../hooks/useBlockEditorStore';
import { findLocation, findNode, type BlockNode } from './block-tree.utils';
import { canContainType, canDropInto } from './block-registry.utils';
import BlockRenderer from '../../../components/blocks/BlockRenderer';
import BlockErrorBoundary from '../../../components/blocks/BlockErrorBoundary';
import Section from '../../../components/blocks/blocks/Section';
import ConfirmModal from '../../../components/ConfirmModal';
import BlockPalette, { blockIcon, defaultPropsFor } from './BlockPalette';
import styles from './EditorBlockWrapper.module.css';

/**
 * Componenti di F02 che accettano figli. Non è un secondo renderer: è la stessa
 * implementazione che `BlockRenderer` monta per quel tipo, montata qui direttamente
 * perché l'editor deve interporre la propria chrome fra contenitore e figli. Un tipo
 * contenitore nuovo nel registro senza voce qui ricade su `BlockRenderer` (i figli si
 * vedono, senza toolbar per figlio): un difetto visibile, mai un contenuto divergente.
 *
 * Le props qui sotto sono le stesse che `BlockRenderer.tsx` estrae da `node.props` per
 * `section` (ADR-31): duplicate per firma, non per valore, perché qui il montaggio bypassa
 * `BlockRenderer` (i figli hanno bisogno della chrome, non del dispatcher ricorsivo).
 */
interface ContainerComponentProps {
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
  stylePaddingTop?: unknown;
  stylePaddingRight?: unknown;
  stylePaddingBottom?: unknown;
  stylePaddingLeft?: unknown;
  styleMarginTop?: unknown;
  styleMarginRight?: unknown;
  styleMarginBottom?: unknown;
  styleMarginLeft?: unknown;
}

const CONTAINER_COMPONENTS: Record<string, (props: ContainerComponentProps) => JSX.Element> = {
  section: Section,
};

/** Livelli ammessi per `heading.level` (registro, `blocks.types.ts`): niente `h1`. */
const HEADING_LEVELS = ['h2', 'h3', 'h4', 'h5', 'h6'] as const;

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

/** Un valore di prop è "non compilato" se assente o stringa vuota. */
function isBlankValue(value: unknown): boolean {
  return (
    value === undefined || value === null || (typeof value === 'string' && value.trim() === '')
  );
}

/**
 * Prop obbligatorie ancora vuote, secondo il registro. Puramente informativo (UX): la
 * validazione autorevole resta il `400` del server, che questa nota non anticipa né
 * sostituisce — non blocca nulla.
 */
function blankRequiredProps(
  descriptor: BlockTypeDescriptor | undefined,
  node: BlockNode,
): string[] {
  if (!descriptor) return [];
  return descriptor.props
    .filter((prop) => prop.required && isBlankValue(node.props[prop.name]))
    .map((prop) => prop.name);
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

/**
 * Avvolge il rendering di un nodo con la chrome di editing. `memo` sull'id: quando un
 * fratello cambia, questo nodo non si ri-renderizza (le sue props non cambiano e le sue
 * sottoscrizioni allo store restituiscono gli stessi riferimenti — structural sharing di
 * `block-tree.utils.ts`).
 */
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

  /**
   * Tipo del contenitore che ospita questo nodo (`undefined` alla radice): serve alle due
   * palette di inserimento posizionale, che devono filtrare i tipi ammessi *accanto* a
   * questo blocco, non dentro di lui.
   */
  const parentType = useBlockEditorStore((state) => {
    const current = findLocation(state.tree, id);
    return current?.parentId ? findNode(state.tree, current.parentId)?.type : undefined;
  });

  /**
   * Destinazione di "sposta dentro": il fratello **precedente**, se è un contenitore che il
   * registro ammette per questo tipo. `null` quando la mossa non è possibile — ed è il
   * registro a dirlo, non un elenco di tipi scritto qui.
   */
  const indentTarget = useBlockEditorStore(
    useShallow((state) => {
      const node = findNode(state.tree, id);
      const current = findLocation(state.tree, id);
      if (!node || !current || current.index === 0) return null;
      const siblings =
        current.parentId === null
          ? state.tree
          : (findNode(state.tree, current.parentId)?.children ?? []);
      const previous = siblings[current.index - 1];
      if (!previous || !canContainType(previous.type, node.type)) return null;
      return { parentId: previous.id, index: previous.children.length };
    }),
  );

  /**
   * Destinazione di "porta fuori": il livello del contenitore, subito dopo di lui. `null`
   * se il nodo è già alla radice o se lì il suo tipo non è ammesso.
   */
  const outdentTarget = useBlockEditorStore(
    useShallow((state) => {
      const node = findNode(state.tree, id);
      const current = findLocation(state.tree, id);
      if (!node || !current || current.parentId === null) return null;
      const parentLocation = findLocation(state.tree, current.parentId);
      if (!parentLocation) return null;
      const grandParentType =
        parentLocation.parentId === null
          ? undefined
          : findNode(state.tree, parentLocation.parentId)?.type;
      if (!canContainType(grandParentType, node.type)) return null;
      return { parentId: parentLocation.parentId, index: parentLocation.index + 1 };
    }),
  );

  const selectNode = useBlockEditorStore((state) => state.selectNode);
  const addBlockAction = useBlockEditorStore((state) => state.addBlockAction);
  const moveBlockAction = useBlockEditorStore((state) => state.moveBlockAction);
  const moveNodeToAction = useBlockEditorStore((state) => state.moveNodeToAction);
  const removeBlockAction = useBlockEditorStore((state) => state.removeBlockAction);
  const duplicateNodeAction = useBlockEditorStore((state) => state.duplicateNodeAction);
  const updateBlockPropsAction = useBlockEditorStore((state) => state.updateBlockPropsAction);

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

  // Il nodo può sparire dall'albero fra un render e l'altro (eliminato da questa stessa
  // toolbar): non è un errore, semplicemente non c'è più nulla da renderizzare.
  if (!node || !location) return null;

  const descriptor = BLOCK_TYPES.find((entry) => entry.type === node.type);
  const label = descriptor?.meta?.label ?? node.type;
  const ContainerComponent = CONTAINER_COMPONENTS[node.type];
  const isContainer = (descriptor?.childrenAllow.length ?? 0) > 0;
  const blankRequired = blankRequiredProps(descriptor, node);

  /**
   * Variante Elementor, solo su `section` (T-layout-colonne-section): bordo d'accento
   * magenta al posto del bordo blu generico di hover/selezione — il resto della chrome
   * (badge, toolbar, drop-zone) resta identico per ogni tipo di blocco, questa Section
   * ha in più solo la linguetta d'azione sostitutiva più sotto.
   */
  const isSection = node.type === 'section';

  const className = [
    styles.wrapper,
    // `.hovered`/`.selected` restano applicate anche sulla Section (governano ancora
    // l'opacità della toolbar integrata più sotto, CSS `.selected > .toolbar`):
    // `.sectionAccent`, dichiarata dopo nel CSS module, vince solo sul colore del bordo.
    isHovered ? styles.hovered : '',
    isSelected ? styles.selected : '',
    isSection && (isHovered || isSelected) ? styles.sectionAccent : '',
    isInvalid ? styles.invalid : '',
    isDragging ? styles.dragging : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      ref={setDragRef}
      className={className}
      data-block-type={node.type}
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
          Badge del tipo di blocco (T-canvas-cleanup): solo icona, mai testo fisso — la
          scritta uppercase ("SEZIONE"/"TITOLO"/…) inquinava il canvas anche da ferma.
          Stesso trigger di prima (hover del nodo puntato, o selezione), stessa posizione.
          `aria-hidden`: l'etichetta accessibile del blocco resta sugli `aria-label` dei
          pulsanti della toolbar ("Duplica il blocco {label}" ecc.), non su questo badge
          puramente decorativo.
        */}
      {(isHovered || isSelected) &&
        (() => {
          const BadgeIcon = blockIcon(descriptor?.meta?.icon);
          return (
            <span className={styles.hoverBadge} aria-hidden="true">
              <BadgeIcon size={12} />
            </span>
          );
        })()}

      {/*
          Action bar floating: solo sul nodo selezionato. Due varianti mutuamente
          esclusive, mai entrambe (punto 3 del task): su `section` la linguetta stile
          Elementor (`sectionActionTab`, sotto) sostituisce integralmente la barra
          generica — un'unica azione "aggiungi" (Section vuota sopra) al posto delle due
          separate ("seleziona padre"/"duplica") che qui contavano meno. Ogni altro tipo
          di blocco vede la barra generica invariata, con le sue 4 azioni rapide (drag,
          seleziona padre, duplica, elimina). Aggiuntiva rispetto alla toolbar integrata
          qui sotto, che resta invariata con tutti i comandi esistenti (riordino,
          indent/outdent, inserimento posizionale) — nessuna funzionalità rimossa.
        */}
      {isSelected && isSection && (
        <Group
          className={styles.sectionActionTab}
          gap={2}
          wrap="nowrap"
          onClick={(event) => event.stopPropagation()}
        >
          <Tooltip label="Aggiungi una Section vuota sopra" withArrow>
            <ActionIcon
              variant="transparent"
              color="white"
              size="sm"
              aria-label="Aggiungi una Section vuota sopra questa"
              onClick={(event) => {
                event.stopPropagation();
                addBlockAction(
                  location.parentId,
                  'section',
                  location.index,
                  descriptor ? defaultPropsFor(descriptor) : {},
                );
              }}
            >
              <IconPlus size={14} />
            </ActionIcon>
          </Tooltip>

          <Tooltip label="Trascina per riordinare" withArrow>
            <ActionIcon
              variant="transparent"
              color="white"
              size="sm"
              aria-label={`Sposta il blocco ${label} (azione rapida)`}
              onClick={(event) => event.stopPropagation()}
              {...attributes}
              {...listeners}
            >
              <IconGripVertical size={14} />
            </ActionIcon>
          </Tooltip>

          <Tooltip label="Elimina" withArrow>
            <ActionIcon
              variant="transparent"
              color="white"
              size="sm"
              aria-label={`Elimina subito il blocco ${label}`}
              onClick={(event) => {
                event.stopPropagation();
                setConfirmOpened(true);
              }}
            >
              <IconX size={14} />
            </ActionIcon>
          </Tooltip>
        </Group>
      )}

      {/*
          Le tre azioni qui sotto duplicano funzionalità già presenti nella toolbar
          integrata più in basso (drag, duplica, elimina), montata sempre — non solo su
          selezione. Le due barre coesistono quando il nodo è selezionato (nessuna
          funzionalità rimossa, vedi commento più sopra), quindi qui l'`aria-label` usa una
          formulazione diversa da quella canonica, non solo un suffisso in coda: senza
          `exact: true`, `getByRole('button', { name })` di Playwright confronta per
          sottostringa, quindi "Duplica il blocco X (azione rapida)" continuerebbe a
          soddisfare anche la query per "Duplica il blocco X" — due bottoni, `strict mode
          violation`. La toolbar integrata resta la sorgente del nome canonico, invariato,
          usato da `e2e/tests/helpers/page-editor.ts`.
        */}
      {isSelected && !isSection && (
        <Group className={styles.floatingActionBar} gap={2} wrap="nowrap">
          <Tooltip label="Trascina per riordinare" withArrow>
            <ActionIcon
              variant="subtle"
              size="sm"
              aria-label={`Sposta il blocco ${label} (azione rapida)`}
              onClick={(event) => event.stopPropagation()}
              {...attributes}
              {...listeners}
            >
              <IconGripVertical size={14} />
            </ActionIcon>
          </Tooltip>

          <Tooltip
            label={location.parentId !== null ? 'Seleziona il blocco padre' : 'Nessun blocco padre'}
            withArrow
          >
            <ActionIcon
              variant="subtle"
              size="sm"
              aria-label={`Seleziona il blocco padre di ${label}`}
              disabled={location.parentId === null}
              onClick={(event) => {
                event.stopPropagation();
                if (location.parentId !== null) selectNode(location.parentId);
              }}
            >
              <IconCornerLeftUp size={14} />
            </ActionIcon>
          </Tooltip>

          <Tooltip label="Duplica" withArrow>
            <ActionIcon
              variant="subtle"
              size="sm"
              aria-label={`Duplica rapidamente il blocco ${label}`}
              onClick={(event) => {
                event.stopPropagation();
                duplicateNodeAction(id);
              }}
            >
              <IconCopy size={14} />
            </ActionIcon>
          </Tooltip>

          <Tooltip label="Elimina" withArrow>
            <ActionIcon
              variant="subtle"
              color="red"
              size="sm"
              aria-label={`Elimina subito il blocco ${label}`}
              onClick={(event) => {
                event.stopPropagation();
                setConfirmOpened(true);
              }}
            >
              <IconTrash size={14} />
            </ActionIcon>
          </Tooltip>
        </Group>
      )}

      <Group className={styles.toolbar} gap={4} wrap="nowrap">
        {/*
            Niente più etichetta testuale cliccabile qui (T-canvas-cleanup): era ridondante
            con il click-to-select già gestito dal wrapper stesso (`onClick` sul `div`
            principale, poco sopra) — un secondo modo di fare la stessa cosa, solo testuale.
          */}
        <Tooltip label="Trascina per riordinare" withArrow>
          <ActionIcon
            variant="subtle"
            size="sm"
            className={styles.dragHandle}
            aria-label={`Trascina per spostare il blocco ${label}`}
            onClick={(event) => event.stopPropagation()}
            {...attributes}
            {...listeners}
          >
            <IconGripVertical size={14} />
          </ActionIcon>
        </Tooltip>

        <Tooltip label="Sposta su" withArrow>
          <ActionIcon
            variant="subtle"
            size="sm"
            aria-label={`Sposta su il blocco ${label}`}
            disabled={location.index === 0}
            onClick={(event) => {
              event.stopPropagation();
              moveBlockAction(id, 'up');
            }}
          >
            <IconArrowUp size={14} />
          </ActionIcon>
        </Tooltip>

        <Tooltip label="Sposta giù" withArrow>
          <ActionIcon
            variant="subtle"
            size="sm"
            aria-label={`Sposta giù il blocco ${label}`}
            disabled={location.index === location.siblingsCount - 1}
            onClick={(event) => {
              event.stopPropagation();
              moveBlockAction(id, 'down');
            }}
          >
            <IconArrowDown size={14} />
          </ActionIcon>
        </Tooltip>

        <Tooltip
          label={indentTarget ? 'Sposta dentro il blocco precedente' : 'Nessun contenitore sopra'}
          withArrow
        >
          <ActionIcon
            variant="subtle"
            size="sm"
            aria-label={`Sposta il blocco ${label} dentro il contenitore precedente`}
            disabled={!indentTarget}
            onClick={(event) => {
              event.stopPropagation();
              if (indentTarget) moveNodeToAction(id, indentTarget.parentId, indentTarget.index);
            }}
          >
            <IconIndentIncrease size={14} />
          </ActionIcon>
        </Tooltip>

        <Tooltip label="Porta fuori dal contenitore" withArrow>
          <ActionIcon
            variant="subtle"
            size="sm"
            aria-label={`Porta il blocco ${label} fuori dal contenitore`}
            disabled={!outdentTarget}
            onClick={(event) => {
              event.stopPropagation();
              if (outdentTarget) moveNodeToAction(id, outdentTarget.parentId, outdentTarget.index);
            }}
          >
            <IconIndentDecrease size={14} />
          </ActionIcon>
        </Tooltip>

        <Tooltip label="Duplica" withArrow>
          <ActionIcon
            variant="subtle"
            size="sm"
            aria-label={`Duplica il blocco ${label}`}
            onClick={(event) => {
              event.stopPropagation();
              duplicateNodeAction(id);
            }}
          >
            <IconCopy size={14} />
          </ActionIcon>
        </Tooltip>

        <Tooltip label="Elimina" withArrow>
          <ActionIcon
            variant="subtle"
            color="red"
            size="sm"
            aria-label={`Elimina il blocco ${label}`}
            onClick={(event) => {
              event.stopPropagation();
              setConfirmOpened(true);
            }}
          >
            <IconTrash size={14} />
          </ActionIcon>
        </Tooltip>

        {/*
          Cambio livello del titolo (h2-h6, mai h1 — il registro non lo prevede,
          `blocks.types.ts`): solo su `node.type === 'heading'`, stesso pattern
          condizionale di `isSection` più sopra. `Menu` invece di un ciclo di
          `ActionIcon` separati: sei livelli non stanno nella toolbar integrata senza
          allungarla.
        */}
        {node.type === 'heading' && (
          <Menu shadow="md" width={120} position="bottom-start" withinPortal zIndex={1100}>
            <Menu.Target>
              <Tooltip label="Cambia livello del titolo" withArrow>
                <ActionIcon
                  variant="subtle"
                  size="sm"
                  aria-label={`Cambia livello del titolo ${label} (attuale ${String(
                    node.props.level ?? 'h2',
                  ).toUpperCase()})`}
                  onClick={(event) => event.stopPropagation()}
                >
                  <IconHeading size={14} />
                </ActionIcon>
              </Tooltip>
            </Menu.Target>
            <Menu.Dropdown onClick={(event) => event.stopPropagation()}>
              {HEADING_LEVELS.map((level) => (
                <Menu.Item
                  key={level}
                  onClick={(event) => {
                    event.stopPropagation();
                    updateBlockPropsAction(id, { level });
                  }}
                >
                  {level.toUpperCase()}
                </Menu.Item>
              ))}
            </Menu.Dropdown>
          </Menu>
        )}

        {/*
          Inserimento posizionale: un blocco nuovo si mette dove serve, non solo in fondo
          all'albero. Il contenitore di destinazione è quello che ospita *questo* nodo, e
          l'indice è il suo — quindi le due palette offrono esattamente i tipi ammessi in
          quella posizione, non quelli ammessi dentro questo blocco.
        */}
        <BlockPalette
          parentId={location.parentId}
          parentType={parentType}
          index={location.index}
          label="Inserisci sopra"
          size="xs"
          variant="subtle"
          iconOnly
        />
        <BlockPalette
          parentId={location.parentId}
          parentType={parentType}
          index={location.index + 1}
          label="Inserisci sotto"
          size="xs"
          variant="subtle"
          iconOnly
        />

        {isContainer && (
          <BlockPalette
            parentId={id}
            parentType={node.type}
            label="Aggiungi dentro"
            size="xs"
            variant="subtle"
            iconOnly
          />
        )}
      </Group>

      {blankRequired.length > 0 && (
        <Text className={styles.emptyLeaf} component="p" mb={4}>
          Proprietà obbligatorie non compilate: {blankRequired.join(', ')}.
        </Text>
      )}

      {isContainer && ContainerComponent ? (
        <BlockErrorBoundary>
          <ContainerComponent
            styleSpaceBefore={node.props.styleSpaceBefore}
            styleSpaceAfter={node.props.styleSpaceAfter}
            stylePadding={node.props.stylePadding}
            styleBackground={node.props.styleBackground}
            columns={node.props.columns}
            gap={node.props.gap}
            alignItems={node.props.alignItems}
            contentWidth={node.props.contentWidth}
            maxWidth={node.props.maxWidth}
            columnRatio={node.props.columnRatio}
            styleBackgroundColor={node.props.styleBackgroundColor}
            stylePaddingTop={node.props.stylePaddingTop}
            stylePaddingRight={node.props.stylePaddingRight}
            stylePaddingBottom={node.props.stylePaddingBottom}
            stylePaddingLeft={node.props.stylePaddingLeft}
            styleMarginTop={node.props.styleMarginTop}
            styleMarginRight={node.props.styleMarginRight}
            styleMarginBottom={node.props.styleMarginBottom}
            styleMarginLeft={node.props.styleMarginLeft}
          >
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

            {childIds.length === 0 ? (
              <div className={styles.emptyContainer}>
                Contenitore vuoto — usa &laquo;Aggiungi dentro&raquo; per inserire un blocco.
              </div>
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
                  onHtmlChange: (nextHtml) => {
                    cancelDebouncedUpdate();
                    updateBlockPropsAction(id, { html: nextHtml });
                  },
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
  );
});

export default EditorBlockWrapper;
