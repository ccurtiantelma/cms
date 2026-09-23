/**
 * Colonna sinistra (ADR-94): `EditorSidebar`. Sempre montata — smontarla ne perderebbe lo
 * stato interno (`activeSidebarTab`, scroll) e impedirebbe la transizione di `flex-basis`;
 * `styles.sidebarCollapsed` porta la larghezza a 0 mantenendo il nodo nel DOM.
 *
 * La maniglia di collasso/espansione non vive più qui (richiesta esplicita del task): è stata
 * spostata nella topbar (`Toolbar.tsx`, in alto a sinistra, subito prima del toggle
 * Header/Footer) — vedi `FullScreenEditorLayout.tsx` per il cablaggio di `toggleSidebar`.
 */
import { useIsPreviewMode, useIsSidebarOpen } from '../../../hooks/useBlockEditorStore';
import type { PageRecord } from '../../../types/pages.types';
import EditorSidebar from './sidebar/EditorSidebar';
import styles from './FullScreenEditorLayout.module.css';

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

  return (
    <aside className={`${styles.sidebar} ${isSidebarVisible ? '' : styles.sidebarCollapsed}`}>
      <EditorSidebar
        page={page}
        onPageUpdated={onPageUpdated}
        onVersionConflict={onVersionConflict}
      />
    </aside>
  );
}
