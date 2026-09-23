/**
 * Controlli del gruppo "Elementi" (Grid) di `ContainerLayoutTab.tsx`, stile Elementor Pro
 * (screenshot allegato dall'utente 2026-09-23): etichetta con icona del dispositivo attivo,
 * unità in alto a destra, slider + valore per Colonne/Righe, gruppi di icone per
 * Giustifica/Allinea elementi.
 *
 * Nessun controllo tiene uno stato di valore: ricevono il valore corrente e chiamano
 * `onChange` con quello nuovo, la scrittura (`setAndCommit`, `layout` responsive per
 * breakpoint) resta in `ContainerLayoutTab.tsx`. Le forme prodotte sono quelle chiuse di
 * `GridTemplateValue` (ADR-82 § "Decisione" punto 1): mai una stringa CSS libera.
 */
import type { ReactNode } from 'react';
import {
  Center,
  Group,
  NumberInput,
  SegmentedControl,
  Select,
  Slider,
  Text,
  Tooltip,
  VisuallyHidden,
} from '@mantine/core';
import { IconDeviceDesktop, IconDeviceMobile, IconDeviceTablet } from '@tabler/icons-react';
import type { EditorViewport } from '../../../../hooks/useBlockEditorStore';
import styles from './inspector.module.css';

/**
 * Stessi `classNames` del selettore "Disposizione" (accento blu sul segmento attivo) più il
 * padding ridotto di `iconChoiceLabel`: quattro icone devono stare accanto all'etichetta nella
 * larghezza stretta della sidebar senza che l'ultima venga tagliata.
 */
const SEGMENTED_CLASS_NAMES = {
  root: `${styles.segmentedRoot} ${styles.iconChoiceRoot}`,
  indicator: styles.segmentedIndicator,
  input: styles.segmentedInput,
  label: `${styles.segmentedLabel} ${styles.iconChoiceLabel}`,
};

const VIEWPORT_ICONS = {
  desktop: IconDeviceDesktop,
  tablet: IconDeviceTablet,
  mobile: IconDeviceMobile,
} as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

interface FieldLabelProps {
  label: string;
  viewport: EditorViewport;
}

/** Etichetta + icona del dispositivo attivo: `layout` è `responsive`, il valore mostrato è quello del breakpoint corrente. */
export function FieldLabel({ label, viewport }: FieldLabelProps): JSX.Element {
  const DeviceIcon = VIEWPORT_ICONS[viewport];
  return (
    <Group gap={4} wrap="nowrap">
      <DeviceIcon size={14} className={styles.unitFieldDeviceIcon} aria-hidden />
      <Text size="sm" fw={500}>
        {label}
      </Text>
    </Group>
  );
}

// ─── Colonne / Righe ─────────────────────────────────────────────────────────

type GridTrackUnit = 'fr' | 'px' | 'em' | '%';
type GridTemplate = { preset: 'repeat'; count: number } | Array<{ value: number; unit: string }>;

const GRID_TRACK_UNITS: readonly GridTrackUnit[] = ['fr', 'px', 'em', '%'];
const MAX_TRACKS = 12;
const TRACK_LIMITS: Record<GridTrackUnit, { min: number; max: number }> = {
  fr: { min: 1, max: MAX_TRACKS },
  px: { min: 0, max: 2000 },
  em: { min: 0, max: 100 },
  '%': { min: 0, max: 100 },
};

/** Valore di partenza dopo un cambio unità: conteggio per `fr`, una dimensione sensata per le altre. */
const DEFAULT_TRACK_VALUE: Record<GridTrackUnit, (count: number) => number> = {
  fr: (count) => count,
  px: () => 200,
  em: () => 10,
  '%': (count) => Math.round(100 / count),
};

interface TrackState {
  unit: GridTrackUnit;
  value: number;
  count: number;
}

function clampCount(count: number): number {
  return Math.min(MAX_TRACKS, Math.max(1, Math.round(count)));
}

/**
 * `fr` = numero di tracce uguali (`repeat(N, 1fr)`, "1–12" dello screenshot); `px`/`%` =
 * dimensione di ciascuna delle N tracce, con N conservato dal valore precedente. Un array di
 * tracce miste (es. migrato da `section` `33-66`) mostra unità e valore della prima traccia
 * esplicita e viene riscritto uniforme solo se l'autore tocca il controllo.
 */
