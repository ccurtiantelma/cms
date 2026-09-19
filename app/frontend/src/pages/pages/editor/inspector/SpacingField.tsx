/**
 * Controllo Mantine per `kind: 'spacing'` (SPEC-PROPKIND-V2-DETAILS.md § 4): quattro valori
 * (Top/Right/Bottom/Left) che condividono **una sola** unità (`prop.units`), con un toggle di
 * unificazione (`linked`) — "presentazione, non validazione" (§ 4 punto 2 dello SPEC): il
 * validator server-side non deriva né verifica coerenza fra `linked: true` e lati diseguali,
 * è responsabilità di questo controllo tenerli sincronizzati quando `linked` è vero.
 *
 * Mai `stateful` (ADR-75 § 6: nessun caso Elementor applica un padding diverso in Hover) — solo
 * `responsive`, sull'**intero oggetto** `SpacingValue` (§ 4 punto 3 dello SPEC, a differenza di
 * `typography`): un solo envelope breakpoint condiviso da tutti e quattro i lati, letto/scritto
 * con {@link readStatefulResponsiveValue}/{@link buildStatefulResponsivePropPatch} passando
 * sempre `state: 'normal'` (le due funzioni sono generiche sul flag `prop.stateful`, che questo
 * `kind` non dichiara mai mai per costruzione dello schema).
 *
 * `prop.target` (`'padding'`|`'margin'`, Addendum S1.2) è letto solo per l'etichetta di
 * fallback quando il registro non ne dichiara una propria (`propsMeta`) — la label reale resta
 * sempre quella di `meta.props[nome].label` come ogni altro campo, mai una seconda fonte.
 */
import { ActionIcon, Group, NumberInput, Select, Stack, Text, Tooltip } from '@mantine/core';
import { IconLink, IconLinkOff } from '@tabler/icons-react';
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

/** Forma runtime di un `SpacingValue` (SPEC-PROPKIND-V2-DETAILS.md § 4). */
interface SpacingValueLike {
  top: number;
  right: number;
  bottom: number;
  left: number;
  unit: string;
  linked: boolean;
}

function isSpacingValue(value: unknown): value is SpacingValueLike {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as SpacingValueLike).top === 'number' &&
    typeof (value as SpacingValueLike).unit === 'string'
  );
}

const SIDES = [
  { key: 'top', label: 'Alto' },
  { key: 'right', label: 'Destra' },
  { key: 'bottom', label: 'Basso' },
  { key: 'left', label: 'Sinistra' },
] as const;

export interface SpacingFieldProps {
  prop: BlockPropDescriptor;
  /** Valore grezzo corrente della prop (`node.props[prop.name]`), scalare o envelope breakpoint. */
  value: unknown;
  propsMeta: PropsMeta;
  onSetAndCommit: (value: unknown) => void;
}

/** Rende il controllo di `kind: 'spacing'`. Vedi il commento di testa del file. */
export default function SpacingField({
  prop,
  value,
  propsMeta,
  onSetAndCommit,
}: SpacingFieldProps): JSX.Element {
  const label = propLabel(prop, propsMeta) || (prop.target === 'margin' ? 'Margine' : 'Padding');
  const activeBreakpoint = useActiveBreakpoint();
  const units = prop.units ?? ['px'];
  const min = prop.allowNegative ? -(prop.max ?? 500) : (prop.min ?? 0);
  const max = prop.max ?? 500;

  const rawValue = readStatefulResponsiveValue(prop, value, 'normal', activeBreakpoint);
  const current: SpacingValueLike = isSpacingValue(rawValue)
    ? rawValue
    : { top: 0, right: 0, bottom: 0, left: 0, unit: units[0], linked: false };
  const hasOverride = hasStatefulResponsiveOverride(prop, value, 'normal', activeBreakpoint);

  function write(next: SpacingValueLike): void {
    onSetAndCommit(buildStatefulResponsivePropPatch(prop, value, 'normal', activeBreakpoint, next));
  }

  function writeSide(
    side: keyof Pick<SpacingValueLike, 'top' | 'right' | 'bottom' | 'left'>,
    nextValue: number,
  ): void {
    if (current.linked) {
      write({ ...current, top: nextValue, right: nextValue, bottom: nextValue, left: nextValue });
      return;
    }
    write({ ...current, [side]: nextValue });
  }

  const breakpointSuffix =
    prop.responsive && activeBreakpoint !== 'default'
      ? ` (${BREAKPOINT_LABELS[activeBreakpoint]})`
      : '';

  return (
    <Stack gap={6}>
      <Group gap={6} wrap="nowrap">
        <Text size="sm">
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
      <Group gap="xs" wrap="nowrap" align="flex-end">
        {SIDES.map(({ key, label: sideLabel }) => (
          <NumberInput
            key={key}
            label={sideLabel}
            aria-label={`${label} — ${sideLabel}`}
            min={min}
            max={max}
            value={current[key]}
            onChange={(next) => writeSide(key, typeof next === 'number' ? next : 0)}
          />
        ))}
        <Tooltip
          label={current.linked ? 'Lati sincronizzati' : 'Sincronizza i quattro lati'}
          withArrow
        >
          <ActionIcon
            variant={current.linked ? 'filled' : 'default'}
            aria-label={`${label} — Sincronizza lati`}
            aria-pressed={current.linked}
            onClick={() => write({ ...current, linked: !current.linked })}
          >
            {current.linked ? <IconLink size={16} /> : <IconLinkOff size={16} />}
          </ActionIcon>
        </Tooltip>
        <Select
          aria-label={`${label} — Unità`}
          data={[...units]}
          value={current.unit}
          allowDeselect={false}
          comboboxProps={{ zIndex: 1100 }}
          w={80}
          onChange={(nextUnit) => write({ ...current, unit: nextUnit ?? current.unit })}
        />
      </Group>
    </Stack>
  );
}
