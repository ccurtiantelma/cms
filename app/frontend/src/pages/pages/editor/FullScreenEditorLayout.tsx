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
import { useState, type ReactNode } from 'react';
import { ActionIcon, Badge, Button, Paper, Text, Tooltip } from '@mantine/core';
import {
  IconArrowBackUp,
  IconArrowForwardUp,
  IconArrowLeft,
  IconDeviceDesktop,
  IconDeviceMobile,
  IconDeviceTablet,
  IconEye,
  IconLayoutGrid,
  IconLayoutSidebarRight,
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
  useIsStructurePanelOpen,
  type EditorViewport,
} from '../../../hooks/useBlockEditorStore';
import { BLOCK_TYPES } from '../../../types/blocks.types';
import { defaultPropsFor } from './BlockPalette';
import EditorSidebar from './sidebar/EditorSidebar';
import TemplateLibraryModal from './TemplateLibraryModal';
import styles from './FullScreenEditorLayout.module.css';

/** Payload di una zona di rilascio (`EditorBlockWrapper.tsx`): dove inserire il nodo trascinato. */
interface DropTarget {
  parentId: string | null;
  index: number;
}

/** Etichetta leggibile del tipo trascinato, per il `DragOverlay`; il nome tecnico è un fallback. */
function draggedTypeLabel(event: DragStartEvent): string {
  const type = (event.active.data.current as { type?: string } | undefined)?.type;
  if (!type) return 'Blocco';
  return BLOCK_TYPES.find((entry) => entry.type === type)?.meta?.label ?? type;
}

/** Un'opzione del Viewport Switcher: valore di stato, etichetta e icona `@tabler/icons-react`. */
interface ViewportOption {
  value: EditorViewport;
  label: string;
  icon: typeof IconDeviceDesktop;
}

const VIEWPORT_OPTIONS: ViewportOption[] = [
  { value: 'desktop', label: 'Desktop', icon: IconDeviceDesktop },
  { value: 'tablet', label: 'Tablet', icon: IconDeviceTablet },
  { value: 'mobile', label: 'Mobile', icon: IconDeviceMobile },
];

export interface FullScreenEditorLayoutProps {
  /** Titolo della Pagina in editing, mostrato accanto al pulsante "Torna alla Dashboard". */
  pageTitle: string;
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

  const [draggedLabel, setDraggedLabel] = useState<string | null>(null);
  // ADR-34 § 5: secondo punto di apertura della libreria sezioni, accanto agli altri
  // controlli della topbar (struttura, anteprima, undo/redo) — sempre `parentId: null`,
  // in coda alla radice.
  const [templateLibraryOpened, setTemplateLibraryOpened] = useState(false);

