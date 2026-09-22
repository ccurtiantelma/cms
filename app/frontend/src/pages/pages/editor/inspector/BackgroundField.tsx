/**
 * Controllo Mantine per `kind: 'background'` (ADR-96 § "Decisione" punto 1), scope limitato a
 * `type: 'none' | 'color' | 'gradient'` — stesso scope del compilatore CSS (`ADR-96` § punto 2/3,
 * `backgroundToDeclarations()` server-side + mirror `generateCanvasCss.ts`). `image`/`video`/
 * `slideshow` restano valori validi per lo schema ma senza alcun controllo dedicato in questo
 * round (nessun effetto visivo, `ADR-96` § "Conseguenze") — non selezionabili da questo
 * `SegmentedControl`, coerente con l'`UnderConstruction` che resta per `border`/`shadow`.
 *
 * Stato (`stateful`, ADR-75) letto/scritto con le utility generiche di `inspector.utils.ts` —
 * mai `responsive` (`background` non lo dichiara nel registro, `container.block.ts`), quindi il
 * breakpoint passato a {@link buildStatefulResponsivePropPatch}/{@link readStatefulResponsiveValue}
 * è ininfluente (letto da `useActiveBreakpoint()` solo per uniformità di firma con `ColorField`).
 *
 * `type: 'gradient'`: editor minimale di `GradientValue` (SPEC-PROPKIND-V2-DETAILS.md § 6) —
 * tipo lineare/radiale, angolo (lineare) o posizione libera (radiale), lista di stop colore/
 * percentuale con aggiunta/rimozione (minimo 2 stop, coerente con un gradiente CSS sensato).
 */
