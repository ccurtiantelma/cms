/**
 * Controllo colore unico dell'Inspector (3ª scheda "Modifica", ADR-94): un solo pallino
 * cliccabile che apre un `Popover` con due sezioni — "Colori del Tema" in alto (preset
 * cliccabili, forniti dal chiamante) e "Colore personalizzato" in basso (`ColorPicker`
 * Mantine hue/saturation + swatch standard + eyedropper + input hex a testo libero).
 *
 * Sostituisce, in `ColorField.tsx`/`BackgroundField.tsx`/`PropField.tsx` (`case 'color'`)/
 * `BorderField.tsx`/`ShadowField.tsx`, le file di icone ridondanti oggi affiancate ai campi
 * (`ColorInput` + swatch di sistema separati, oppure `ThemeEditorColorPicker` + un secondo
 * `Popover`/`ActionIcon` `IconWorld` per i preset del tema) con un solo trigger.
 *
 * Il chiamante decide la fonte dei preset (`themePresets`): i due mondi esistenti — i 4 id di
 * sistema del Global Kit (ADR-77 § 2, solo per `ColorField`) e le 5 voci del tema live
 * (`useThemeColorStore`, per gli altri) — non vengono fusi in un catalogo unico, coerente col
 * debito già dichiarato nei rispettivi file chiamanti.
 *
 * Pattern draft/`onChangeEnd` ripreso da `ThemeEditorColorPicker.tsx` (vedi il suo commento a
 * riga 86-92): `onChange` del genitore scrive nello store e apre un punto di undo/redo ad ogni
 * chiamata — committerlo ad ogni pixel di trascinamento del `ColorPicker` renderizzerebbe
 * l'intero albero blocchi ad ogni frame. Il draft locale assorbe il drag, solo `onChangeEnd`
 * (rilascio o tastiera) inoltra il valore finale al genitore.
 */
