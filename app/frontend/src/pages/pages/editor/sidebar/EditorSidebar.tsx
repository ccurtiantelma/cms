/**
 * Colonna sinistra "Palette Widget" della shell fullscreen a 3 colonne (ADR-91, supera ADR-32
 * § "Decisione" punto 1 e la sidebar unica a 5 schede che questo file montava prima):
 * "Widgets" (libreria trascinabile, `WidgetPalette`), "Struttura" (albero dei blocchi,
 * `EditorStructureNavigator`), "Cronologia" e "Pagina" restano qui a schede — solo
 * "Proprietà" ne è uscita, promossa a colonna destra fissa e sempre visibile
 * (`FullScreenEditorLayout.tsx`, `.inspectorPanel`), non più una destinazione di tab.
 *
 * La scheda attiva vive in `useBlockEditorStore` (`activeSidebarTab`) e non in uno stato
 * locale: deve poter essere cambiata da fuori questo componente. Selezionare un blocco nel
 * canvas (`selectNode`) continua a scrivere `activeSidebarTab: 'properties'` — invariato,
 * perché lo stesso store è condiviso con `BuilderSidebar.tsx` (Template Editor, dominio
 * separato, CLAUDE.md — zero refactoring fuori scope) che quel valore lo usa ancora davvero.
 * Qui quel valore non ha più una scheda propria: il ramo sotto lo tratta come `'widgets'`,
 * così il click su un blocco nel canvas non lascia questa colonna su una scheda inesistente.
 *
 * `Tabs.List` senza `Tabs.Panel`: il contenuto sotto l'header è gestito a mano (un `if`
 * sulla scheda attiva), non dal meccanismo di rendering condizionale di Mantine — serve un
 * contenitore scrollabile indipendente dall'header, che `Tabs.Panel` non offre da solo.
 *
 * Anteprima e "Cambia Stato" non vivono qui: sono nella topbar (`Toolbar.tsx`), in alto a
 * destra — richiesta esplicita del task di riportarli lì dal fondo di questa sidebar.
 */
import { Tabs, Tooltip } from '@mantine/core';
import { IconHistory, IconListTree, IconSettings, IconStack2 } from '@tabler/icons-react';
import {
  useActiveSidebarTab,
  useBlockEditorStore,
  type EditorSidebarTab,
} from '../../../../hooks/useBlockEditorStore';
import type { PageRecord } from '../../../../types/pages.types';
import EditorStructureNavigator from '../EditorStructureNavigator';
import WidgetSidebar from './WidgetSidebar';
import PageSettingsTab from './PageSettingsTab';
import { HistoryPanel } from '../HistoryDrawer';
import styles from './EditorSidebar.module.css';

export interface EditorSidebarProps {
  /**
   * La Pagina in editing, per la scheda "Pagina" (E01, Titolo/Slug/SEO essenziale) —
   * opzionale come in `FullScreenEditorLayout` (assente nel Builder delle Sezioni Globali,
   * ADR-40): la scheda resta nella lista ma senza form da compilare in quel contesto.
   */
  page?: PageRecord;
  /** Propaga un salvataggio riuscito dal form compatto della scheda "Pagina". */
  onPageUpdated?: (page: PageRecord) => void;
  /** Notifica di conflitto di editing (`409`) dello stesso form — mai overwrite silenzioso. */
  onVersionConflict?: () => void;
}

/** Sidebar a schede Widgets/Proprietà/Pagina dell'editor full-screen. */
export default function EditorSidebar({
  page,
  onPageUpdated,
  onVersionConflict,
}: EditorSidebarProps): JSX.Element {
  const activeTab = useActiveSidebarTab();
  const setActiveSidebarTab = useBlockEditorStore((state) => state.setActiveSidebarTab);

  return (
    <div className={styles.root}>
      <Tabs
        value={activeTab}
        onChange={(value) => value && setActiveSidebarTab(value as EditorSidebarTab)}
        className={styles.tabs}
      >
        <Tabs.List grow>
          <Tooltip label="Widgets" openDelay={300} withinPortal>
            <Tabs.Tab value="widgets" aria-label="Widgets">
              <IconStack2 size={20} />
            </Tabs.Tab>
          </Tooltip>
          <Tooltip label="Struttura" openDelay={300} withinPortal>
            <Tabs.Tab value="structure" aria-label="Struttura">
              <IconListTree size={20} />
            </Tabs.Tab>
          </Tooltip>
          <Tooltip label="Cronologia" openDelay={300} withinPortal>
            <Tabs.Tab value="history" aria-label="Cronologia">
              <IconHistory size={20} />
            </Tabs.Tab>
          </Tooltip>
          <Tooltip label="Pagina" openDelay={300} withinPortal>
            <Tabs.Tab value="page" aria-label="Pagina">
              <IconSettings size={20} />
            </Tabs.Tab>
          </Tooltip>
        </Tabs.List>
      </Tabs>

      <div className={styles.content}>
        {activeTab === 'structure' ? (
          <div className={styles.panel}>
            <EditorStructureNavigator />
          </div>
        ) : activeTab === 'page' ? (
          <div className={styles.panel}>
            <PageSettingsTab
              page={page}
              onPageUpdated={onPageUpdated}
              onVersionConflict={onVersionConflict}
            />
          </div>
        ) : activeTab === 'history' ? (
          <div className={styles.panel}>
            <HistoryPanel />
          </div>
        ) : (
          // `'widgets'` e `'properties'` (quest'ultimo scritto da `selectNode` alla selezione
          // di un blocco, vedi il commento di testa): stesso pannello Widgets, "Proprietà" non
          // ha più una scheda propria qui, vive nella colonna destra fissa.
          <div className={styles.panel}>
            <WidgetSidebar />
          </div>
        )}
      </div>
    </div>
  );
}
