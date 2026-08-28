/**
 * Barra di formattazione ancorata al bordo superiore del blocco `richText` selezionato
 * (T-integrazione-toolbar), distinta da `InlineFloatingToolbar.tsx`: quella segue una
 * selezione di testo *live* dentro il `contentEditable` (mostrata solo mentre il blocco è
 * in editing, `isEditingText`), questa è un'azione rapida "formatta tutto il blocco"
 * visibile appena il nodo è selezionato ma non ancora in editing — le due non sono mai
 * montate insieme sullo stesso nodo (`EditorBlockWrapper.tsx` le rende mutuamente
 * esclusive tramite `isEditingText`), quindi non competono per lo stesso spazio né per lo
 * stesso comando.
 *
 * Chrome dell'editor: Mantine v7 (`Group`/`ActionIcon`/`Tooltip`), come ogni altro overlay
 * di questo file (Handle Bar, `InlineFloatingToolbar`) — mai HTML puro in una superficie
 * amministrativa (CLAUDE.md § Regola Mantine).
 */
import { ActionIcon, Group, Text, Tooltip } from '@mantine/core';
import {
  IconAlignCenter,
  IconAlignLeft,
  IconAlignRight,
  IconBold,
  IconItalic,
  IconLink,
  IconX,
} from '@tabler/icons-react';
import type { TablerIcon } from '@tabler/icons-react';
import styles from './InlineFormattingToolbar.module.css';

export type ToolbarAlign = 'left' | 'center' | 'right';
export type ToolbarFormat = 'bold' | 'italic' | 'link';

export interface InlineFormattingToolbarProps {
  activeAlign: ToolbarAlign;
  isBold: boolean;
  isItalic: boolean;
  onAlignChange: (align: ToolbarAlign) => void;
  onToggleFormat: (format: ToolbarFormat) => void;
  onClose: () => void;
  /** Etichetta del blocco selezionato, mostrata in coda alla barra. */
  blockName?: string;
}

interface ToolbarButtonProps {
  label: string;
  active?: boolean;
  icon: TablerIcon;
  onClick: () => void;
}

/**
 * Pulsante della barra: `onMouseDown` con `preventDefault` (non solo `onClick`) impedisce
 * al bottone di rubare il focus al blocco selezionato prima che il gestore associato abbia
 * potuto leggere lo stato corrente — stesso idioma di `preserveSelection` in
 * `InlineFloatingToolbar.tsx`, qui applicato per coerenza anche se questa barra non segue
 * una selezione di testo viva (punto 2 del task: mai un `blur`/una selezione persa per un
 * click sulla toolbar).
 */
function ToolbarButton({
  label,
  active = false,
  icon: Icon,
  onClick,
}: ToolbarButtonProps): JSX.Element {
  return (
    <Tooltip label={label} withArrow>
      <ActionIcon
        variant={active ? 'filled' : 'subtle'}
        color={active ? 'blue' : 'gray'}
        size="sm"
        aria-label={label}
        aria-pressed={active}
        onMouseDown={(event) => event.preventDefault()}
        onClick={onClick}
      >
        <Icon size={14} stroke={1.8} aria-hidden="true" />
      </ActionIcon>
    </Tooltip>
  );
}

export default function InlineFormattingToolbar({
  activeAlign,
  isBold,
  isItalic,
  onAlignChange,
  onToggleFormat,
  onClose,
  blockName = 'Blocco',
}: InlineFormattingToolbarProps): JSX.Element {
  const alignments: readonly { value: ToolbarAlign; label: string; icon: TablerIcon }[] = [
    { value: 'left', label: 'Allinea a sinistra', icon: IconAlignLeft },
    { value: 'center', label: 'Allinea al centro', icon: IconAlignCenter },
    { value: 'right', label: 'Allinea a destra', icon: IconAlignRight },
  ];

  return (
    <Group
      className={styles.toolbar}
      gap={3}
      wrap="nowrap"
      role="toolbar"
      aria-label="Formattazione del blocco"
      // Il click non deve mai risalire al wrapper del blocco (selezione/deselezione,
      // stesso principio di ogni altro overlay di `EditorBlockWrapper.tsx`).
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <ToolbarButton
        label="Grassetto"
        icon={IconBold}
        active={isBold}
        onClick={() => onToggleFormat('bold')}
      />
      <ToolbarButton
        label="Corsivo"
        icon={IconItalic}
        active={isItalic}
        onClick={() => onToggleFormat('italic')}
      />
      <span className={styles.divider} aria-hidden="true" />
      {alignments.map(({ value, label, icon }) => (
        <ToolbarButton
          key={value}
          label={label}
          icon={icon}
          active={activeAlign === value}
          onClick={() => onAlignChange(value)}
        />
      ))}
      <span className={styles.divider} aria-hidden="true" />
      <ToolbarButton
        label="Inserisci link"
        icon={IconLink}
        onClick={() => onToggleFormat('link')}
      />
      <Text className={styles.blockBadge} size="xs" fw={600} aria-hidden="true">
        {blockName}
      </Text>
      <ActionIcon
        variant="subtle"
        color="gray"
        size="sm"
        aria-label="Chiudi toolbar"
        onMouseDown={(event) => event.preventDefault()}
        onClick={onClose}
      >
        <IconX size={15} stroke={1.8} aria-hidden="true" />
      </ActionIcon>
    </Group>
  );
}
