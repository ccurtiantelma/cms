/**
 * Controllo Mantine per `kind: 'colorRef'` (SPEC-PROPKIND-V2-DETAILS.md § 1): hex libero
 * (`ColorInput`, con canale alpha solo se `prop.allowAlpha === true`) o `{ ref: GlobalColorId }`
 * verso uno dei 4 token di sistema del Global Kit (ADR-77 § 2) tramite gli swatch rapidi.
 * Stato (`stateful`, ADR-75) e breakpoint (`responsive`, ADR-76) letti/scritti con le utility
 * generiche di `inspector.utils.ts` — mai una seconda cascata/envelope locale (stesso principio
 * dichiarato nel commento di testa di quel modulo).
 *
 * Il breakpoint attivo è letto da `useActiveBreakpoint()` (7 vie, ADR-76), NON dal prop
 * `activeBreakpoint` a 3 vie che `PropField.tsx` riceve da `StyleTab`/`ContentTab` (modello
 * legacy di ADR-29, ancora corretto per i kind v1 invariati) — scelta di design dichiarata nel
 * resoconto finale del Sub-Task S2.3 (gap 1).
 *
 * Debito dichiarato (Sub-Task S2.3, gap 3, vedi resoconto): la risoluzione di un guid custom
 * del Global Kit (ADR-77) non ha oggi un hook/endpoint frontend pronto da consumare —
 * `useGlobalTokens()` espone solo i 4 colori di sistema di F04 step 1 (`GlobalTokensPalette`,
 * forma diversa da `colors[]` di ADR-77/SPEC-GLOBAL-KIT.md). Questo controllo si limita quindi
 * a hex libero + i 4 id di sistema come swatch rapidi, stesso pattern già in uso da `case
 * 'color'` di `PropField.tsx` per i token del Tema. La resa live nel canvas di un `{ ref }`
 * dipende da una variabile `--gk-color-<id>` (ADR-77) che nessun modulo frontend compila
 * ancora (oggi solo `--eaidos-global-color-*`, F04 step 1) — gap pre-esistente del bridge dei
 * Global Design Tokens, non introdotto da questo file: `generateCanvasCss.ts` anticipa già
 * correttamente quella variabile (`colorRefValueToCss`), in attesa che un round futuro la
 * compili davvero.
 */
import { Group, Stack, Text, Tooltip } from '@mantine/core';
import type { BlockPropDescriptor, PropStateName } from '../../../../types/blocks.types';
import { useActiveBreakpoint, useGlobalTokens } from '../../../../hooks/useBlockEditorStore';
import type { GlobalTokens } from '../../../../libs/globalTokensCompiler';
import { BREAKPOINT_LABELS } from '../../../../libs/breakpoints';
import StateSwitcher from './StateSwitcher';
import { useEditingState } from './editingState';
import {
  buildStatefulResponsivePropPatch,
  hasStatefulResponsiveOverride,
  propLabel,
  readStatefulResponsiveValue,
  type PropsMeta,
} from './inspector.utils';
import ThemeColorPicker from './ThemeColorPicker';
import styles from './inspector.module.css';

/** I 4 id di sistema del Global Kit (ADR-77 § 2), mai cancellabili né riusabili da un custom. */
const SYSTEM_COLOR_IDS = ['primary', 'secondary', 'text', 'accent'] as const;
type SystemColorId = (typeof SYSTEM_COLOR_IDS)[number];

const SYSTEM_COLOR_LABELS: Record<SystemColorId, string> = {
  primary: 'Primario',
  secondary: 'Secondario',
  text: 'Testo',
  accent: 'Accento',
};

/** Hex risolto del token di sistema `id` dai Global Design Tokens correnti (F04 step 1, vedi
 * il debito dichiarato nel commento di testa). Nero se nessun token è stato ancora impostato in
 * questa sessione (`useGlobalTokens()` è `null` finché nessuno li ha impostati). */
function resolveSystemHex(tokens: GlobalTokens | null, id: SystemColorId): string {
  if (!tokens) return '#000000';
  return tokens.palette[id];
}

function isColorRefObject(value: unknown): value is { ref: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as { ref?: unknown }).ref === 'string'
  );
}

export interface ColorFieldProps {
  prop: BlockPropDescriptor;
  /** Valore grezzo corrente della prop (`node.props[prop.name]`), mai già risolto a scalare. */
  value: unknown;
  propsMeta: PropsMeta;
  /** Scrive l'intero valore della prop nello store (stesso canale di ogni altro `kind`). */
  onSetAndCommit: (value: unknown) => void;
}

/** Rende il controllo di `kind: 'colorRef'`. Vedi il commento di testa del file. */
export default function ColorField({
  prop,
  value,
  propsMeta,
  onSetAndCommit,
}: ColorFieldProps): JSX.Element {
  const label = propLabel(prop, propsMeta);
  const activeBreakpoint = useActiveBreakpoint();
  const globalTokens = useGlobalTokens();
  const { editingState, setEditingState, hasPanelSwitcher } = useEditingState();
  const state: PropStateName = prop.stateful ? editingState : 'normal';

  const nakedValue = readStatefulResponsiveValue(prop, value, state, activeBreakpoint);
  const activeRefId = isColorRefObject(nakedValue) ? nakedValue.ref : null;
  const hexValue =
    typeof nakedValue === 'string' ? nakedValue : resolveSystemHex(globalTokens, 'text');
  const hasOverride = hasStatefulResponsiveOverride(prop, value, state, activeBreakpoint);

  function writeNaked(nextNakedValue: unknown): void {
    onSetAndCommit(
      buildStatefulResponsivePropPatch(prop, value, state, activeBreakpoint, nextNakedValue),
    );
  }

  const breakpointSuffix =
    prop.responsive && activeBreakpoint !== 'default'
      ? ` (${BREAKPOINT_LABELS[activeBreakpoint]})`
      : '';

  return (
    <Stack gap={6}>
      {prop.stateful && !hasPanelSwitcher && (
        <Group justify="flex-end">
          <StateSwitcher value={editingState} onChange={setEditingState} />
        </Group>
      )}
      <div className={styles.fieldRow}>
        <Group gap={6} wrap="nowrap" className={styles.fieldRowLabel}>
          <Text size="sm">
            {label}
            {breakpointSuffix}
          </Text>
          {hasOverride && (
            <Tooltip
              label="Valore specifico per questo breakpoint, non ereditato dal Desktop"
              withArrow
            >
              <span
                className={styles.breakpointOverrideDot}
                data-testid="breakpoint-override-dot"
              />
            </Tooltip>
          )}
        </Group>
        <ThemeColorPicker
          aria-label={label}
          value={hexValue}
          activeRefId={activeRefId}
          allowAlpha={prop.allowAlpha}
          themePresets={SYSTEM_COLOR_IDS.map((id) => ({
            id,
            label: SYSTEM_COLOR_LABELS[id],
            hex: resolveSystemHex(globalTokens, id),
          }))}
          onSelectPreset={(id) => writeNaked({ ref: id })}
          onChange={(hex) => writeNaked(hex)}
        />
      </div>
    </Stack>
  );
}
