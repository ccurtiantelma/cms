/**
 * Controllo Mantine per `kind: 'border'` (ADR-38 § 3): 4 campi fissi (`width`/`style`/`color`/
 * `radius`), intervalli non configurabili dalla prop — stesso comportamento scalare in vigore
 * da ADR-38, estratto qui **senza modifiche** dal ramo `case 'border'` che viveva prima dentro
 * `PropField.tsx` (Sub-Task S2.3: nessuna regressione sui test esistenti, stesse etichette
 * `${label} — Stile`/`${label} — Spessore`/`${label} — Raggio`).
 *
 * Estensione di questo Sub-Task: quando `prop.stateful === true` (`ADR-82-container-
 * unificato-grid-flex.md` § "Conseguenze", `BorderPropSpec` guadagna il campo opzionale —
 * oggi solo `container.border`, verificato con `grep stateful app/backend/src/blocks/types/
 * *.block.ts`), un `StateSwitcher` Normal/Hover in testa nidifica il valore in uno stato
 * esterno (ADR-75 § "Decisione" punto 1): `{ normal: {width,style,color,radius}, hover?: {...}
 * }`. Nessun `responsive` dichiarato da alcuna prop reale `border` oggi: le utility generiche
 * di lettura/scrittura (`readStatefulResponsiveValue`/`buildStatefulResponsivePropPatch`)
 * restano comunque generiche sul flag, pronte a comporsi con `responsive` se una prop futura lo
 * dichiarasse, senza toccare questo file.
 */
import { Group, Select, Slider, Stack, Text } from '@mantine/core';
import { useState } from 'react';
import type { BlockPropDescriptor, PropStateName } from '../../../../types/blocks.types';
import { useActiveBreakpoint } from '../../../../hooks/useBlockEditorStore';
import { ThemeEditorColorPicker } from '../../../../components/theme-editor/ThemeEditorColorPicker';
import StateSwitcher, { type EditableStateName } from './StateSwitcher';
import {
  BORDER_RADIUS_RANGE,
  BORDER_STYLE_OPTIONS,
  BORDER_WIDTH_RANGE,
  buildStatefulResponsivePropPatch,
  propLabel,
  readStatefulResponsiveValue,
  type PropsMeta,
} from './inspector.utils';

interface BorderValueLike {
  width: number;
  style: string;
  color: string;
  radius: number;
}

function readBorderValue(raw: unknown): BorderValueLike {
  const objectValue =
    raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Partial<BorderValueLike>) : {};
  return {
    width: typeof objectValue.width === 'number' ? objectValue.width : 0,
    style:
      typeof objectValue.style === 'string' &&
      (BORDER_STYLE_OPTIONS as readonly string[]).includes(objectValue.style)
        ? objectValue.style
        : 'solid',
    color: typeof objectValue.color === 'string' ? objectValue.color : '#000000',
    radius: typeof objectValue.radius === 'number' ? objectValue.radius : 0,
  };
}

export interface BorderFieldProps {
  prop: BlockPropDescriptor;
  /** Valore grezzo corrente della prop (`node.props[prop.name]`), scalare o envelope stato. */
  value: unknown;
  propsMeta: PropsMeta;
  onSetAndCommit: (value: unknown) => void;
}

/** Rende il controllo di `kind: 'border'`. Vedi il commento di testa del file. */
export default function BorderField({
  prop,
  value,
  propsMeta,
  onSetAndCommit,
}: BorderFieldProps): JSX.Element {
  const label = propLabel(prop, propsMeta);
  const required = prop.required;
  const activeBreakpoint = useActiveBreakpoint();
  const [editingState, setEditingState] = useState<EditableStateName>('normal');
  const state: PropStateName = prop.stateful ? editingState : 'normal';

  const current = readBorderValue(
    readStatefulResponsiveValue(prop, value, state, activeBreakpoint),
  );

  function write(patch: Partial<BorderValueLike>): void {
    const next = { ...current, ...patch };
    onSetAndCommit(buildStatefulResponsivePropPatch(prop, value, state, activeBreakpoint, next));
  }

  return (
    <Stack gap="xs">
      <Group justify="space-between" wrap="nowrap">
        <Text size="sm" fw={500}>
          {label}
          {required && (
            <Text component="span" c="red" inherit>
              {' '}
              *
            </Text>
          )}
        </Text>
        {prop.stateful && <StateSwitcher value={editingState} onChange={setEditingState} />}
      </Group>
      <Group grow align="flex-end" wrap="nowrap">
        <Select
          label={`${label} — Stile`}
          allowDeselect={false}
          comboboxProps={{ zIndex: 1100 }}
          data={[...BORDER_STYLE_OPTIONS]}
          value={current.style}
          onChange={(next) => write({ style: next ?? current.style })}
        />
        <ThemeEditorColorPicker
          label={`${label} — Colore`}
          value={current.color}
          aria-label={`${label} — Colore`}
          onChange={(next) => write({ color: next })}
        />
      </Group>
      <div>
        <Text size="xs" c="dimmed" mb={4}>
          Spessore ({current.width}px)
        </Text>
        <Slider
          min={BORDER_WIDTH_RANGE[0]}
          max={BORDER_WIDTH_RANGE[1]}
          value={current.width}
          label={(next) => `${next}px`}
          thumbLabel={`${label} — Spessore`}
          onChange={(next) => write({ width: next })}
        />
      </div>
      <div>
        {/* Un solo controllo di raggio, non quattro per-angolo (ADR-38 § 3). */}
        <Text size="xs" c="dimmed" mb={4}>
          Raggio ({current.radius}px)
        </Text>
        <Slider
          min={BORDER_RADIUS_RANGE[0]}
          max={BORDER_RADIUS_RANGE[1]}
          value={current.radius}
          label={(next) => `${next}px`}
          thumbLabel={`${label} — Raggio`}
          onChange={(next) => write({ radius: next })}
        />
      </div>
    </Stack>
  );
}
