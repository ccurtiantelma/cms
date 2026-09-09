/**
 * Pannello "Layout" dell'Editor tema (v8, `theme.ts` § `ThemeLayoutConfig`): larghezza
 * massima della pagina in modalità boxed, margine esterno e rientro interno del wrapper
 * di pagina del sito pubblico (`app/public-site/src/PageView.tsx`), applicati come
 * variabili CSS da `utils/theme-css.utils.ts`.
 *
 * File dedicato (non aggiunto a `ThemeEditorPanels.tsx`, già oltre 1200 righe): stessa
 * convenzione di `ThemeEditorDemos.tsx`/`GradientAngleDial.tsx`, un file per componente
 * "pesante" della cartella `components/theme-editor/`. `ThemeEditorPanelProps` è importato
 * solo come tipo (erased a compile-time): nessuna dipendenza circolare a runtime con
 * `ThemeEditorPanels.tsx`, che importa `PanelLayout` da qui.
 */
import { Divider, Group, NumberInput, SegmentedControl, Stack, Text } from '@mantine/core';
import {
  convertDimension,
  DEFAULT_THEME_CONFIG,
  THEME_DIMENSION_UNIT_LIMITS,
  THEME_UNIT_DECIMAL_SCALE,
  THEME_UNIT_STEP,
  THEME_UNITS,
  type ThemeLayoutBoxSides,
  type ThemeUnit,
} from '../../theme';
import type { ThemeEditorPanelProps } from './ThemeEditorPanels';

/** Converte l'onChange di un NumberInput in numero clampato sul range (o null se non valido). */
function toBoundedNumber(
  value: string | number,
  limits: { min: number; max: number },
): number | null {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return Math.min(limits.max, Math.max(limits.min, parsed));
}

/**
 * Selettore di unità CSS per un gruppo di campi dimensionali del pannello Layout —
 * stesso pattern di `DimensionUnitControl` in `ThemeEditorPanels.tsx` (non riusato
 * direttamente per evitare un import circolare a runtime tra i due file).
 */
function LayoutUnitControl({
  label,
  unit,
  onChange,
}: {
  label: string;
  unit: ThemeUnit;
  onChange: (unit: ThemeUnit) => void;
}): JSX.Element {
  return (
    <Group justify="space-between" align="center" wrap="nowrap" gap="xs">
      <Text size="xs" fw={500} truncate style={{ flexShrink: 0 }}>
        {label}
      </Text>
      <SegmentedControl
        size="xs"
        value={unit}
        onChange={(value) => onChange(value as ThemeUnit)}
        data={THEME_UNITS.map((option) => ({ value: option, label: option }))}
        aria-label={`Unità: ${label}`}
      />
    </Group>
  );
}

/** Etichette utente dei 4 lati, nell'ordine di visualizzazione (Sopra/Destra/Sotto/Sinistra). */
const BOX_SIDE_ORDER: readonly (keyof ThemeLayoutBoxSides)[] = ['top', 'right', 'bottom', 'left'];

const BOX_SIDE_LABELS: Record<keyof ThemeLayoutBoxSides, string> = {
  top: 'Sopra',
  right: 'Destra',
  bottom: 'Sotto',
  left: 'Sinistra',
};

/** Riga di 4 `NumberInput` (Sopra/Destra/Sotto/Sinistra) con etichetta sotto ciascun campo. */
function BoxSidesRow({
  sides,
  limits,
  unit,
  onChange,
}: {
  sides: ThemeLayoutBoxSides;
  limits: { min: number; max: number };
  unit: ThemeUnit;
  onChange: (side: keyof ThemeLayoutBoxSides, value: number) => void;
}): JSX.Element {
  return (
    <Group gap={6} wrap="nowrap" grow>
      {BOX_SIDE_ORDER.map((side) => (
        <Stack key={side} gap={2}>
          <NumberInput
            size="xs"
            hideControls
            value={sides[side]}
            min={limits.min}
            max={limits.max}
            step={THEME_UNIT_STEP[unit]}
            decimalScale={THEME_UNIT_DECIMAL_SCALE[unit]}
            suffix={` ${unit}`}
            onChange={(value) => {
              const bounded = toBoundedNumber(value, limits);
              if (bounded !== null) {
                onChange(side, bounded);
              }
            }}
            aria-label={`${BOX_SIDE_LABELS[side]} (${unit})`}
          />
          <Text size="xs" c="dimmed" ta="center">
            {BOX_SIDE_LABELS[side]}
          </Text>
        </Stack>
      ))}
    </Group>
  );
}

