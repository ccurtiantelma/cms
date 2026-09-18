/**
 * Controllo Mantine per `kind: 'layout'` (`container` v2, ADR-82-container-unificato-grid-
 * flex.md § "Decisione" punto 1): selettore visuale Flex/Grid con i controlli dipendenti dal
 * `display` scelto — `direction`/`wrap`/`justify`/`align` per Flex, `gridTemplateColumns`
 * (preset "N colonne")/`autoFlow`/`justifyItems`/`alignItems` per Grid — più `gap.x`/`gap.y`,
 * comuni a entrambi i modelli.
 *
 * Mai `stateful` (`layout` non è nell'elenco ADR-75 § "Decisione" punto 6) — sempre
 * `responsive` sull'**intero oggetto** (ADR-82 § "Decisione" punto 1: "un cambio di `display`
 * da `flex` a `grid` per breakpoint è un caso raro ma la forma unica per l'intero oggetto evita
 * 9 envelope indipendenti"), letto/scritto con {@link readStatefulResponsiveValue}/
 * {@link buildStatefulResponsivePropPatch} passando sempre `state: 'normal'`.
 *
 * Scope dichiarato di questo Sub-Task (S2.3): `gridTemplateColumns` espone solo il preset
 * `{ preset: 'repeat', count }` (il caso "Grid 12 colonne" richiesto dal Task Operativo), non
 * l'editor completo dell'array di `GridTrackValue` per traccia — un editor di tracce
 * indipendenti (dimensioni miste `fr`/`px`/`%`/`auto` per colonna) resta il "Grid editor
 * visuale" che `ADR-82` § "Conseguenze" dichiara esplicitamente task successivo (R2 T4/T5),
 * non una lacuna introdotta qui. `gridTemplateRows` non è esposto in questo round per lo
 * stesso motivo. `gap.x`/`gap.y` condividono in UI un'unica unità (semplificazione di
 * presentazione: lo schema li mantiene due `UnitValue` indipendenti, questo controllo si limita
 * a non esporre unità diverse per i due assi nello stesso round).
 */
import { Group, NumberInput, Select, SegmentedControl, Stack, Text, Tooltip } from '@mantine/core';
import type { BlockPropDescriptor } from '../../../../types/blocks.types';
import { useActiveBreakpoint } from '../../../../hooks/useBlockEditorStore';
import { BREAKPOINT_LABELS } from '../../../../libs/breakpoints';
import {
  buildStatefulResponsivePropPatch,
  hasStatefulResponsiveOverride,
  propLabel,
  readStatefulResponsiveValue,
  type PropsMeta,
} from './inspector.utils';
import styles from './inspector.module.css';

interface UnitValueLike {
  value: number;
  unit: string;
}

interface GridPresetLike {
  preset: 'repeat';
  count: number;
}

