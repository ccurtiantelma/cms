import { ActionIcon, Badge, Button, Menu, Text, Tooltip } from '@mantine/core';
import {
  IconArrowBackUp,
  IconArrowForwardUp,
  IconArrowLeft,
  IconChevronDown,
  IconDeviceFloppy,
  IconEye,
} from '@tabler/icons-react';
import type { ReactNode } from 'react';
import type { ResponsiveBreakpointName } from '../../../types/blocks.types';
import {
  PAGE_STATUS_COLORS,
  PAGE_STATUS_LABELS,
  statusActionLabel,
  type PageStatus,
} from '../../../types/pages.types';
import BreakpointSwitcher from './BreakpointSwitcher';
import styles from './Toolbar.module.css';

export interface ToolbarProps {
  pageTitle: string;
  backHref: string;
  /** Breakpoint a 7 vie (ADR-76) correntemente simulato dal canvas (`useActiveBreakpoint()`). */
  activeBreakpoint: ResponsiveBreakpointName;
  /** Invocata col nome del breakpoint scelto nello switcher (`setActiveBreakpoint`). */
  onBreakpointChange: (breakpoint: ResponsiveBreakpointName) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  hasUnsavedChanges: boolean;
  saving: boolean;
  /** Salva la bozza corrente (`PATCH`, lock ottimistico) — mai una transizione di stato. */
  onSaveDraft: () => void;
  onSaveAsTemplate?: () => void;
  templateSaving?: boolean;
  /**
   * Stato corrente della Pagina, per il badge cromatico accanto al titolo e per il menu
   * "Cambia Stato" a destra — assente quando questo layout ospita il Builder delle Sezioni
   * Globali (ADR-40, nessuna Pagina/stato).
   */
  pageStatus?: PageStatus;
  /**
   * Genera e apre l'anteprima della Pagina in una nuova scheda (ADR-25). `undefined` quando
   * la Pagina non è in bozza, o quando manca del tutto (Builder Sezioni Globali): l'icona
   * "occhio" non compare invece di offrire un'azione senza effetto. Sostituisce il vecchio
   * comportamento di questo stesso pulsante ("Anteprima Pura", nascondeva la sidebar) —
   * richiesta esplicita del task: l'occhio non deve più aprire/chiudere la sidebar, deve
   * aprire l'anteprima reale.
   */
  onPreview?: () => void;
  /** Stato di caricamento della generazione del token di anteprima. */
  previewLoading?: boolean;
  /**
   * Transizioni ammesse dal ruolo corrente per il menu "Cambia Stato" — vuoto/assente ⇒ il
   * pulsante resta disabilitato invece di offrire una transizione che il server rifiuterebbe.
   */
  visibleTransitions?: readonly PageStatus[];
  /** True durante una transizione di stato in corso. */
  statusSubmitting?: boolean;
  /** Avvia una transizione verso `target` (stessa `requestStatusTransition` del dettaglio). */
  onRequestStatusChange?: (target: PageStatus) => void;
  leadingActions?: ReactNode;
  centerActions?: ReactNode;
  trailingActions?: ReactNode;
}

