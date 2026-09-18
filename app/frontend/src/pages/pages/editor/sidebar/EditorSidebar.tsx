/**
 * Sidebar sinistra dell'editor full-screen, stile Elementor: "Widgets" (libreria trascinabile,
 * `WidgetPalette`), "Struttura" (albero dei blocchi, `EditorStructureNavigator` — stesso
 * componente del pannello destro toggleabile di `FullScreenEditorLayout`, montato qui in più
 * senza stato duplicato) e "Proprietà" (`PropertyInspector` del blocco selezionato).
 *
 * La scheda attiva vive in `useBlockEditorStore` (`activeSidebarTab`) e non in uno stato
 * locale: deve poter essere cambiata da fuori questo componente. Selezionare un blocco nel
 * canvas (`selectNode`) porta già la sidebar su "Proprietà" da solo — un `useState` qui
 * duplicherebbe quella decisione invece di condividerla con l'azione che la deve poter
 * scavalcare.
 *
 * `Tabs.List` senza `Tabs.Panel`: il contenuto sotto l'header è gestito a mano (un `if`
 * sulla scheda attiva), non dal meccanismo di rendering condizionale di Mantine — serve un
 * contenitore scrollabile indipendente dall'header, che `Tabs.Panel` non offre da solo.
 *
 * Anteprima e "Cambia Stato" non vivono qui: sono nella topbar (`Toolbar.tsx`), in alto a
 * destra — richiesta esplicita del task di riportarli lì dal fondo di questa sidebar.
 */
import { Tabs, Text, Tooltip } from '@mantine/core';
import {
  IconAdjustments,
  IconHistory,
  IconListTree,
  IconSettings,
  IconStack2,
} from '@tabler/icons-react';
import {
  useActiveSidebarTab,
  useBlockEditorStore,
  useSelectedId,
  type EditorSidebarTab,
} from '../../../../hooks/useBlockEditorStore';
import type { PageRecord } from '../../../../types/pages.types';
import PropertyInspector from '../PropertyInspector';
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
  const selectedId = useSelectedId();

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
          <Tooltip label="Proprietà" openDelay={300} withinPortal>
            <Tabs.Tab value="properties" aria-label="Proprietà">
              <IconAdjustments size={20} />
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
        {activeTab === 'widgets' ? (
          <div className={styles.panel}>
            <WidgetSidebar />
          </div>
        ) : activeTab === 'structure' ? (
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
        ) : selectedId === null ? (
          <div className={styles.panel}>
            <Text size="sm" c="dimmed" ta="center" className={styles.emptyState}>
              Seleziona un elemento nel canvas per modificarne le proprietà.
            </Text>
          </div>
        ) : (
          <div className={styles.panel}>
            <PropertyInspector />
          </div>
        )}
      </div>
    </div>
  );
}
