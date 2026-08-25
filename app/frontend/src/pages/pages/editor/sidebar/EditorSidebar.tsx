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
import { IconAdjustments, IconStack2 } from '@tabler/icons-react';
import {
  useActiveSidebarTab,
  useBlockEditorStore,
  useSelectedId,
  type EditorSidebarTab,
} from '../../../../hooks/useBlockEditorStore';
import PropertyInspector from '../PropertyInspector';
import WidgetPalette from './WidgetPalette';
import styles from './EditorSidebar.module.css';

/** Sidebar a schede Widgets/Proprietà dell'editor full-screen. */
export default function EditorSidebar(): JSX.Element {
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
        </Tabs.List>
      </Tabs>

      <div className={styles.content}>
        {activeTab === 'widgets' ? (
          <WidgetPalette />
        ) : selectedId === null ? (
          <Text size="sm" c="dimmed" ta="center" className={styles.emptyState}>
            Seleziona un elemento nel canvas per modificarne le proprietà.
          </Text>
        ) : (
          <PropertyInspector />
        )}
      </div>
    </div>
  );
}