export default function Toolbar({
  pageTitle,
  backHref,
  activeBreakpoint,
  onBreakpointChange,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  hasUnsavedChanges,
  saving,
  onSaveDraft,
  onSaveAsTemplate,
  templateSaving,
  pageStatus,
  onPreview,
  previewLoading,
  visibleTransitions,
  statusSubmitting,
  onRequestStatusChange,
  leadingActions,
  centerActions,
  trailingActions,
}: ToolbarProps): JSX.Element {
  const transitions = visibleTransitions ?? [];
  // Il menu ha senso solo con uno stato noto E un handler per invocarlo (entrambi assenti nel
  // Builder Sezioni Globali, ADR-40) — mai reso con dati inventati.
  const canChangeStatus = pageStatus !== undefined && onRequestStatusChange !== undefined;
  return (
    <header className={styles.root} aria-label={pageTitle}>
      <div className={styles.section}>
        <Tooltip label="Torna alla Dashboard" withArrow>
          <ActionIcon
            component="a"
            href={backHref}
            variant="subtle"
            size="lg"
            aria-label="Torna alla Dashboard"
          >
            <IconArrowLeft size={18} />
          </ActionIcon>
        </Tooltip>
        <Tooltip label="Annulla (Ctrl+Z)" withArrow>
          <ActionIcon
            variant="subtle"
            size="lg"
            aria-label="Annulla l'ultima modifica"
            disabled={!canUndo}
            onClick={onUndo}
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
            onClick={onRedo}
          >
            <IconArrowForwardUp size={16} />
          </ActionIcon>
        </Tooltip>
        {leadingActions}
      </div>

      <div className={styles.centerActions}>
        {centerActions}
        {pageStatus && (
          <Badge color={PAGE_STATUS_COLORS[pageStatus]} variant="filled" size="sm">
            {PAGE_STATUS_LABELS[pageStatus]}
          </Badge>
        )}
        <BreakpointSwitcher value={activeBreakpoint} onBreakpointChange={onBreakpointChange} />
        {hasUnsavedChanges ? (
          <Badge color="orange" variant="light">
            Modifiche non salvate
          </Badge>
        ) : (
          <Text size="sm" className={styles.savedLabel}>
            Salvato
          </Text>
        )}
      </div>

      <div className={`${styles.section} ${styles.actions}`}>
        {trailingActions}
        {pageStatus !== undefined && (
          <Tooltip
            label={onPreview ? 'Anteprima' : 'Anteprima disponibile solo per le bozze'}
            withArrow
          >
            <ActionIcon
              variant="subtle"
              size="lg"
              aria-label="Anteprima"
              loading={previewLoading}
              disabled={!onPreview}
              onClick={onPreview}
            >
              <IconEye size={18} />
            </ActionIcon>
          </Tooltip>
        )}
        {/*
          Menu "Cambia Stato" (restyle Elementor): stesso pulsante di stato/pubblicazione già
          in uso, spostato qui in alto a destra (richiesta esplicita del task — non più in
          fondo alla sidebar sinistra). Bordi squadrati e altezza piena della topbar (48px),
          flush contro il bordo destro — `.statusGroup` in `Toolbar.module.css` annulla il
          padding di `.root` con un margine negativo, invece di un secondo contenitore fuori
          da questo `header`.
        */}
        <Menu
          shadow="md"
          position="bottom-end"
          withinPortal
          zIndex={1100}
          disabled={!canChangeStatus || statusSubmitting}
        >
          <Menu.Target>
            <Button.Group className={styles.statusGroup}>
              <Button
                className={styles.publishButton}
                disabled={!canChangeStatus || !transitions.includes('published')}
                loading={statusSubmitting}
                onClick={() => onRequestStatusChange?.('published')}
              >
                Pubblica
              </Button>
              <ActionIcon
                variant="filled"
                size="lg"
                className={styles.publishChevron}
                disabled={!canChangeStatus || transitions.length === 0}
                aria-label="Altre opzioni di pubblicazione"
              >
                <IconChevronDown size={16} />
              </ActionIcon>
            </Button.Group>
          </Menu.Target>
          <Menu.Dropdown className={styles.statusDropdown}>
            <Menu.Item
              leftSection={<IconDeviceFloppy size={16} />}
              onClick={onSaveDraft}
              disabled={saving}
            >
              Salva bozza
            </Menu.Item>
            {onSaveAsTemplate && (
              <Menu.Item onClick={onSaveAsTemplate} disabled={templateSaving}>
                Salva come template
              </Menu.Item>
            )}
            {transitions.map((target) =>
              target === 'published' ? null : (
                <Menu.Item
                  key={target}
                  color={PAGE_STATUS_COLORS[target]}
                  onClick={() => onRequestStatusChange?.(target)}
                >
                  {target === 'scheduled'
                    ? 'Programma'
                    : statusActionLabel(target, pageStatus as PageStatus)}
                </Menu.Item>
              ),
            )}
          </Menu.Dropdown>
        </Menu>
      </div>
    </header>
  );
}