/**
 * Pannello "Layout": larghezza massima della pagina boxed, margine esterno e rientro
 * interno del wrapper di pagina pubblica — vedi `ThemeLayoutConfig` (`theme.ts`).
 * Il cambio di unità converte sempre i valori esistenti (`convertDimension`), mai un
 * azzeramento o un numero lasciato invariato sotto una nuova unità.
 */
export function PanelLayout({ config, updateConfig }: ThemeEditorPanelProps): JSX.Element {
  const { layout } = config;

  return (
    <Stack gap="md">
      <Divider label="Pagina boxed" labelPosition="left" />
      <LayoutUnitControl
        label="Unità"
        unit={layout.pageBoxedWidthUnit}
        onChange={(newUnit) => {
          const converted = convertDimension(
            layout.pageBoxedWidth,
            layout.pageBoxedWidthUnit,
            newUnit,
            DEFAULT_THEME_CONFIG.layout.pageBoxedWidth,
          );
          updateConfig((draft) => {
            draft.layout.pageBoxedWidthUnit = newUnit;
            draft.layout.pageBoxedWidth = converted;
          });
        }}
      />
      <NumberInput
        label="Larghezza massima"
        size="xs"
        hideControls
        value={layout.pageBoxedWidth}
        min={THEME_DIMENSION_UNIT_LIMITS.pageBoxedWidth[layout.pageBoxedWidthUnit].min}
        max={THEME_DIMENSION_UNIT_LIMITS.pageBoxedWidth[layout.pageBoxedWidthUnit].max}
        step={THEME_UNIT_STEP[layout.pageBoxedWidthUnit]}
        decimalScale={THEME_UNIT_DECIMAL_SCALE[layout.pageBoxedWidthUnit]}
        suffix={` ${layout.pageBoxedWidthUnit}`}
        onChange={(value) => {
          const bounded = toBoundedNumber(
            value,
            THEME_DIMENSION_UNIT_LIMITS.pageBoxedWidth[layout.pageBoxedWidthUnit],
          );
          if (bounded !== null) {
            updateConfig((draft) => {
              draft.layout.pageBoxedWidth = bounded;
            });
          }
        }}
        aria-label={`Larghezza massima pagina boxed (${layout.pageBoxedWidthUnit})`}
      />

      <Divider label="Margine" labelPosition="left" />
      <LayoutUnitControl
        label="Unità"
        unit={layout.marginUnit}
        onChange={(newUnit) => {
          const defaults = DEFAULT_THEME_CONFIG.layout.margin;
          const converted: ThemeLayoutBoxSides = {
            top: convertDimension(layout.margin.top, layout.marginUnit, newUnit, defaults.top),
            right: convertDimension(
              layout.margin.right,
              layout.marginUnit,
              newUnit,
              defaults.right,
            ),
            bottom: convertDimension(
              layout.margin.bottom,
              layout.marginUnit,
              newUnit,
              defaults.bottom,
            ),
            left: convertDimension(layout.margin.left, layout.marginUnit, newUnit, defaults.left),
          };
          updateConfig((draft) => {
            draft.layout.marginUnit = newUnit;
            draft.layout.margin = converted;
          });
        }}
      />
      <BoxSidesRow
        sides={layout.margin}
        limits={THEME_DIMENSION_UNIT_LIMITS.layoutBoxSide[layout.marginUnit]}
        unit={layout.marginUnit}
        onChange={(side, value) =>
          updateConfig((draft) => {
            draft.layout.margin[side] = value;
          })
        }
      />

      <Divider label="Rientro" labelPosition="left" />
      <LayoutUnitControl
        label="Unità"
        unit={layout.paddingUnit}
        onChange={(newUnit) => {
          const defaults = DEFAULT_THEME_CONFIG.layout.padding;
          const converted: ThemeLayoutBoxSides = {
            top: convertDimension(layout.padding.top, layout.paddingUnit, newUnit, defaults.top),
            right: convertDimension(
              layout.padding.right,
              layout.paddingUnit,
              newUnit,
              defaults.right,
            ),
            bottom: convertDimension(
              layout.padding.bottom,
              layout.paddingUnit,
              newUnit,
              defaults.bottom,
            ),
            left: convertDimension(layout.padding.left, layout.paddingUnit, newUnit, defaults.left),
          };
          updateConfig((draft) => {
            draft.layout.paddingUnit = newUnit;
            draft.layout.padding = converted;
          });
        }}
      />
      <BoxSidesRow
        sides={layout.padding}
        limits={THEME_DIMENSION_UNIT_LIMITS.layoutBoxSide[layout.paddingUnit]}
        unit={layout.paddingUnit}
        onChange={(side, value) =>
          updateConfig((draft) => {
            draft.layout.padding[side] = value;
          })
        }
      />
    </Stack>
  );
}