import {
  ActionIcon,
  Group,
  NumberInput,
  SegmentedControl,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import type { BlockPropDescriptor, PropStateName } from '../../../../types/blocks.types';
import { useActiveBreakpoint } from '../../../../hooks/useBlockEditorStore';
import StateSwitcher from './StateSwitcher';
import { useEditingState } from './editingState';
import {
  buildStatefulResponsivePropPatch,
  propLabel,
  readStatefulResponsiveValue,
  useThemeColorPresets,
  type PropsMeta,
} from './inspector.utils';
import ThemeColorPicker from './ThemeColorPicker';
import styles from './inspector.module.css';

type ColorRefLike = string | { ref: string };

interface GradientStopLike {
  color: ColorRefLike;
  at: number;
}

interface GradientLike {
  type: 'linear' | 'radial';
  angle?: number;
  position?: string;
  stops: GradientStopLike[];
}

type BackgroundType = 'none' | 'color' | 'gradient' | 'image' | 'video' | 'slideshow';

interface BackgroundLike {
  type: BackgroundType;
  color?: ColorRefLike;
  gradient?: GradientLike;
}

const TYPE_OPTIONS: { value: BackgroundType; label: string }[] = [
  { value: 'none', label: 'Nessuno' },
  { value: 'color', label: 'Colore' },
  { value: 'gradient', label: 'Gradiente' },
];

const DEFAULT_GRADIENT: GradientLike = {
  type: 'linear',
  angle: 180,
  stops: [
    { color: '#000000', at: 0 },
    { color: '#ffffff', at: 100 },
  ],
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Hex leggibile da un `ColorRefValue`: un `{ ref }` non ha un hex noto qui (nessun catalogo
 * Global Kit disponibile in questo controllo, stesso debito dichiarato da `ColorField.tsx`),
 * quindi ricade su nero solo per non lasciare `ColorInput` senza valore. */
function colorRefToHex(value: ColorRefLike | undefined): string {
  return typeof value === 'string' ? value : '#000000';
}

export interface BackgroundFieldProps {
  prop: BlockPropDescriptor;
  /** Valore grezzo corrente della prop (`node.props[prop.name]`), mai già risolto a scalare. */
  value: unknown;
  propsMeta: PropsMeta;
  /** Scrive l'intero valore della prop nello store (stesso canale di ogni altro `kind`). */
  onSetAndCommit: (value: unknown) => void;
}

/** Rende il controllo di `kind: 'background'`. Vedi il commento di testa del file. */
export default function BackgroundField({
  prop,
  value,
  propsMeta,
  onSetAndCommit,
}: BackgroundFieldProps): JSX.Element {
  const label = propLabel(prop, propsMeta);
  const activeBreakpoint = useActiveBreakpoint();
  const { editingState, setEditingState, hasPanelSwitcher } = useEditingState();
  const state: PropStateName = prop.stateful ? editingState : 'normal';
  const themePresets = useThemeColorPresets();

  const rawValue = readStatefulResponsiveValue(prop, value, state, activeBreakpoint);
  const current: BackgroundLike = isPlainObject(rawValue)
    ? (rawValue as unknown as BackgroundLike)
    : { type: 'none' };
  const backgroundType = current.type ?? 'none';

  function write(next: BackgroundLike): void {
    onSetAndCommit(buildStatefulResponsivePropPatch(prop, value, state, activeBreakpoint, next));
  }

  function writeType(nextType: BackgroundType): void {
    if (nextType === 'color') {
      write({ type: 'color', color: current.color ?? '#000000' });
      return;
    }
    if (nextType === 'gradient') {
      write({ type: 'gradient', gradient: current.gradient ?? DEFAULT_GRADIENT });
      return;
    }
    write({ type: 'none' });
  }

  function writeGradient(nextGradient: GradientLike): void {
    write({ type: 'gradient', gradient: nextGradient });
  }

  const gradient = current.gradient ?? DEFAULT_GRADIENT;

  function writeStop(index: number, nextStop: GradientStopLike): void {
    const stops = gradient.stops.map((stop, i) => (i === index ? nextStop : stop));
    writeGradient({ ...gradient, stops });
  }

  function addStop(): void {
    const lastAt = gradient.stops[gradient.stops.length - 1]?.at ?? 100;
    writeGradient({
      ...gradient,
      stops: [...gradient.stops, { color: '#ffffff', at: Math.min(100, lastAt) }],
    });
  }

  function removeStop(index: number): void {
    if (gradient.stops.length <= 2) return; // un gradiente resta sempre almeno a 2 stop.
    writeGradient({ ...gradient, stops: gradient.stops.filter((_, i) => i !== index) });
  }

  return (
    <Stack gap={6}>
      {prop.stateful && !hasPanelSwitcher && (
        <Group justify="flex-end">
          <StateSwitcher value={editingState} onChange={setEditingState} />
        </Group>
      )}
      <Text size="sm" fw={500}>
        {label}
      </Text>
      <SegmentedControl
        fullWidth
        aria-label={`${label} — Tipo`}
        data={TYPE_OPTIONS.filter(
          (option) =>
            option.value === 'none' || option.value === 'color' || option.value === 'gradient',
        )}
        value={
          backgroundType === 'image' || backgroundType === 'video' || backgroundType === 'slideshow'
            ? 'none'
            : backgroundType
        }
        onChange={(next) => writeType(next as BackgroundType)}
      />

      {backgroundType === 'color' && (
        <div className={styles.fieldRow}>
          <Group gap={6} wrap="nowrap" className={styles.fieldRowLabel}>
            <Text size="sm">Colore di sfondo</Text>
          </Group>
          <ThemeColorPicker
            aria-label={`${label} — Colore`}
            value={colorRefToHex(current.color)}
            themePresets={themePresets}
            onSelectPreset={(_, hex) => write({ type: 'color', color: hex })}
            onChange={(hex) => write({ type: 'color', color: hex })}
          />
        </div>
      )}

      {backgroundType === 'gradient' && (
        <Stack gap={6}>
          <SegmentedControl
            fullWidth
            aria-label={`${label} — Tipo gradiente`}
            data={[
              { value: 'linear', label: 'Lineare' },
              { value: 'radial', label: 'Radiale' },
            ]}
            value={gradient.type}
            onChange={(next) => writeGradient({ ...gradient, type: next as 'linear' | 'radial' })}
          />
          {gradient.type === 'linear' ? (
            <NumberInput
              label="Angolo"
              aria-label={`${label} — Angolo`}
              min={0}
              max={360}
              suffix="°"
              value={gradient.angle ?? 180}
              onChange={(next) =>
                writeGradient({ ...gradient, angle: typeof next === 'number' ? next : 180 })
              }
            />
          ) : (
            <TextInput
              label="Posizione"
              aria-label={`${label} — Posizione`}
              placeholder="Es. center center"
              value={gradient.position ?? ''}
              onChange={(event) =>
                writeGradient({ ...gradient, position: event.currentTarget.value })
              }
            />
          )}
          <Text size="sm" fw={500}>
            Punti colore
          </Text>
          {gradient.stops.map((stop, index) => (
            <Group key={index} gap={6} wrap="nowrap" align="center">
              <ThemeColorPicker
                aria-label={`${label} — Punto colore ${index + 1}`}
                value={colorRefToHex(stop.color)}
                themePresets={themePresets}
                onSelectPreset={(_, hex) => writeStop(index, { color: hex, at: stop.at })}
                onChange={(hex) => writeStop(index, { color: hex, at: stop.at })}
              />
              <NumberInput
                aria-label={`${label} — Punto colore ${index + 1} — Posizione`}
                min={0}
                max={100}
                suffix="%"
                w={90}
                value={stop.at}
                onChange={(next) =>
                  writeStop(index, { color: stop.color, at: typeof next === 'number' ? next : 0 })
                }
              />
              <Tooltip label="Rimuovi punto colore" withArrow>
                <ActionIcon
                  aria-label={`Rimuovi punto colore ${index + 1}`}
                  variant="subtle"
                  color="red"
                  disabled={gradient.stops.length <= 2}
                  onClick={() => removeStop(index)}
                >
                  <IconTrash size={16} />
                </ActionIcon>
              </Tooltip>
            </Group>
          ))}
          <Group justify="flex-start">
            <ActionIcon aria-label="Aggiungi punto colore" variant="light" onClick={addStop}>
              <IconPlus size={16} />
            </ActionIcon>
          </Group>
        </Stack>
      )}
    </Stack>
  );
}