import { useEffect, useState } from 'react';
import {
  ActionIcon,
  ColorPicker,
  DEFAULT_THEME,
  Divider,
  Group,
  Popover,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core';
import { useDisclosure, useEyeDropper } from '@mantine/hooks';
import { IconColorPicker } from '@tabler/icons-react';
import { HEX_COLOR_PATTERN } from './inspector.utils';
import styles from './inspector.module.css';

/** Diametro in px del pallino trigger per ogni size supportata, coerente col resto dell'Inspector. */
const TRIGGER_DIAMETER: Record<'xs' | 'sm' | 'md', number> = { xs: 18, sm: 22, md: 28 };

/** Riga di swatch standard Mantine (shade 6 di ogni palette nativa), stesso principio di
 * "palette colori standard" già consumato da `ThemeEditorColorPicker.tsx` per la sua griglia,
 * qui in forma piatta (un `ColorPicker.swatches` è una lista, non una griglia per nome). */
const STANDARD_SWATCHES: readonly string[] = Object.values(DEFAULT_THEME.colors).map(
  (shades) => shades[6],
);

export interface ThemeColorPickerPreset {
  id: string;
  label: string;
  hex: string;
}

export interface ThemeColorPickerProps {
  /** Etichetta sopra il controllo (assente = nessuna label). */
  label?: string;
  /** Etichetta accessibile di base del pallino trigger. */
  'aria-label': string;
  /** Dimensione del controllo, coerente con le altre size del form. */
  size?: 'xs' | 'sm' | 'md';
  /** Hex corrente mostrato dal pallino. */
  value: string;
  /** `id` del preset attivo quando il valore corrente è un riferimento dinamico (solo
   * `ColorField`, `{ ref }` del Global Kit) — evidenzia quel preset nella sezione tema. */
  activeRefId?: string | null;
  /** Preset della sezione "Colori del Tema" — la fonte è decisa dal chiamante. */
  themePresets: readonly ThemeColorPickerPreset[];
  /** Click su un preset: il popover si chiude subito dopo. */
  onSelectPreset: (id: string, hex: string) => void;
  /** Commit di un colore personalizzato (drag end del picker, eyedropper, submit dell'hex). */
  onChange: (hex: string) => void;
  /** `format` del `ColorPicker` interno: `hexa` se il campo ammette il canale alpha. */
  allowAlpha?: boolean;
}

/** Rende il pallino trigger + popover unico "Colori del Tema"/"Colore personalizzato". Vedi il commento di testa del file. */
export default function ThemeColorPicker({
  label,
  'aria-label': ariaLabel,
  size = 'sm',
  value,
  activeRefId = null,
  themePresets,
  onSelectPreset,
  onChange,
  allowAlpha = false,
}: ThemeColorPickerProps): JSX.Element {
  const [opened, { toggle, close }] = useDisclosure(false);
  const eyeDropper = useEyeDropper();

  // Stesso pattern draft/onChangeEnd di ThemeEditorColorPicker.tsx (vedi commento di testa):
  // il drag del ColorPicker resta locale, solo il rilascio commette al genitore.
  const [draftValue, setDraftValue] = useState(value);
  const [hexInput, setHexInput] = useState(value);
  useEffect(() => {
    setDraftValue(value);
    setHexInput(value);
  }, [value]);

  const diameter = TRIGGER_DIAMETER[size];
  const iconSize = Math.round(diameter * 0.6);

  function handleSelectPreset(id: string, hex: string): void {
    onSelectPreset(id, hex);
    close();
  }

  function commitHexInput(): void {
    const trimmed = hexInput.trim();
    if (trimmed === '') return;
    // Formato hex semplice: valida con lo stesso pattern UX degli altri campi `color`
    // (`inspector.utils.ts`), altrimenti passa il valore grezzo (es. `rgba(...)`) e lascia
    // fare al validator server-side — stesso principio di `uxError`.
    if (!HEX_COLOR_PATTERN.test(trimmed) && !allowAlpha) return;
    onChange(trimmed);
  }

  async function handleEyeDropper(): Promise<void> {
    try {
      const result = await eyeDropper.open();
      if (result?.sRGBHex) {
        onChange(result.sRGBHex);
      }
    } catch {
      // Selezione annullata dall'utente (Escape/click fuori): nessun errore da mostrare.
    }
  }

  return (
    <Group justify={label ? 'space-between' : 'flex-end'} align="center" wrap="nowrap" gap="xs">
      {label && (
        <Text size={size} fw={500} truncate style={{ flex: 1, minWidth: 0 }}>
          {label}
        </Text>
      )}
      <Popover
        opened={opened}
        onClose={close}
        position="bottom-end"
        shadow="md"
        withinPortal
        zIndex={1100}
      >
        <Popover.Target>
          <Tooltip label={value} withArrow>
            <button
              type="button"
              className={styles.colorSwatchButton}
              style={{ backgroundColor: value, width: diameter, height: diameter }}
              onClick={toggle}
              aria-label={ariaLabel}
            />
          </Tooltip>
        </Popover.Target>
        <Popover.Dropdown>
          <Stack gap={8} miw={220}>
            <Text size="sm" fw={600}>
              Colori del Tema
            </Text>
            <Group gap={6}>
              {themePresets.map((preset) => (
                <Tooltip key={preset.id} label={`${preset.label} - ${preset.hex}`} withArrow>
                  <button
                    type="button"
                    aria-label={`${preset.label} - ${preset.hex}`}
                    aria-pressed={preset.id === activeRefId}
                    className={
                      preset.id === activeRefId
                        ? `${styles.colorSwatchButton} ${styles.colorSwatchButtonActive}`
                        : styles.colorSwatchButton
                    }
                    style={{
                      backgroundColor: preset.hex,
                      borderRadius: '50%',
                      width: 22,
                      height: 22,
                    }}
                    onClick={() => handleSelectPreset(preset.id, preset.hex)}
                  />
                </Tooltip>
              ))}
            </Group>

            <Divider />

            <Text size="sm" fw={600}>
              Colore personalizzato
            </Text>
            <Group align="flex-start" wrap="nowrap" gap={8}>
              <ColorPicker
                format={allowAlpha ? 'hexa' : 'hex'}
                value={draftValue}
                swatches={[...STANDARD_SWATCHES]}
                onChange={setDraftValue}
                onChangeEnd={onChange}
                style={{ flex: 1 }}
              />
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
            <TextInput
              size="xs"
              aria-label={`${ariaLabel}: valore esadecimale`}
              value={hexInput}
              onChange={(event) => setHexInput(event.currentTarget.value)}
              onBlur={commitHexInput}
              onKeyDown={(event) => {
                if (event.key === 'Enter') commitHexInput();
              }}
            />
          </Stack>
        </Popover.Dropdown>
      </Popover>
    </Group>
  );
}
