/**
 * Chrome dell'editor visivo full-screen (PLAN-F04-editor-visivo.md, evoluzione full-screen):
 * sostituisce, per la sola superficie di editing dei blocchi, la sidebar/topbar standard di
 * `LayoutProtected` con una chrome propria a piena finestra — l'obiettivo dichiarato è
 * massimizzare lo spazio dedicato al canvas, come in un editor visivo stile Elementor.
 *
 * **Come si sgancia dal layout standard.** Non tocca il routing: la rotta resta
 * `pages/:guid` dentro `LayoutProtected` (nessuna nuova rotta, nessuna modifica ad `App.tsx`).
 * Questo componente si posiziona in `position: fixed` con uno z-index superiore all'`AppShell`
 * (`FullScreenEditorLayout.module.css`), coprendo sidebar/topbar dell'admin finché la scheda
 * "Contenuto" del dettaglio Pagina è quella attiva. È lo stesso principio già usato altrove
 * nell'app per overlay a piena finestra (`Modal`/`Drawer` di Mantine), applicato qui a un
 * componente non-Mantine perché la chrome dell'editor a blocchi ha bisogno di un controllo
 * pixel-preciso sulle tre colonne (sidebar/canvas/struttura) che un `Modal` non offre.
 *
 * **`active` e copertura da `inset: 0`.** Il pannello "Contenuto"
 * resta sempre montato (`keepMounted`, `PagePageDetail.tsx`): smontarlo reinizializzerebbe
 * l'albero in editing dalla bozza persistita, buttando via modifiche non salvate. Montato
 * per sempre, però, significa che l'overlay `position: fixed` di questo componente esiste
 * nel DOM anche quando un'altra scheda è quella attiva — e un `Tabs.Panel` inattivo lo nasconde
 * con `display:none` (verificato sul sorgente installato di `@mantine/core`, non assunto:
 * `TabsPanel.mjs` applica `display:none` all'elemento del pannello stesso, che nasconde
 * correttamente **ogni** discendente incluso uno `position: fixed`, senza eccezioni — non è
 * quindi questo il meccanismo che si è rotto). L'editor deve coprire l'intera viewport
 * quando è attivo, come nella modalità full-page originale.
 * `active` (governato da `PagePageDetail.tsx`, `Tabs` ora controllato) rende esplicito, sul
 * nodo radice di questo componente, se è la scheda selezionata — quando non lo è si rende
 * `display:none` da sé, in aggiunta al `display:none` di Mantine sull'antenato, per non
 * dipendere da un solo meccanismo.
 *
 * **Viewport switcher e pannello struttura** leggono/scrivono `activeViewport` e
 * `isStructurePanelOpen` di `useBlockEditorStore` direttamente (non via props): sono stato di
 * chrome dell'editor, non stato della Pagina — lo stesso motivo per cui undo/redo restano
 * qui e non in `BlockEditorPanel` (CLAUDE.md — selettori Zustand mirati, mai l'intero store).
 *
 * **Ospita il `DndContext` di dnd-kit** (PLAN-F04c-editor-maturo.md T7, esteso alla sidebar
 * Widgets): non vive più in `EditorCanvas`, perché ora una sorgente di drag (`WidgetPalette`,
 * dentro `.sidebar`) e le sue destinazioni (le drop-zone di `EditorBlockWrapper`, dentro
 * `.canvasArea`) sono fratelli, non l'una discendente dell'altra — `useDraggable`/`useDroppable`
 * funzionano solo condividendo la stessa istanza di `DndContext`, e questo componente è il
 * primo antenato comune fra i due.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ActionIcon, Button, Paper, Text } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
  IconEye,
  IconHistory,
  IconLayoutGrid,
  IconLayoutSidebarRight,
  IconPlus,
} from '@tabler/icons-react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  useActiveViewport,
  useBlockEditorStore,
  useCanRedo,
  useCanUndo,
  useIsSidebarOpen,
  useIsStructurePanelOpen,
  type EditorViewport,
} from '../../../hooks/useBlockEditorStore';
import { BLOCK_TYPES } from '../../../types/blocks.types';
import type { PageRecord } from '../../../types/pages.types';
import { blockIcon, defaultPropsFor } from './BlockPalette';
import EditorSidebar from './sidebar/EditorSidebar';
import Toolbar from './Toolbar';
import HistoryDrawer from './HistoryDrawer';
import LocaleSwitcher from './LocaleSwitcher';
import TemplateLibraryModal from './TemplateLibraryModal';
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
 * Dimensioni del device frame simulato, solo per la label sotto la Topbar
 * (`.viewportDimensionLabel`) — Desktop resta fluido (`.viewportDesktop`, nessuna label),
 * Tablet/Mobile hanno invece una larghezza/altezza fissa da mostrare com'è, non calcolata
 * da `getBoundingClientRect` (la label deve leggere il vincolo dichiarato, non l'esito del
 * layout).
 */
