/**
 * Colonna sinistra (ADR-94): `EditorSidebar` + freccina di collasso/espansione (stile
 * Elementor). Sempre montata — smontarla ne perderebbe lo stato interno (`activeSidebarTab`,
 * scroll) e impedirebbe la transizione di `flex-basis`; `styles.sidebarCollapsed` porta la
 * larghezza a 0 mantenendo il nodo nel DOM. La maniglia è fratello dell'`aside` (dentro
 * `.workArea`, `position: relative`), non figlia: a sidebar collassata il contenuto è
 * `overflow: hidden` e la maniglia deve restare cliccabile.
 */
import { ActionIcon } from '@mantine/core';
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import {
  useBlockEditorStore,
  useIsPreviewMode,
  useIsSidebarOpen,
} from '../../../hooks/useBlockEditorStore';
import type { PageRecord } from '../../../types/pages.types';
import EditorSidebar from './sidebar/EditorSidebar';
import styles from './FullScreenEditorLayout.module.css';

/**
 * Larghezza (px) della sidebar aperta, usata per posizionare la maniglia con `left` inline
 * (uno stile inline non legge un CSS Module): va tenuta a mano in sincrono con
 * `EditorSidebar.module.css` `.root` e `FullScreenEditorLayout.module.css` `.sidebar`.
 */
const SIDEBAR_WIDTH = 300;

export interface EditorSidebarShellProps {
  page?: PageRecord;
  onPageUpdated?: (page: PageRecord) => void;
  onVersionConflict?: () => void;
}

export default function EditorSidebarShell({
  page,
  onPageUpdated,
  onVersionConflict,
}: EditorSidebarShellProps): JSX.Element {
  const isPreviewMode = useIsPreviewMode();
  const isSidebarVisible = useIsSidebarOpen() && !isPreviewMode;
  const toggleSidebar = useBlockEditorStore((state) => state.toggleSidebar);

  return (
    <>
      <aside className={`${styles.sidebar} ${isSidebarVisible ? '' : styles.sidebarCollapsed}`}>
        <EditorSidebar
          page={page}
          onPageUpdated={onPageUpdated}
          onVersionConflict={onVersionConflict}
        />
      </aside>
      <ActionIcon
        variant="default"
        size="sm"
        radius="xl"
        className={styles.sidebarToggle}
        style={{ left: isSidebarVisible ? SIDEBAR_WIDTH : 0 }}
        aria-label={isSidebarVisible ? 'Comprimi pannello sinistro' : 'Espandi pannello sinistro'}
        aria-pressed={isSidebarVisible}
        disabled={isPreviewMode}
        onClick={toggleSidebar}
      >
        {isSidebarVisible ? <IconChevronLeft size={14} /> : <IconChevronRight size={14} />}
      </ActionIcon>
    </>
  );
}
