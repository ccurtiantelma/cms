/**
 * Sidebar sinistra dell'editor full-screen, stile Elementor: due schede, "Widgets" (libreria
 * trascinabile, `WidgetPalette`) e "Proprietà" (`PropertyInspector` del blocco selezionato).
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
 */
import { Tabs, Text } from '@mantine/core';
import { IconAdjustments, IconSettings, IconStack2 } from '@tabler/icons-react';
import {
  useActiveSidebarTab,
  useBlockEditorStore,
  useSelectedId,
  type EditorSidebarTab,
} from '../../../../hooks/useBlockEditorStore';
import type { PageRecord } from '../../../../types/pages.types';
import PropertyInspector from '../PropertyInspector';
import WidgetSidebar from './WidgetSidebar';
import PageSettingsTab from './PageSettingsTab';
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
          <Tabs.Tab value="widgets" leftSection={<IconStack2 size={16} />}>
            Widgets
          </Tabs.Tab>
          <Tabs.Tab value="properties" leftSection={<IconAdjustments size={16} />}>
            Proprietà
          </Tabs.Tab>
          <Tabs.Tab value="page" leftSection={<IconSettings size={16} />}>
            Pagina
          </Tabs.Tab>
        </Tabs.List>
      </Tabs>

      <div className={styles.content}>
        {activeTab === 'widgets' ? (
          <div className={styles.panel}>
            <WidgetSidebar />
          </div>
        ) : activeTab === 'page' ? (
          <div className={styles.panel}>
            <PageSettingsTab
              page={page}
              onPageUpdated={onPageUpdated}
              onVersionConflict={onVersionConflict}
            />
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
