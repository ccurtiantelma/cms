/**
 * Topbar del Template Editor (Theme Builder) dei Template di Sito
 * (`/site-templates/:guid/builder`). Chrome dell'editor → Mantine v7 obbligatorio
 * (CLAUDE.md § Regola Mantine): badge tipo/lingua, switch di viewport simulato
 * (Desktop/Tablet/Mobile), pulsante "Condizioni di Visualizzazione" (apre
 * `DisplayConditionsModal.tsx`, già esistente — non ricostruito qui) e i due pulsanti di
 * scrittura distinti richiesti dal dominio CMS: "Salva Bozza" (`isPublished` invariato) e
 * "Pubblica" (`isPublished: true`), mai un solo pulsante ambiguo.
 *
 * Il pulsante "Chiudi" è un'ancora `<a href="/site-templates">` (non un `Link` di React
 * Router): `useUnsavedChangesGuard` (montato dal chiamante, `PageSiteTemplateBuilder.tsx`)
 * intercetta in fase di cattura ogni `<a href>` interno del documento — stesso principio già
 * in uso in `Toolbar.tsx` (`component="a" href={backHref}`) — così la conferma "modifiche non
 * salvate" resta un'unica logica, mai duplicata qui con un `onClick` a parte.
 */
import { ActionIcon, Badge, Button, Group, SegmentedControl, Text, Tooltip } from '@mantine/core';
import {
  IconAdjustments,
  IconArrowBackUp,
  IconArrowForwardUp,
  IconDeviceDesktop,
  IconDeviceFloppy,
  IconDeviceMobile,
  IconDeviceTablet,
  IconWorldUpload,
  IconX,
} from '@tabler/icons-react';
import type { EditorViewport } from '../../../../hooks/useBlockEditorStore';
import {
  SITE_TEMPLATE_TYPE_LABELS,
  type SiteTemplateType,
} from '../../../../types/site-templates.types';
import styles from './BuilderTopBar.module.css';

export interface BuilderTopBarProps {
  /** Titolo del Template in editing, mostrato accanto al pulsante "Chiudi". */
  title: string;
  /** Tipo del Template (badge, `SITE_TEMPLATE_TYPE_LABELS`). */
  type: SiteTemplateType;
  /** Lingua del Template (badge, codice ISO in maiuscolo). */
  language: string;
  /** L'albero in editing diverge dall'ultimo contenuto salvato — mai un overwrite silenzioso. */
  hasUnsavedChanges: boolean;
  /** Salvataggio (bozza o pubblicazione) in corso — stato `loading` dei due pulsanti di scrittura. */
  saving: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  /** Viewport simulato correntemente nel canvas (`useActiveViewport`/`setActiveViewport`). */
  activeViewport: EditorViewport;
  onViewportChange: (viewport: EditorViewport) => void;
  /** Salva la bozza corrente (`isPublished` invariato — `false` se il Template non è mai stato pubblicato). */
  onSaveDraft: () => void;
  /** Pubblica il Template (`isPublished: true`). */
  onPublish: () => void;
  /** Apre `DisplayConditionsModal.tsx` sul Template corrente. */
  onOpenDisplayConditions: () => void;
}

/** Opzioni del selettore di viewport simulato: valore, etichetta breve, icona, larghezza dichiarata. */
const VIEWPORT_OPTIONS: {
  value: EditorViewport;
  label: string;
  icon: typeof IconDeviceDesktop;
  width: string;
}[] = [
  { value: 'desktop', label: 'Desktop', icon: IconDeviceDesktop, width: '100%' },
  { value: 'tablet', label: 'Tablet', icon: IconDeviceTablet, width: '768px' },
  { value: 'mobile', label: 'Mobile', icon: IconDeviceMobile, width: '375px' },
];

/** Topbar del Template Editor: identità del Template, viewport, salvataggio e chiusura. */
export default function BuilderTopBar({
  title,
  type,
  language,
  hasUnsavedChanges,
  saving,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  activeViewport,
  onViewportChange,
  onSaveDraft,
  onPublish,
  onOpenDisplayConditions,
}: BuilderTopBarProps): JSX.Element {
  return (
    <header className={styles.root}>
      <div className={styles.section}>
        <Tooltip label="Chiudi (torna ai Template di Sito)" withArrow>
          <ActionIcon
            component="a"
            href="/site-templates"
            variant="subtle"
            size="lg"
            aria-label="Chiudi l'editor e torna ai Template di Sito"
          >
            <IconX size={18} />
          </ActionIcon>
        </Tooltip>
        <Text size="sm" fw={600} className={styles.title} title={title}>
          {title}
        </Text>
        <Badge variant="light" color="grape">
          {SITE_TEMPLATE_TYPE_LABELS[type]}
        </Badge>
        <Badge variant="light" color="gray">
          {language.toUpperCase()}
        </Badge>
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
      </div>

      <div className={styles.centerActions}>
        <SegmentedControl
          size="xs"
          value={activeViewport}
          onChange={(value) => onViewportChange(value as EditorViewport)}
          data={VIEWPORT_OPTIONS.map((option) => ({
            value: option.value,
            label: (
              <Tooltip key={option.value} label={`${option.label} — ${option.width}`} withArrow>
                <Group gap={4} wrap="nowrap">
                  <option.icon size={16} />
                  <Text size="xs">{option.label}</Text>
                </Group>
              </Tooltip>
            ),
          }))}
          aria-label="Viewport simulato nel canvas"
        />
      </div>

      <div className={`${styles.section} ${styles.actions}`}>
        <Tooltip label="Condizioni di visualizzazione" withArrow>
          <ActionIcon
            variant="subtle"
            size="lg"
            aria-label="Condizioni di visualizzazione"
            onClick={onOpenDisplayConditions}
          >
            <IconAdjustments size={18} />
          </ActionIcon>
        </Tooltip>

        {hasUnsavedChanges ? (
          <Badge color="orange" variant="light">
            Modifiche non salvate
          </Badge>
        ) : (
          <Text size="sm" c="dimmed">
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

        <Button
          variant="filled"
          color="grape"
          leftSection={<IconWorldUpload size={16} />}
          onClick={onPublish}
          loading={saving}
        >
          Pubblica
        </Button>
      </div>
    </header>
  );
}
