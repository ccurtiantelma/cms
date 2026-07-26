/**
 * Sostituto di `ColorInput` per i token colore dell'Editor tema: mantiene il
 * pallino con l'anteprima del colore ma toglie il campo esadecimale in chiaro.
 * Il pallino apre una modale con la griglia completa delle 14 palette native
 * Mantine (10 sfumature ciascuna); il tasto tavolozza apre lo stesso popover
 * hue/saturation di `ColorPicker` già usato da `ColorInput`; il tasto contagocce
 * resta l'eyedropper nativo del browser (`useEyeDropper`), mostrato solo se
 * l'API è disponibile — stesso comportamento di `ColorInput`.
 */
import {
  ActionIcon,
  ColorPicker,
  DEFAULT_THEME,
  Group,
  Modal,
  Popover,
  Stack,
  Text,
  Tooltip,
} from '@mantine/core';
import { useDisclosure, useEyeDropper } from '@mantine/hooks';
import { IconColorPicker, IconPalette } from '@tabler/icons-react';
import type { MantinePrimaryColor } from '../../theme';
import classes from './ThemeEditorColorPicker.module.css';

/** Ordine di visualizzazione della griglia (stesso ordine della doc Mantine), non l'ordine di `MANTINE_PRIMARY_COLORS`. */
const COLOR_GRID_ORDER: readonly MantinePrimaryColor[] = [
  'dark',
  'gray',
  'red',
  'pink',
  'grape',
  'violet',
  'indigo',
  'blue',
  'cyan',
  'teal',
  'green',
  'lime',
  'yellow',
  'orange',
];

/** Diametro in px del pallino e degli ActionIcon per ogni size supportata. */
const CONTROL_DIAMETER: Record<'xs' | 'sm' | 'md', number> = { xs: 18, sm: 22, md: 28 };

/** Etichetta leggibile per un nome di palette Mantine (es. "grape" → "Grape"). */
function capitalize(colorName: string): string {
  return colorName.charAt(0).toUpperCase() + colorName.slice(1);
}

/** Nome+shade (es. "Blue 6") per ogni hex delle 14 palette, per il tooltip del pallino. */
const COLOR_NAME_BY_HEX = new Map<string, string>(
  COLOR_GRID_ORDER.flatMap((name) =>
    DEFAULT_THEME.colors[name].map(
      (hex, index) => [hex.toLowerCase(), `${capitalize(name)} ${index}`] as const,
    ),
  ),
);

export interface ThemeEditorColorPickerProps {
  /** Etichetta sopra il controllo (assente = nessuna label, come `ColorInput` senza `label`). */
  label?: string;
  /** Colore corrente in formato hex `#rrggbb`. */
  value: string;
  /** Notifica il nuovo hex selezionato (pallino, tavolozza o contagocce). */
  onChange: (value: string) => void;
  /** Dimensione del controllo, coerente con le altre size del form. */
  size?: 'xs' | 'sm' | 'md';
  /** Etichetta accessibile di base, riusata (con suffisso) per i tre tasti. */
  'aria-label': string;
}

/** Input colore compatto: pallino (griglia palette) + tavolozza (picker) + contagocce. */
export function ThemeEditorColorPicker({
  label,
  value,
  onChange,
  size = 'sm',
  'aria-label': ariaLabel,
}: ThemeEditorColorPickerProps): JSX.Element {
  const [gridOpened, { open: openGrid, close: closeGrid }] = useDisclosure(false);
  const [pickerOpened, { toggle: togglePicker, close: closePicker }] = useDisclosure(false);
  const eyeDropper = useEyeDropper();

  const diameter = CONTROL_DIAMETER[size];
  const iconSize = Math.round(diameter * 0.6);
  const matchedName = COLOR_NAME_BY_HEX.get(value.toLowerCase());
  const triggerTooltip = matchedName ? `${matchedName} · ${value}` : value;

  /** Seleziona un colore dalla griglia: aggiorna il draft e chiude la modale. */
  const handleGridSelect = (hex: string): void => {
    onChange(hex);
    closeGrid();
  };

  /** Avvia l'EyeDropper nativo del browser; annullamento utente = nessuna azione. */
  const handleEyeDropper = async (): Promise<void> => {
    try {
      const result = await eyeDropper.open();
      if (result?.sRGBHex) {
        onChange(result.sRGBHex);
      }
    } catch {
      // Selezione annullata dall'utente (Escape/click fuori): nessun errore da mostrare.
    }
  };

  return (
    <Group justify={label ? 'space-between' : 'flex-end'} align="center" wrap="nowrap" gap="xs">
      {label && (
        <Text size={size} fw={500} truncate style={{ flex: 1, minWidth: 0 }}>
          {label}
        </Text>
      )}

      <Group gap={6} wrap="nowrap" style={{ flexShrink: 0 }}>
        <Tooltip label={triggerTooltip} withArrow>
          <button
            type="button"
            className={classes.trigger}
            style={{ backgroundColor: value, width: diameter, height: diameter }}
            onClick={openGrid}
            aria-label={`${ariaLabel}: apri palette colori Mantine`}
          />
        </Tooltip>

        <Popover opened={pickerOpened} onClose={closePicker} position="bottom-end" shadow="md">
          <Popover.Target>
            <ActionIcon
              variant="default"
              size={diameter}
              onClick={togglePicker}
              aria-label={`${ariaLabel}: apri color picker`}
            >
              <IconPalette size={iconSize} stroke={1.6} />
            </ActionIcon>
          </Popover.Target>
          <Popover.Dropdown>
            <ColorPicker format="hex" value={value} onChange={onChange} />
          </Popover.Dropdown>
        </Popover>

        {eyeDropper.supported && (
          <Tooltip label="Preleva colore dallo schermo" withArrow>
            <ActionIcon
              variant="default"
              size={diameter}
              onClick={() => void handleEyeDropper()}
              aria-label={`${ariaLabel}: preleva colore dallo schermo`}
            >
              <IconColorPicker size={iconSize} stroke={1.6} />
            </ActionIcon>
          </Tooltip>
        )}
      </Group>

      <Modal
        opened={gridOpened}
        onClose={closeGrid}
        title="Palette colori Mantine"
        size="lg"
        centered
      >
        <Stack gap={4}>
          {COLOR_GRID_ORDER.map((name) => (
            <Group key={name} gap={8} wrap="nowrap" align="center">
              <Text size="sm" fw={600} className={classes.colorName}>
                {capitalize(name)}
              </Text>
              <div className={classes.shadeRow}>
                {DEFAULT_THEME.colors[name].map((hex, index) => (
                  <button
                    key={hex}
                    type="button"
                    className={classes.shadeSwatch}
                    style={{ backgroundColor: hex }}
                    onClick={() => handleGridSelect(hex)}
                    aria-label={`${capitalize(name)} ${index}: ${hex}`}
                  >
                    <span className={classes.shadeOverlay}>
                      <span>
                        {capitalize(name)} {index}
                      </span>
                      <span>{hex}</span>
                    </span>
                  </button>
                ))}
              </div>
            </Group>
          ))}
        </Stack>
      </Modal>
    </Group>
  );
}