  // Puntatore + tastiera (dnd-kit T7): la tastiera è anche la via deterministica per i test
  // E2E futuri. `distance` evita che un click sulla maniglia (selezione, tooltip), o un
  // click-to-add su una tessera della palette widget, venga scambiato per un trascinamento
  // di un pixel — 5px invece di 4 per lo stesso motivo con più margine.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  function handleDragStart(event: DragStartEvent): void {
    setDraggedLabel(draggedTypeLabel(event));
  }

  function handleDragEnd(event: DragEndEvent): void {
    setDraggedLabel(null);
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

  return (
    <div
      className={styles.root}
      // Esplicito e non affidato al solo antenato Mantine (vedi commento di testa): quando
      // non è la scheda attiva, `display: none` qui basta da solo a non intercettare più
      // alcun click/evento, qualunque cosa faccia (o smetta di fare) `Tabs.Panel`. Quando è
      style={active ? undefined : { display: 'none' }}
    >
      <header className={styles.topbar}>
        <div className={styles.topbarSection}>
          {/*
            `component="a" href` (non `onClick` + `navigate`): la guardia sulle modifiche
            non salvate (`useUnsavedChangesGuard`) intercetta solo i click su `<a href>`
            interni — un `onClick` imperativo bypasserebbe la conferma di uscita.
          */}
          <Tooltip label="Torna alla Dashboard" withArrow>
            <ActionIcon
              component="a"
              href={backHref}
              variant="default"
              size="lg"
              aria-label="Torna alla Dashboard"
            >
              <IconArrowLeft size={18} />
            </ActionIcon>
          </Tooltip>
          <Text size="sm" fw={600} className={styles.pageTitle} title={pageTitle}>
            {pageTitle}
          </Text>
          <Tooltip label="Annulla (Ctrl+Z)" withArrow>
            <ActionIcon
              variant="subtle"
              size="lg"
              aria-label="Annulla l'ultima modifica"
              disabled={!canUndo}
              onClick={() => undo()}
            >
              <IconArrowBackUp size={16} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Ripristina (Ctrl+Shift+Z)" withArrow>
            <ActionIcon
              variant="subtle"
              size="lg"
              aria-label="Ripristina la modifica annullata"
              disabled={!canRedo}
              onClick={() => redo()}
            >
              <IconArrowForwardUp size={16} />
            </ActionIcon>
          </Tooltip>
        </div>

        <div className={styles.viewportSwitcher} role="group" aria-label="Viewport di anteprima">
          {VIEWPORT_OPTIONS.map((option) => {
            const Icon = option.icon;
            const isActive = activeViewport === option.value;
            return (
              <Tooltip key={option.value} label={option.label} withArrow>
                <ActionIcon
                  variant={isActive ? 'filled' : 'subtle'}
                  size="lg"
                  aria-label={`Viewport ${option.label}`}
                  aria-pressed={isActive}
                  onClick={() => setActiveViewport(option.value)}
                >
                  <Icon size={18} />
                </ActionIcon>
              </Tooltip>
            );
          })}
        </div>

        <div className={styles.topbarSection}>
          {hasUnsavedChanges ? (
            <Badge color="orange" variant="light">
              Modifiche non salvate
            </Badge>
          ) : (
            <Text size="sm" c="dimmed">
              Bozza salvata
            </Text>
          )}
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
          <Tooltip label="Libreria sezioni" withArrow>
            <ActionIcon
              variant="default"
              size="lg"
              aria-label="Libreria sezioni"
              onClick={() => setTemplateLibraryOpened(true)}
            >
              <IconLayoutGrid size={18} />
            </ActionIcon>
          </Tooltip>
          <Tooltip
            label={isStructurePanelOpen ? 'Nascondi struttura' : 'Mostra struttura'}
            withArrow
          >
            <ActionIcon
              variant={isStructurePanelOpen ? 'filled' : 'default'}
              size="lg"
              aria-label="Pannello struttura"
              aria-pressed={isStructurePanelOpen}
              onClick={() => toggleStructurePanel()}
            >
              <IconLayoutSidebarRight size={18} />
            </ActionIcon>
          </Tooltip>
          <Button onClick={onSaveDraft} loading={saving}>
            Salva bozza
          </Button>
        </div>
      </header>

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
        onDragCancel={() => setDraggedLabel(null)}
      >
        <div className={styles.workArea}>
          <aside className={styles.sidebar}>
            <EditorSidebar />
          </aside>

          <div className={styles.canvasArea}>
            <div className={`${styles.viewportContainer} ${viewportClass[activeViewport]}`}>
              {children}
            </div>
          </div>

          {isStructurePanelOpen && (
            <aside className={styles.structurePanel} aria-label="Struttura della pagina">
              {structurePanel}
            </aside>
          )}
        </div>

        <DragOverlay>
          {draggedLabel ? (
            <Paper withBorder p="xs" radius="sm" shadow="md">
              <Text size="sm" fw={600}>
                {draggedLabel}
              </Text>
            </Paper>
          ) : null}
        </DragOverlay>
      </DndContext>

      <TemplateLibraryModal
        opened={templateLibraryOpened}
        onClose={() => setTemplateLibraryOpened(false)}
        parentId={null}
        index={rootBlocksCount}
      />
    </div>
  );
}
