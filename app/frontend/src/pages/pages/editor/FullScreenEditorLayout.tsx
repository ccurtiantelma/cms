/**
 * Shell orchestratrice dell'editor visivo full-screen (PLAN-F04-editor-visivo.md): topbar
 * (52px) + area di lavoro a due colonne — sidebar sinistra a schede (300px: Widgets,
 * Struttura, Modifica, Cronologia, Pagina) e Canvas (resto dello spazio) — **ADR-94** (supera
 * ADR-91 punti 1-2: il Property Inspector non è più una colonna destra ma la scheda "Modifica").
 *
 * Chrome di una rotta dedicata (`PageStudio.tsx` dentro `/studio/:guid`, ADR-54), `position:
 * fixed` a piena viewport (`FullScreenEditorLayout.module.css`); riusata anche dal Builder
 * delle Sezioni Globali (`PageGlobalSectionBuilder.tsx`, ADR-40).
 *
 * Qui resta solo la composizione; la logica vive nei moduli dedicati:
 * - `EditorDnDProvider` — `DndContext` unico (sensori, ponte cross-frame ADR-72, auto-scroll,
 *   `EditorDragOverlay`): sorgente di drag (palette) e destinazioni (canvas) sono fratelli.
 * - `EditorSidebarShell` / `EditorViewportFrame` — le due colonne.
 *
 * Breakpoint switcher, undo/redo leggono/scrivono `useBlockEditorStore` direttamente
 * (selettori mirati, mai l'intero store): sono stato di chrome, non stato della Pagina.
 */
import { useRef, type ReactNode } from 'react';
import {
  useActiveBreakpoint,
  useBlockEditorStore,
  useCanRedo,
  useCanUndo,
} from '../../../hooks/useBlockEditorStore';
import type { PageRecord, PageStatus } from '../../../types/pages.types';
import EditorDnDProvider from './EditorDnDProvider';
import EditorSidebarShell from './EditorSidebarShell';
import EditorViewportFrame, { ViewportDimensionLabel } from './EditorViewportFrame';
import Toolbar from './Toolbar';
import { useEditorShortcuts } from './useEditorShortcuts';
import styles from './FullScreenEditorLayout.module.css';

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
 * Layout full-screen dell'editor visivo a blocchi: topbar (52px) + area di lavoro a due
 * colonne (ADR-94).
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
  children,
  onPageUpdated,
  onVersionConflict,
  pageStatus,
  visibleTransitions,
  statusSubmitting,
  onRequestStatusChange,
}: FullScreenEditorLayoutProps): JSX.Element {
  const activeBreakpoint = useActiveBreakpoint();
  const setActiveBreakpoint = useBlockEditorStore((state) => state.setActiveBreakpoint);
  const undo = useBlockEditorStore((state) => state.undo);
  const redo = useBlockEditorStore((state) => state.redo);
  const canUndo = useCanUndo();
  const canRedo = useCanRedo();
  // Riferimenti imperativi condivisi da provider DnD e frame: l'`<iframe>` del canvas
  // (misura cross-frame) e `.canvasArea` (auto-scroll durante il drag).
  const iframeElRef = useRef<HTMLIFrameElement | null>(null);
  const canvasAreaRef = useRef<HTMLDivElement | null>(null);

  // Scorciatoie da tastiera (undo/redo/elimina/deseleziona/duplica): sempre attive, questa
  // è la chrome di un'intera rotta dedicata.
  useEditorShortcuts();

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
        trailingActions={<></>}
      />

      <ViewportDimensionLabel />

      <EditorDnDProvider iframeElRef={iframeElRef} canvasAreaRef={canvasAreaRef}>
        <div className={styles.canvasShell}>
          <div className={styles.workArea}>
            <EditorSidebarShell
              page={page}
              onPageUpdated={onPageUpdated}
              onVersionConflict={onVersionConflict}
            />
            <EditorViewportFrame iframeElRef={iframeElRef} canvasAreaRef={canvasAreaRef}>
              {children}
            </EditorViewportFrame>
          </div>
        </div>
      </EditorDnDProvider>
    </div>
  );
}
