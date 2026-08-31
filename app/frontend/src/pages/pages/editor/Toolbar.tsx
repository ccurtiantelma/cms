import { ActionIcon, Badge, Button, Text, Tooltip } from '@mantine/core';
import {
  IconArrowBackUp,
  IconArrowForwardUp,
  IconArrowLeft,
  IconDeviceFloppy,
} from '@tabler/icons-react';
import type { ReactNode } from 'react';
import type { EditorViewport } from '../../../hooks/useBlockEditorStore';
import ViewportSelector from './ViewportSelector';
import styles from './Toolbar.module.css';

/**
 * Sigla del logo della topbar (restyle Elementor Pro, richiesta esplicita del task): un
 * solo carattere in un cerchio scuro, coerente col logo circolare "e" di Elementor Pro —
 * nessun asset immagine importato solo per questo (nessuna dipendenza nuova, CLAUDE.md §
 * "Ask first" sulle nuove dipendenze).
 */
const BRAND_INITIAL = 'E';

export interface ToolbarProps {
  pageTitle: string;
  backHref: string;
  viewport: EditorViewport;
  onViewportChange: (viewport: EditorViewport) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  hasUnsavedChanges: boolean;
  saving: boolean;
  onPublish: () => void;
  leadingActions?: ReactNode;
  centerActions?: ReactNode;
  trailingActions?: ReactNode;
}

export default function Toolbar({
  pageTitle,
  backHref,
  viewport,
  onViewportChange,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  hasUnsavedChanges,
  saving,
  onPublish,
  leadingActions,
  centerActions,
  trailingActions,
}: ToolbarProps): JSX.Element {
  return (
    <header className={styles.root}>
      <div className={styles.section}>
        {/* Logo circolare scuro (restyle Elementor Pro): puramente decorativo, la
            navigazione resta sul link "Torna alla Dashboard" subito accanto. */}
        <span className={styles.logo} aria-hidden="true">
          {BRAND_INITIAL}
        </span>
        <Tooltip label="Torna alla Dashboard" withArrow>
          <ActionIcon component="a" href={backHref} variant="subtle" size="lg" aria-label="Torna alla Dashboard">
            <IconArrowLeft size={18} />
          </ActionIcon>
        </Tooltip>
        <Text size="sm" fw={600} className={styles.pageTitle} title={pageTitle}>
          {pageTitle}
        </Text>
        <Tooltip label="Annulla (Ctrl+Z)" withArrow>
          <ActionIcon variant="subtle" size="lg" aria-label="Annulla l'ultima modifica" disabled={!canUndo} onClick={onUndo}>
            <IconArrowBackUp size={16} />
          </ActionIcon>
        </Tooltip>
        <Tooltip label="Ripristina (Ctrl+Shift+Z)" withArrow>
          <ActionIcon variant="subtle" size="lg" aria-label="Ripristina la modifica annullata" disabled={!canRedo} onClick={onRedo}>
            <IconArrowForwardUp size={16} />
          </ActionIcon>
        </Tooltip>
        {leadingActions}
      </div>

      <div className={styles.centerActions}>
        {centerActions}
        <ViewportSelector
          value={viewport}
          onViewportChange={(width) => {
            const nextViewport: EditorViewport =
              width === '768px' ? 'tablet' : width === '375px' ? 'mobile' : 'desktop';
            onViewportChange(nextViewport);
          }}
        />
      </div>

      <div className={`${styles.section} ${styles.actions}`}>
        {trailingActions}
        {hasUnsavedChanges ? (
          <Badge color="orange" variant="light">Modifiche non salvate</Badge>
        ) : (
          <Text size="sm" className={styles.savedLabel}>Salvato</Text>
        )}
        <Button
          leftSection={<IconDeviceFloppy size={16} />}
          onClick={onPublish}
          loading={saving}
          className={styles.publishButton}
        >
          Pubblica
        </Button>
      </div>
    </header>
  );
}
