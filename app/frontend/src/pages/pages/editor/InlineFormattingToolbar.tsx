/**
 * Barra di formattazione ancorata al bordo superiore del blocco `richText`/`heading`
 * selezionato (T-integrazione-toolbar), distinta da `InlineFloatingToolbar.tsx`: quella segue una
 * selezione di testo *live* dentro il `contentEditable` (mostrata solo mentre il blocco è
 * in editing, `isEditingText`), questa è un'azione rapida "formatta tutto il blocco"
 * visibile appena il nodo è selezionato ma non ancora in editing — le due non sono mai
 * montate insieme sullo stesso nodo (`EditorBlockWrapper.tsx` le rende mutuamente
 * esclusive tramite `isEditingText`), quindi non competono per lo stesso spazio né per lo
 * stesso comando.
 *
 * **Due modalità (`mode`), un solo componente** — non un secondo file duplicato (richiesto
 * esplicitamente dal task): `'text'` (default, invariata) per `richText` — Grassetto/
 * Corsivo/Allineamento/Link — e `'heading'` per `heading` — solo il livello del titolo
 * (H2-H6, mai H1: il registro non lo prevede, `blocks.types.ts`). Le due modalità non
 * condividono controlli (niente Grassetto/Corsivo/Link su `heading`: la sua prop `text` è
 * `plainText` per il registro, SPEC-F02-blocchi.md § 3.3 — cambiarne il markup ne
 * cambierebbe il `kind`, modifica di schema fuori scope, CLAUDE.md § Ask first), quindi un
 * discriminante `mode` con due rami di rendering resta più chiaro di un unico set di props
 * tutte opzionali. `aria-label` del `role="toolbar"` distinto per modalità
 * ("Formattazione del blocco" / "Livello del titolo"): un lettore di schermo non deve mai
 * confondere le due, e nessuna query di test già esistente sull'una intercetta l'altra.
 *
 * Chrome dell'editor: Mantine v7 (`Group`/`ActionIcon`/`Tooltip`), come ogni altro overlay
 * di questo file (Handle Bar, `InlineFloatingToolbar`) — mai HTML puro in una superficie
 * amministrativa (CLAUDE.md § Regola Mantine).
 */
import { ActionIcon, Group, Text, Tooltip } from '@mantine/core';
import {
  IconAlignCenter,
  IconAlignJustified,
  IconAlignLeft,
  IconAlignRight,
  IconBold,
  IconH2,
  IconH3,
  IconH4,
  IconH5,
  IconH6,
  IconItalic,
  IconLink,
  IconX,
} from '@tabler/icons-react';
import type { TablerIcon } from '@tabler/icons-react';
import styles from './InlineFormattingToolbar.module.css';

export type ToolbarAlign = 'left' | 'center' | 'right' | 'justify';
export type ToolbarFormat = 'bold' | 'italic' | 'link';

/** Livelli ammessi per `heading.level` (registro, `blocks.types.ts`): niente `h1`. */
export const HEADING_LEVELS = ['h2', 'h3', 'h4', 'h5', 'h6'] as const;
export type HeadingLevel = (typeof HEADING_LEVELS)[number];

/** Icona per livello, unica fonte per il controllo rapido sotto e per la Handle Bar del wrapper. */
const HEADING_LEVEL_ICON: Record<HeadingLevel, TablerIcon> = {
  h2: IconH2,
  h3: IconH3,
  h4: IconH4,
  h5: IconH5,
  h6: IconH6,
};

interface InlineFormattingToolbarTextProps {
  mode?: 'text';
  activeAlign: ToolbarAlign;
  isBold: boolean;
  isItalic: boolean;
  onAlignChange: (align: ToolbarAlign) => void;
  onToggleFormat: (format: ToolbarFormat) => void;
  onClose: () => void;
  /** Etichetta del blocco selezionato, mostrata in coda alla barra. */
  blockName?: string;
}

interface InlineFormattingToolbarHeadingProps {
  mode: 'heading';
  headingLevel: HeadingLevel;
  onLevelChange: (level: HeadingLevel) => void;
  onClose: () => void;
  /** Etichetta del blocco selezionato, mostrata in coda alla barra. */
  blockName?: string;
}

export type InlineFormattingToolbarProps =
  | InlineFormattingToolbarTextProps
  | InlineFormattingToolbarHeadingProps;

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

/** Bottone "Chiudi", identico nelle due modalità — unico elemento davvero condiviso oltre al badge. */
function CloseButton({ onClose }: { onClose: () => void }): JSX.Element {
  return (
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
  );
}

export default function InlineFormattingToolbar(
  props: InlineFormattingToolbarProps,
): JSX.Element {
  if (props.mode === 'heading') {
    const { headingLevel, onLevelChange, onClose, blockName = 'Titolo' } = props;
    return (
      <Group
        className={styles.toolbar}
        gap={3}
        wrap="nowrap"
        role="toolbar"
        aria-label="Livello del titolo"
        // Il click non deve mai risalire al wrapper del blocco (selezione/deselezione,
        // stesso principio della modalità testo sotto).
        onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
      >
        {HEADING_LEVELS.map((level) => (
          <ToolbarButton
            key={level}
            label={`Titolo ${level.toUpperCase()}`}
            icon={HEADING_LEVEL_ICON[level]}
            active={headingLevel === level}
            onClick={() => onLevelChange(level)}
          />
        ))}
        <Text className={styles.blockBadge} size="xs" fw={600} aria-hidden="true">
          {blockName}
        </Text>
        <CloseButton onClose={onClose} />
      </Group>
    );
  }

  const {
    activeAlign,
    isBold,
    isItalic,
    onAlignChange,
    onToggleFormat,
    onClose,
    blockName = 'Blocco',
  } = props;

  const alignments: readonly { value: ToolbarAlign; label: string; icon: TablerIcon }[] = [
    { value: 'left', label: 'Allinea a sinistra', icon: IconAlignLeft },
    { value: 'center', label: 'Allinea al centro', icon: IconAlignCenter },
    { value: 'right', label: 'Allinea a destra', icon: IconAlignRight },
    { value: 'justify', label: 'Allinea giustificato', icon: IconAlignJustified },
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
      <CloseButton onClose={onClose} />
    </Group>
  );
}
