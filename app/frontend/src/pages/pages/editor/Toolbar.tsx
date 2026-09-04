import { ActionIcon, Badge, Button, Menu, Text, Tooltip } from '@mantine/core';
import {
  IconArrowBackUp,
  IconArrowForwardUp,
  IconArrowLeft,
  IconChevronDown,
  IconDeviceFloppy,
  IconEye,
  IconEyeOff,
} from '@tabler/icons-react';
import type { ReactNode } from 'react';
import type { EditorViewport } from '../../../hooks/useBlockEditorStore';
import {
  PAGE_STATUS_COLORS,
  PAGE_STATUS_LABELS,
  statusActionLabel,
  type PageStatus,
} from '../../../types/pages.types';
import ViewportSelector from './ViewportSelector';
import NotificationBell from '../../../components/NotificationBell';
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
  /** Salva la bozza corrente (`PATCH`, lock ottimistico) — mai una transizione di stato. */
  onSaveDraft: () => void;
  /**
   * Stato corrente della Pagina, per il badge cromatico accanto al titolo — assente quando
   * questo layout ospita il Builder delle Sezioni Globali (ADR-40, nessuna Pagina/stato).
   */
  pageStatus?: PageStatus;
  /**
   * Transizioni ammesse dal ruolo corrente (`visibleTransitionsForRole`, `PagePageDetail.tsx`)
   * per il menu "Cambia Stato" (E01). Vuoto o assente ⇒ il menu resta disabilitato invece di
   * offrire una transizione che il server rifiuterebbe.
   */
  visibleTransitions?: readonly PageStatus[];
  /** True durante una transizione di stato in corso (o un salvataggio metadati nel dettaglio). */
  statusSubmitting?: boolean;
  /**
   * Avvia una transizione verso `target` — la stessa `requestStatusTransition` dietro la
   * tendina di stato dell'intestazione (`PagePageDetail.tsx`): il `ConfirmModal` di conferma
   * (richiesto per ogni transizione, non solo la pubblicazione) e il selettore di data per
   * `scheduled` restano montati lì, non duplicati qui — questo menu è solo un secondo punto
   * da cui invocare la stessa funzione, non una seconda macchina a stati.
   */
  onRequestStatusChange?: (target: PageStatus) => void;
  /**
   * "Anteprima Pura" (E01): nasconde la sidebar sinistra e disattiva i contorni
   * hover/selezione del canvas — stato di chrome effimero (`useBlockEditorStore`), letto e
   * scritto da `FullScreenEditorLayout` e solo passato giù come prop qui, stesso principio
   * di `viewport`/`canUndo` sopra.
   */
  isPreviewMode: boolean;
  onTogglePreviewMode: () => void;
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
  onSaveDraft,
  pageStatus,
  visibleTransitions,
  statusSubmitting,
  onRequestStatusChange,
  isPreviewMode,
  onTogglePreviewMode,
  leadingActions,
  centerActions,
  trailingActions,
}: ToolbarProps): JSX.Element {
  const transitions = visibleTransitions ?? [];
  // Il menu "Cambia Stato" ha senso solo con uno stato noto E un handler per invocarlo
  // (entrambi assenti nel Builder Sezioni Globali, ADR-40) — mai reso con dati inventati.
  const canChangeStatus = pageStatus !== undefined && onRequestStatusChange !== undefined;

  return (
    <header className={styles.root}>
      <div className={styles.section}>
        {/* Logo circolare scuro (restyle Elementor Pro): puramente decorativo, la
            navigazione resta sul link "Torna alla Dashboard" subito accanto. */}
        <span className={styles.logo} aria-hidden="true">
          {BRAND_INITIAL}
        </span>
        <Text size="sm" fw={600} className={styles.pageTitle} title={pageTitle}>
          {pageTitle}
        </Text>
        <NotificationBell />
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
        {pageStatus && (
          <Badge color={PAGE_STATUS_COLORS[pageStatus]} variant="light" size="sm">
            {PAGE_STATUS_LABELS[pageStatus]}
          </Badge>
        )}
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
        <Tooltip label="Anteprima Pura" withArrow>
          <ActionIcon
            variant={isPreviewMode ? 'filled' : 'subtle'}
            size="lg"
            aria-label="Anteprima Pura"
            aria-pressed={isPreviewMode}
            onClick={onTogglePreviewMode}
          >
            {isPreviewMode ? <IconEyeOff size={18} /> : <IconEye size={18} />}
          </ActionIcon>
        </Tooltip>
        {hasUnsavedChanges ? (
          <Badge color="orange" variant="light">
            Modifiche non salvate
          </Badge>
        ) : (
          <Text size="sm" className={styles.savedLabel}>
            Salvato
          </Text>
        )}
        <Button
          variant="default"
          leftSection={<IconDeviceFloppy size={16} />}
          onClick={onSaveDraft}
          loading={saving}
        >
          Salva Bozza
        </Button>
        {/*
          "Cambia Stato" (E01): stesse transizioni/stessa `onRequestStatusChange` della
          tendina di stato dell'intestazione (`PagePageDetail.tsx`) — nessun `ConfirmModal`
          locale, quello esistente lì copre già ogni target (compresa la pubblicazione).
        */}
        <Menu
          shadow="md"
          position="bottom-end"
          withinPortal
          zIndex={1100}
          disabled={!canChangeStatus || statusSubmitting}
        >
          <Menu.Target>
            <Button
              rightSection={<IconChevronDown size={16} />}
              className={styles.publishButton}
              disabled={!canChangeStatus || transitions.length === 0}
              loading={statusSubmitting}
            >
              Cambia Stato
            </Button>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Label>Transizioni ammesse</Menu.Label>
            {transitions.map((target) => (
              <Menu.Item
                key={target}
                color={PAGE_STATUS_COLORS[target]}
                onClick={() => onRequestStatusChange?.(target)}
              >
                {statusActionLabel(target, pageStatus as PageStatus)}
              </Menu.Item>
            ))}
          </Menu.Dropdown>
        </Menu>
      </div>
    </header>
  );
}