function readTrackState(template: unknown, defaultCount: number): TrackState {
  if (
    isPlainObject(template) &&
    template.preset === 'repeat' &&
    typeof template.count === 'number'
  ) {
    const count = clampCount(template.count);
    return { unit: 'fr', value: count, count };
  }
  if (Array.isArray(template) && template.length > 0) {
    const count = clampCount(template.length);
    const first = template.find(isPlainObject);
    const unit = first?.unit;
    if (unit === 'px' || unit === 'em' || unit === '%') {
      return { unit, value: typeof first?.value === 'number' ? first.value : 0, count };
    }
    return { unit: 'fr', value: count, count };
  }
  return { unit: 'fr', value: defaultCount, count: defaultCount };
}

function buildTemplate(unit: GridTrackUnit, value: number, count: number): GridTemplate {
  if (unit === 'fr') return { preset: 'repeat', count: clampCount(value) };
  return Array.from({ length: count }, () => ({ value, unit }));
}

interface GridTrackFieldProps {
  label: string;
  viewport: EditorViewport;
  /** `layout.gridTemplateColumns`/`gridTemplateRows` corrente (`undefined` se non impostato). */
  value: unknown;
  /** Numero di tracce mostrato finché il valore non è impostato (Elementor: 2 colonne, 1 riga). */
  defaultCount: number;
  onChange: (next: GridTemplate) => void;
}

export function GridTrackField({
  label,
  viewport,
  value,
  defaultCount,
  onChange,
}: GridTrackFieldProps): JSX.Element {
  const state = readTrackState(value, defaultCount);
  const { min, max } = TRACK_LIMITS[state.unit];

  function handleValue(next: number | string): void {
    if (typeof next !== 'number' || Number.isNaN(next)) return;
    const clamped = Math.min(max, Math.max(min, next));
    onChange(buildTemplate(state.unit, clamped, state.count));
  }

  function handleUnit(next: string | null): void {
    if (next === null || !(GRID_TRACK_UNITS as readonly string[]).includes(next)) return;
    if (next === state.unit) return;
    // Cambiare unità cambia il significato del valore (conteggio vs dimensione): riparte da un
    // default sensato invece di reinterpretare il numero precedente (2 colonne ≠ 2px).
    const nextUnit = next as GridTrackUnit;
    onChange(buildTemplate(nextUnit, DEFAULT_TRACK_VALUE[nextUnit](state.count), state.count));
  }

  return (
    <div>
      <Group justify="space-between" align="center" wrap="nowrap" mb={4}>
        <FieldLabel label={label} viewport={viewport} />
        <Select
          aria-label={`${label} — Unità`}
          variant="unstyled"
          className={styles.unitFieldUnitSelect}
          data={[...GRID_TRACK_UNITS]}
          value={state.unit}
          allowDeselect={false}
          comboboxProps={{ zIndex: 1100, width: 'max-content', position: 'bottom-end' }}
          rightSectionWidth={18}
          onChange={handleUnit}
        />
      </Group>
      <Group gap="sm" align="center" wrap="nowrap">
        <Slider
          style={{ flex: 1 }}
          min={min}
          max={max}
          value={Math.min(max, Math.max(min, state.value))}
          label={(sliderValue) => `${sliderValue}${state.unit}`}
          thumbLabel={label}
          onChange={handleValue}
        />
        <NumberInput
          aria-label={`${label} — Valore`}
          min={min}
          max={max}
          value={state.value}
          w={90}
          onChange={handleValue}
        />
      </Group>
    </div>
  );
}

// ─── Giustifica / Allinea elementi ───────────────────────────────────────────

export interface IconChoiceOption {
  value: string;
  label: string;
  icon: ReactNode;
}

interface IconChoiceFieldProps {
  label: string;
  viewport: EditorViewport;
  options: readonly IconChoiceOption[];
  value: string;
  onChange: (next: string) => void;
}

/** Riga etichetta + gruppo di icone (una sola scelta), tooltip e testo accessibile per ogni voce. */
export function IconChoiceField({
  label,
  viewport,
  options,
  value,
  onChange,
}: IconChoiceFieldProps): JSX.Element {
  return (
    <Group justify="space-between" align="center" wrap="nowrap">
      <FieldLabel label={label} viewport={viewport} />
      <SegmentedControl
        size="xs"
        aria-label={label}
        classNames={SEGMENTED_CLASS_NAMES}
        data={options.map((option) => ({
          value: option.value,
          label: (
            <Tooltip label={option.label} withArrow>
              <Center>
                {option.icon}
                <VisuallyHidden>{option.label}</VisuallyHidden>
              </Center>
            </Tooltip>
          ),
        }))}
        value={value}
        onChange={onChange}
      />
    </Group>
  );
}