interface LayoutValueLike {
  display?: 'flex' | 'grid';
  direction?: string;
  wrap?: string;
  justify?: string;
  align?: string;
  gap?: { x: UnitValueLike; y: UnitValueLike };
  gridTemplateColumns?: GridPresetLike | unknown;
  autoFlow?: string;
  justifyItems?: string;
  alignItems?: string;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const GAP_UNITS = ['px', '%', 'em', 'rem'] as const;
const FLEX_DIRECTION_OPTIONS = ['row', 'row-reverse', 'column', 'column-reverse'] as const;
const FLEX_WRAP_OPTIONS = ['nowrap', 'wrap', 'wrap-reverse'] as const;
const JUSTIFY_OPTIONS = [
  'flex-start',
  'flex-end',
  'center',
  'space-between',
  'space-around',
  'space-evenly',
] as const;
const ALIGN_OPTIONS = ['stretch', 'flex-start', 'center', 'flex-end', 'baseline'] as const;
const GRID_AUTO_FLOW_OPTIONS = ['row', 'column', 'dense'] as const;
const GRID_JUSTIFY_ITEMS_OPTIONS = ['start', 'end', 'center', 'stretch'] as const;
const GRID_ALIGN_ITEMS_OPTIONS = ['start', 'end', 'center', 'stretch'] as const;

export interface LayoutFieldProps {
  prop: BlockPropDescriptor;
  /** Valore grezzo corrente della prop (`node.props[prop.name]`), scalare o envelope breakpoint. */
  value: unknown;
  propsMeta: PropsMeta;
  onSetAndCommit: (value: unknown) => void;
}

/** Rende il controllo di `kind: 'layout'`. Vedi il commento di testa del file. */
export default function LayoutField({
  prop,
  value,
  propsMeta,
  onSetAndCommit,
}: LayoutFieldProps): JSX.Element {
  const label = propLabel(prop, propsMeta);
  const activeBreakpoint = useActiveBreakpoint();

  const rawValue = readStatefulResponsiveValue(prop, value, 'normal', activeBreakpoint);
  const current: LayoutValueLike = isPlainObject(rawValue) ? (rawValue as LayoutValueLike) : {};
  const display = current.display ?? 'flex';
  const hasOverride = hasStatefulResponsiveOverride(prop, value, 'normal', activeBreakpoint);

  function write(next: LayoutValueLike): void {
    onSetAndCommit(buildStatefulResponsivePropPatch(prop, value, 'normal', activeBreakpoint, next));
  }

  const breakpointSuffix =
    prop.responsive && activeBreakpoint !== 'default'
      ? ` (${BREAKPOINT_LABELS[activeBreakpoint]})`
      : '';

  const gapUnit = current.gap?.x.unit ?? current.gap?.y.unit ?? GAP_UNITS[0];
  const gapX = current.gap?.x.value ?? 0;
  const gapY = current.gap?.y.value ?? 0;

  function writeGap(nextX: number, nextY: number, nextUnit: string): void {
    write({
      ...current,
      gap: { x: { value: nextX, unit: nextUnit }, y: { value: nextY, unit: nextUnit } },
    });
  }

  const gridColumnsCount = isPlainObject(current.gridTemplateColumns)
    ? Number((current.gridTemplateColumns as { count?: unknown }).count) || 12
    : 12;

  return (
    <Stack gap="sm">
      <Group gap={6} wrap="nowrap">
        <Text size="sm" fw={500}>
          {label}
          {breakpointSuffix}
        </Text>
        {hasOverride && (
          <Tooltip
            label="Valore specifico per questo breakpoint, non ereditato dal Desktop"
            withArrow
          >
            <span className={styles.breakpointOverrideDot} data-testid="breakpoint-override-dot" />
          </Tooltip>
        )}
      </Group>

      <SegmentedControl
        fullWidth
        aria-label={`${label} — Modello`}
        data={[
          { value: 'flex', label: 'Flex' },
          { value: 'grid', label: 'Grid' },
        ]}
        value={display}
        onChange={(next) => write({ ...current, display: next as 'flex' | 'grid' })}
      />

      {display === 'flex' ? (
        <>
          <Select
            label="Direzione"
            aria-label={`${label} — Direzione`}
            data={[...FLEX_DIRECTION_OPTIONS]}
            value={current.direction ?? FLEX_DIRECTION_OPTIONS[0]}
            allowDeselect={false}
            comboboxProps={{ zIndex: 1100 }}
            onChange={(next) => next && write({ ...current, direction: next })}
          />
          <Select
            label="A capo"
            aria-label={`${label} — A capo`}
            data={[...FLEX_WRAP_OPTIONS]}
            value={current.wrap ?? FLEX_WRAP_OPTIONS[0]}
            allowDeselect={false}
            comboboxProps={{ zIndex: 1100 }}
            onChange={(next) => next && write({ ...current, wrap: next })}
          />
          <Select
            label="Allineamento orizzontale"
            aria-label={`${label} — Allineamento orizzontale`}
            data={[...JUSTIFY_OPTIONS]}
            value={current.justify ?? JUSTIFY_OPTIONS[0]}
            allowDeselect={false}
            comboboxProps={{ zIndex: 1100 }}
            onChange={(next) => next && write({ ...current, justify: next })}
          />
          <Select
            label="Allineamento verticale"
            aria-label={`${label} — Allineamento verticale`}
            data={[...ALIGN_OPTIONS]}
            value={current.align ?? ALIGN_OPTIONS[0]}
            allowDeselect={false}
            comboboxProps={{ zIndex: 1100 }}
            onChange={(next) => next && write({ ...current, align: next })}
          />
        </>
      ) : (
        <>
          <NumberInput
            label="Numero di colonne"
            aria-label={`${label} — Numero di colonne`}
            min={1}
            max={12}
            value={gridColumnsCount}
            onChange={(next) =>
              write({
                ...current,
                gridTemplateColumns: {
                  preset: 'repeat',
                  count: typeof next === 'number' ? next : 12,
                },
              })
            }
          />
          <Select
            label="Distribuzione automatica"
            aria-label={`${label} — Distribuzione automatica`}
            data={[...GRID_AUTO_FLOW_OPTIONS]}
            value={current.autoFlow ?? GRID_AUTO_FLOW_OPTIONS[0]}
            allowDeselect={false}
            comboboxProps={{ zIndex: 1100 }}
            onChange={(next) => next && write({ ...current, autoFlow: next })}
          />
          <Select
            label="Allineamento elementi (orizzontale)"
            aria-label={`${label} — Allineamento elementi (orizzontale)`}
            data={[...GRID_JUSTIFY_ITEMS_OPTIONS]}
            value={current.justifyItems ?? GRID_JUSTIFY_ITEMS_OPTIONS[3]}
            allowDeselect={false}
            comboboxProps={{ zIndex: 1100 }}
            onChange={(next) => next && write({ ...current, justifyItems: next })}
          />
          <Select
            label="Allineamento elementi (verticale)"
            aria-label={`${label} — Allineamento elementi (verticale)`}
            data={[...GRID_ALIGN_ITEMS_OPTIONS]}
            value={current.alignItems ?? GRID_ALIGN_ITEMS_OPTIONS[3]}
            allowDeselect={false}
            comboboxProps={{ zIndex: 1100 }}
            onChange={(next) => next && write({ ...current, alignItems: next })}
          />
        </>
      )}

      <Group gap="xs" wrap="nowrap" align="flex-end">
        <NumberInput
          label="Spaziatura orizzontale"
          aria-label={`${label} — Spaziatura orizzontale`}
          min={0}
          max={200}
          value={gapX}
          onChange={(next) => writeGap(typeof next === 'number' ? next : 0, gapY, gapUnit)}
        />
        <NumberInput
          label="Spaziatura verticale"
          aria-label={`${label} — Spaziatura verticale`}
          min={0}
          max={200}
          value={gapY}
          onChange={(next) => writeGap(gapX, typeof next === 'number' ? next : 0, gapUnit)}
        />
        <Select
          aria-label={`${label} — Spaziatura — Unità`}
          data={[...GAP_UNITS]}
          value={gapUnit}
          allowDeselect={false}
          comboboxProps={{ zIndex: 1100 }}
          w={80}
          onChange={(nextUnit) => writeGap(gapX, gapY, nextUnit ?? gapUnit)}
        />
      </Group>
    </Stack>
  );
}
