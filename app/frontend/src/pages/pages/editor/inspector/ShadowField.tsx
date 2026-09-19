/**
 * Controllo Mantine per `kind: 'shadow'` (ADR-38 § 4): 5 campi fissi (`x`/`y`/`blur`/`spread`/
 * `color`), stessa forma per box-shadow e text-shadow (nessun toggle "Box/Text": è il renderer
 * a decidere secondo il tipo di blocco) — estratto qui **senza modifiche** dal ramo `case
 * 'shadow'` che viveva prima dentro `PropField.tsx` (Sub-Task S2.3: nessuna regressione sui
 * test esistenti, stesse etichette `${label} — Sfocatura`/`${label} — Diffusione`/ecc.).
 *
 * Estensione di questo Sub-Task: quando `prop.stateful === true` (oggi solo `container.shadow`,
 * verificato con `grep stateful app/backend/src/blocks/types/*.block.ts`), stesso principio di
 * `BorderField.tsx` — un `StateSwitcher` Normal/Hover nidifica il valore in uno stato esterno
 * (ADR-75 § "Decisione" punto 1).
 */
import { Group, Slider, Stack, Text } from '@mantine/core';
import type { BlockPropDescriptor, PropStateName } from '../../../../types/blocks.types';
import { useActiveBreakpoint } from '../../../../hooks/useBlockEditorStore';
import { ThemeEditorColorPicker } from '../../../../components/theme-editor/ThemeEditorColorPicker';
import StateSwitcher from './StateSwitcher';
import { useEditingState } from './editingState';
import {
  buildStatefulResponsivePropPatch,
  propLabel,
  readStatefulResponsiveValue,
  SHADOW_BLUR_RANGE,
  SHADOW_OFFSET_RANGE,
  SHADOW_SPREAD_RANGE,
  type PropsMeta,
} from './inspector.utils';

interface ShadowValueLike {
  x: number;
  y: number;
  blur: number;
  spread: number;
  color: string;
}

function readShadowValue(raw: unknown): ShadowValueLike {
  const objectValue =
    raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Partial<ShadowValueLike>) : {};
  return {
    x: typeof objectValue.x === 'number' ? objectValue.x : 0,
    y: typeof objectValue.y === 'number' ? objectValue.y : 0,
    blur: typeof objectValue.blur === 'number' ? objectValue.blur : 0,
    spread: typeof objectValue.spread === 'number' ? objectValue.spread : 0,
    color: typeof objectValue.color === 'string' ? objectValue.color : '#000000',
  };
}

export interface ShadowFieldProps {
  prop: BlockPropDescriptor;
  /** Valore grezzo corrente della prop (`node.props[prop.name]`), scalare o envelope stato. */
  value: unknown;
  propsMeta: PropsMeta;
  onSetAndCommit: (value: unknown) => void;
}

/** Rende il controllo di `kind: 'shadow'`. Vedi il commento di testa del file. */
export default function ShadowField({
  prop,
  value,
  propsMeta,
  onSetAndCommit,
}: ShadowFieldProps): JSX.Element {
  const label = propLabel(prop, propsMeta);
  const required = prop.required;
  const activeBreakpoint = useActiveBreakpoint();
  const { editingState, setEditingState, hasPanelSwitcher } = useEditingState();
  const state: PropStateName = prop.stateful ? editingState : 'normal';

  const current = readShadowValue(
    readStatefulResponsiveValue(prop, value, state, activeBreakpoint),
  );

  function write(patch: Partial<ShadowValueLike>): void {
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
        {prop.stateful && !hasPanelSwitcher && (
          <StateSwitcher value={editingState} onChange={setEditingState} />
        )}
      </Group>
      <ThemeEditorColorPicker
        label={`${label} — Colore`}
        value={current.color}
        aria-label={`${label} — Colore`}
        onChange={(next) => write({ color: next })}
      />
      <Group grow>
        <div>
          <Text size="xs" c="dimmed" mb={4}>
            Offset X ({current.x}px)
          </Text>
          <Slider
            min={SHADOW_OFFSET_RANGE[0]}
            max={SHADOW_OFFSET_RANGE[1]}
            value={current.x}
            label={(next) => `${next}px`}
            thumbLabel={`${label} — Offset X`}
            onChange={(next) => write({ x: next })}
          />
        </div>
        <div>
          <Text size="xs" c="dimmed" mb={4}>
            Offset Y ({current.y}px)
          </Text>
          <Slider
            min={SHADOW_OFFSET_RANGE[0]}
            max={SHADOW_OFFSET_RANGE[1]}
            value={current.y}
            label={(next) => `${next}px`}
            thumbLabel={`${label} — Offset Y`}
            onChange={(next) => write({ y: next })}
          />
        </div>
      </Group>
      <div>
        <Text size="xs" c="dimmed" mb={4}>
          Sfocatura ({current.blur}px)
        </Text>
        <Slider
          min={SHADOW_BLUR_RANGE[0]}
          max={SHADOW_BLUR_RANGE[1]}
          value={current.blur}
          label={(next) => `${next}px`}
          thumbLabel={`${label} — Sfocatura`}
          onChange={(next) => write({ blur: next })}
        />
      </div>
      <div>
        <Text size="xs" c="dimmed" mb={4}>
          Diffusione ({current.spread}px)
        </Text>
        <Slider
          min={SHADOW_SPREAD_RANGE[0]}
          max={SHADOW_SPREAD_RANGE[1]}
          value={current.spread}
          label={(next) => `${next}px`}
          thumbLabel={`${label} — Diffusione`}
          onChange={(next) => write({ spread: next })}
        />
      </div>
    </Stack>
  );
}
