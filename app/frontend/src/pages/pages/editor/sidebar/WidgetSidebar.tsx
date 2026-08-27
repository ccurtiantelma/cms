import type { ReactNode } from 'react';
import WidgetPalette from './WidgetPalette';
import styles from './WidgetSidebar.module.css';

export interface WidgetSidebarProps {
  /** Optional content placed above the widget library, such as a contextual heading. */
  header?: ReactNode;
}

/** Full-height widget panel for the visual builder. */
export default function WidgetSidebar({ header }: WidgetSidebarProps): JSX.Element {
  return (
    <aside className={styles.root} aria-label="Libreria widget">
      {header && <div className={styles.header}>{header}</div>}
      <WidgetPalette />
    </aside>
  );
}