const VIEWPORT_DIMENSIONS: Record<'tablet' | 'mobile', { width: number; height: number }> = {
  tablet: { width: 768, height: 1024 },
  mobile: { width: 375, height: 667 },
};

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
  /**
   * Genera e apre l'anteprima in una nuova scheda. `undefined` quando la Pagina non è in
   * bozza: il backend nega il token su ogni altro stato (ADR-25), quindi il pulsante non
   * compare invece di offrire un'azione che risponderebbe sempre con un errore.
   */
  onPreview?: () => void;
  /** Stato di caricamento del pulsante "Anteprima". */
  previewLoading?: boolean;
  /** Contenuto del pannello destro "Struttura/Navigator", visibile solo se aperto. */
  structurePanel?: ReactNode;
  /** Contenuto del canvas centrale (l'albero di blocchi in editing). */
  children: ReactNode;
  /**
   * `true` quando la scheda "Contenuto" è quella nominalmente selezionata in
   * `PagePageDetail.tsx`. Governa esplicitamente la visibilità del nodo radice di questo
   * componente (vedi commento di testa) — quando `false`, si rende `display:none` da sé,
   * senza dipendere soltanto dal `display:none` che Mantine applica al `Tabs.Panel`
   * antenato.
   */
  active: boolean;
  /**
   * Distanza in pixel dal bordo superiore del viewport da cui l'overlay inizia a coprire —
   * il bordo inferiore di `Tabs.List`, misurato da `PagePageDetail.tsx`. Ignorato quando
   * `active` è `false` (il nodo è `display:none`, la posizione non conta).
   */
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
  onPreview,
  previewLoading,
  structurePanel,
  children,
  active,
}: FullScreenEditorLayoutProps): JSX.Element {
  const activeViewport = useActiveViewport();
  const setActiveViewport = useBlockEditorStore((state) => state.setActiveViewport);
  const isStructurePanelOpen = useIsStructurePanelOpen();
  const toggleStructurePanel = useBlockEditorStore((state) => state.toggleStructurePanel);
  const isSidebarOpen = useIsSidebarOpen();
  const toggleSidebar = useBlockEditorStore((state) => state.toggleSidebar);
  const undo = useBlockEditorStore((state) => state.undo);
  const redo = useBlockEditorStore((state) => state.redo);
  const canUndo = useCanUndo();
  const canRedo = useCanRedo();
  const addBlockAction = useBlockEditorStore((state) => state.addBlockAction);
  const moveNodeToAction = useBlockEditorStore((state) => state.moveNodeToAction);
  // Selettore granulare: solo il conteggio dei nodi di radice, per aprire la libreria
  // sezioni (ADR-34 § 5) sempre in coda alla radice — nessuna sottoscrizione all'intero
  // `tree` solo per un numero.
  const rootBlocksCount = useBlockEditorStore((state) => state.tree.length);

  const [draggedBlock, setDraggedBlock] = useState<DraggedBlockInfo | null>(null);
  // ADR-34 § 5: secondo punto di apertura della libreria sezioni, accanto agli altri
  // controlli della topbar (struttura, anteprima, undo/redo) — sempre `parentId: null`,
  // in coda alla radice.
  const [templateLibraryOpened, setTemplateLibraryOpened] = useState(false);
  const [historyOpened, { toggle: toggleHistory, close: closeHistory }] = useDisclosure(false);

  // Motore delle scorciatoie da tastiera dell'editor (undo/redo/elimina/deseleziona/
  // duplica): attivo solo quando la scheda "Contenuto" è quella selezionata, stesso
  // principio del resto del componente (vedi commento di testa su `active`).
  useEditorShortcuts(active);

  /*
   * Nessuna idratazione dei Global Design Tokens qui: l'aspetto del Canvas — colori,
   * tipografia, spaziature — deriva ora dal `ThemeConfig` dell'Editor tema, applicato da
   * `EditorCanvas.tsx`. È la stessa fonte che veste il sito pubblicato, quindi il Canvas
   * mostra ciò che il visitatore vedrà invece di un secondo sistema di stile parallelo.
   */

  /** Contenitore che scrolla davvero durante il drag (punto 3 del task): `.canvasArea`, non
   * `.canvasRoot` di `EditorCanvas.module.css` (che non ha `overflow` proprio). */
  const canvasAreaRef = useRef<HTMLDivElement | null>(null);
  /** `requestAnimationFrame` dell'auto-scroll in corso, per poterlo cancellare al cleanup. */
  const autoScrollFrameRef = useRef<number | null>(null);
  /** Ultima posizione verticale nota del puntatore durante il drag, letta dal loop `rAF`. */
  const pointerYRef = useRef<number | null>(null);

  // Puntatore + tastiera (dnd-kit T7): la tastiera è anche la via deterministica per i test
  // E2E futuri. `distance` evita che un click sulla maniglia (selezione, tooltip), o un
  // click-to-add su una tessera della palette widget, venga scambiato per un trascinamento
  // di un pixel — 5px invece di 4 per lo stesso motivo con più margine.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  function handleDragStart(event: DragStartEvent): void {
    setDraggedBlock(draggedBlockInfo(event));
  }

  function handleDragEnd(event: DragEndEvent): void {
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

  const viewportClass: Record<EditorViewport, string> = {
    desktop: styles.viewportDesktop,
    tablet: styles.viewportTablet,
    mobile: styles.viewportMobile,
  };

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
    <div className={styles.root} style={active ? undefined : { display: 'none' }}>
      <Toolbar
        pageTitle={pageTitle}
        backHref={backHref}
        viewport={activeViewport}
        onViewportChange={setActiveViewport}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={undo}
        onRedo={redo}
        hasUnsavedChanges={hasUnsavedChanges}
        saving={saving}
        onPublish={onSaveDraft}
        leadingActions={
          <>
            {/* "+" Widget (restyle Elementor Pro, richiesta esplicita del task): stessa
                azione di sempre (mostra/nascondi il pannello Widgets), solo il glifo
                cambia da un'icona di layout generica al "+" letterale del task — nessuna
                modifica di comportamento. */}
            <ActionIcon
              variant={isSidebarOpen ? 'filled' : 'subtle'}
              size="lg"
              aria-label="Mostra/Nascondi pannello widget"
              aria-pressed={isSidebarOpen}
              onClick={toggleSidebar}
            >
              <IconPlus size={18} />
            </ActionIcon>
            {/* Storia/Navigatore (restyle Elementor Pro): spostate qui dal gruppo di destra
                — stessi due `ActionIcon`, stessi handler, solo la posizione nella topbar
                cambia (nessun "Impostazioni" aggiunto: nessuna funzionalità corrispondente
                esiste in questo codebase, vedi nota di consegna). */}
            <ActionIcon
              variant={historyOpened ? 'filled' : 'subtle'}
              size="lg"
              aria-label="Cronologia Azioni"
              aria-pressed={historyOpened}
              onClick={toggleHistory}
            >
              <IconHistory size={18} />
            </ActionIcon>
            <ActionIcon
              variant={isStructurePanelOpen ? 'filled' : 'subtle'}
              size="lg"
              aria-label="Pannello struttura"
              aria-pressed={isStructurePanelOpen}
              onClick={toggleStructurePanel}
            >
              <IconLayoutSidebarRight size={18} />
            </ActionIcon>
          </>
        }
        centerActions={page ? <LocaleSwitcher page={page} /> : undefined}
        trailingActions={
          <>
            {onPreview && (
              <Button
                variant="default"
                leftSection={<IconEye size={16} />}
                loading={previewLoading}
                onClick={onPreview}
              >
                Anteprima
              </Button>
            )}
            <ActionIcon
              variant="subtle"
              size="lg"
              aria-label="Libreria sezioni"
              onClick={() => setTemplateLibraryOpened(true)}
            >
              <IconLayoutGrid size={18} />
            </ActionIcon>
          </>
        }
      />

      {/*
        Label discreta sotto la Topbar coi pixel del device frame simulato, solo quando
        Tablet/Mobile impongono una larghezza fissa (Desktop resta fluido, `VIEWPORT_
        DIMENSIONS` sopra non lo elenca) — puramente informativa, nessun effetto sul
        rendering: la larghezza reale del frame resta pilotata solo da `viewportClass` sotto.
      */}
      {activeViewport !== 'desktop' && (
        <div className={styles.viewportDimensionLabel}>
          {VIEWPORT_DIMENSIONS[activeViewport].width}px ×{' '}
          {VIEWPORT_DIMENSIONS[activeViewport].height}px
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
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setDraggedBlock(null)}
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
            <aside className={`${styles.sidebar} ${isSidebarOpen ? '' : styles.sidebarCollapsed}`}>
              <EditorSidebar />
            </aside>

            <div className={styles.canvasArea} ref={canvasAreaRef}>
              {/*
              `data-viewport` non pilota nessuna media query nuova (il sync col rendering
              responsive dei blocchi passa già da `container-type: inline-size` qui sotto,
              letto dalle `@container` di `style-tokens.module.css`, ADR-29 § 2): resta solo
              un aggancio dichiarativo per selettori CSS/E2E futuri sul breakpoint simulato,
              senza introdurre un secondo sistema di breakpoint.
            */}
              <div
                className={`${styles.viewportContainer} ${viewportClass[activeViewport]}`}
                data-viewport={activeViewport}
              >
                {children}
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

      <TemplateLibraryModal
        opened={templateLibraryOpened}
        onClose={() => setTemplateLibraryOpened(false)}
        parentId={null}
        index={rootBlocksCount}
      />

      <HistoryDrawer opened={historyOpened} onClose={closeHistory} />
    </div>
  );
}
