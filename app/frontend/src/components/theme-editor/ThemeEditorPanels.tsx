/**
 * Pannelli di modifica dell'Editor tema (ADR-4 v4): un pannello per sezione,
 * renderizzato nella colonna destra di `PageThemeEditor`. Ogni controllo
 * scrive nel draft del `ThemeConfig` tramite `updateConfig` (anteprima live);
 * i valori sono sempre vincolati: hex validati, numeri clampati sui range di
 * `THEME_NUMERIC_LIMITS`, enum scelti da whitelist — nessun input libero.
 */
import {
  Divider,
  Group,
  NumberInput,
  SegmentedControl,
  Select,
  Slider,
  Stack,
  Switch,
  Text,
} from '@mantine/core';
import {
  convertDimension,
  convertSizeScale,
  DEFAULT_THEME_CONFIG,
  THEME_ACTION_ICON_VARIANTS,
  THEME_BADGE_VARIANTS,
  THEME_BUTTON_VARIANTS,
  THEME_DIMENSION_UNIT_LIMITS,
  THEME_FONT_FAMILIES,
  THEME_FONT_WEIGHTS,
  THEME_HEADING_LEVELS,
  THEME_INPUT_VARIANTS,
  THEME_LENGTH_UNITS,
  THEME_LOADER_TYPES,
  THEME_MONO_FONT_FAMILIES,
  THEME_NUMERIC_LIMITS,
  THEME_RADIUS_VALUES,
  THEME_SEMANTIC_COLOR_NAMES,
  THEME_SHADOW_OPTIONS,
  THEME_SIZE_OPTIONS,
  THEME_SIZE_VALUES,
  THEME_UNIT_DECIMAL_SCALE,
  THEME_UNIT_STEP,
  THEME_UNITS,
  THEME_UNSET,
  type ThemeConfig,
  type ThemeFontFamilyId,
  type ThemeFontWeight,
  type ThemeMonoFontFamilyId,
  type ThemeNavbarEdgeStyle,
  type ThemeSemanticColorName,
  type ThemeSizeScale,
  type ThemeSizeValue,
  type ThemeTokenName,
  type ThemeUnit,
} from '../../theme';
import { GradientAngleDial } from './GradientAngleDial';
import { ThemeEditorColorPicker } from './ThemeEditorColorPicker';
import classes from './ThemeEditorPanels.module.css';

/** Formato hex obbligatorio dei token (ADR-4): input parziali vengono ignorati. */
const HEX_TOKEN_REGEX = /^#[0-9a-fA-F]{6}$/;

/** Etichette utente delle variant e delle sentinelle dei controlli enum. */
const OPTION_LABELS: Record<string, string> = {
  [THEME_UNSET]: 'Default Mantine',
  none: 'Nessuna',
  filled: 'Filled',
  light: 'Light',
  outline: 'Outline',
  subtle: 'Subtle',
  default: 'Default (grigio)',
  gradient: 'Gradient',
  transparent: 'Transparent',
  dot: 'Dot',
  unstyled: 'Unstyled',
  oval: 'Oval',
  bars: 'Bars',
  dots: 'Dots',
};

/** Props comuni a tutti i pannelli di sezione. */
export interface ThemeEditorPanelProps {
  /** Config tema corrente (draft live). */
  config: ThemeConfig;
  /** Scheme in modifica per i token per-scheme. */
  editScheme: 'light' | 'dark';
  /** Applica una mutazione al draft (clona, muta, imposta). */
  updateConfig: (mutate: (draft: ThemeConfig) => void) => void;
}

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

/** Select su una whitelist di opzioni enum, con etichette utente. */
function OptionSelect<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly T[];
  onChange: (value: T) => void;
}): JSX.Element {
  return (
    <Select
      label={label}
      size="xs"
      value={value}
      allowDeselect={false}
      data={options.map((option) => ({ value: option, label: OPTION_LABELS[option] ?? option }))}
      onChange={(selected) => {
        if (selected && (options as readonly string[]).includes(selected)) {
          onChange(selected as T);
        }
      }}
    />
  );
}

/** SegmentedControl per un size/radius opzionale (`unset` = default Mantine). */
function SizeOptionControl({
  label,
  value,
  onChange,
}: {
  label: string;
  value: (typeof THEME_SIZE_OPTIONS)[number];
  onChange: (value: (typeof THEME_SIZE_OPTIONS)[number]) => void;
}): JSX.Element {
  return (
    <div>
      <Text size="xs" fw={500} mb={4}>
        {label}
      </Text>
      <SegmentedControl
        fullWidth
        size="xs"
        value={value}
        onChange={(selected) => onChange(selected as (typeof THEME_SIZE_OPTIONS)[number])}
        data={[
          { value: THEME_UNSET, label: 'Auto' },
          ...THEME_SIZE_VALUES.map((size) => ({ value: size, label: size })),
        ]}
        aria-label={label}
      />
    </div>
  );
}

/**
 * Selettore di unità CSS (`SegmentedControl`) per un gruppo di campi
 * dimensionali: quando cambia, converte già i valori del gruppo (chiamante)
 * in modo che il cambio non produca un salto visivo insensato (16 "px" non
 * diventa 16 "rem").
 */
function DimensionUnitControl<U extends string>({
  label,
  unit,
  options,
  onChange,
}: {
  label: string;
  unit: U;
  options: readonly U[];
  onChange: (unit: U) => void;
}): JSX.Element {
  return (
    <Group justify="space-between" align="center" wrap="nowrap" gap="xs">
      <Text size="xs" fw={500} truncate style={{ flexShrink: 0 }}>
        {label}
      </Text>
      <SegmentedControl
        size="xs"
        value={unit}
        onChange={(value) => onChange(value as U)}
        data={options.map((option) => ({ value: option, label: option }))}
        aria-label={`Unità: ${label}`}
      />
    </Group>
  );
}

/** Riga di 5 NumberInput per una scala `xs`–`xl` (valori clampati sul range). */
function ScaleNumberRow({
  scale,
  limits,
  unit,
  step,
  onChange,
}: {
  scale: ThemeSizeScale;
  limits: { min: number; max: number };
  /** Unità del gruppo (v7): se presente, imposta step/decimali/suffisso coerenti; assente per le scale senza unità (es. interlinee). */
  unit?: ThemeUnit;
  step?: number;
  onChange: (size: ThemeSizeValue, value: number) => void;
}): JSX.Element {
  const resolvedStep = step ?? (unit ? THEME_UNIT_STEP[unit] : 1);
  return (
    <Group gap={6} wrap="nowrap" grow>
      {THEME_SIZE_VALUES.map((size) => (
        <NumberInput
          key={size}
          label={size}
          size="xs"
          hideControls
          value={scale[size]}
          min={limits.min}
          max={limits.max}
          step={resolvedStep}
          decimalScale={unit ? THEME_UNIT_DECIMAL_SCALE[unit] : undefined}
          suffix={unit ? ` ${unit}` : undefined}
          onChange={(value) => {
            const bounded = toBoundedNumber(value, limits);
            if (bounded !== null) {
              onChange(size, bounded);
            }
          }}
          aria-label={unit ? `Valore ${size} (${unit})` : `Valore ${size}`}
        />
      ))}
    </Group>
  );
}

/** Etichetta utente di ogni colore semantico, nell'ordine di visualizzazione del pannello. */
const SEMANTIC_COLOR_LABELS: Record<ThemeSemanticColorName, string> = {
  primary: 'Primary',
  secondary: 'Secondary',
  accent: 'Accent',
  success: 'Success',
  warning: 'Warning',
  alert: 'Alert',
  error: 'Error',
  danger: 'Danger',
  info: 'Info',
};

/** Pannello "Generale": colori semantici del tema, gradiente di default, radius, sfondo pagina, comportamento. */
function PanelGeneral({ config, editScheme, updateConfig }: ThemeEditorPanelProps): JSX.Element {
  return (
    <Stack gap="md">
      <Divider label="Colori del tema" labelPosition="left" />
      <Stack gap="xs">
        {THEME_SEMANTIC_COLOR_NAMES.map((name) => (
          <ThemeEditorColorPicker
            key={name}
            label={SEMANTIC_COLOR_LABELS[name]}
            value={config.colors[name]}
            onChange={(value) => {
              if (!HEX_TOKEN_REGEX.test(value)) return;
              updateConfig((draft) => {
                draft.colors[name] = value;
              });
            }}
            aria-label={SEMANTIC_COLOR_LABELS[name]}
          />
        ))}
      </Stack>
      <Divider label="Gradiente di default" labelPosition="left" />
      <Group gap={12} wrap="nowrap" align="center">
        <Group gap={6} wrap="nowrap" grow style={{ flex: 1, minWidth: 0 }}>
          <ThemeEditorColorPicker
            label="Da"
            size="xs"
            value={config.defaultGradient.from}
            onChange={(value) => {
              if (!HEX_TOKEN_REGEX.test(value)) return;
              updateConfig((draft) => {
                draft.defaultGradient.from = value;
              });
            }}
            aria-label="Gradiente: colore di partenza"
          />
          <ThemeEditorColorPicker
            label="A"
            size="xs"
            value={config.defaultGradient.to}
            onChange={(value) => {
              if (!HEX_TOKEN_REGEX.test(value)) return;
              updateConfig((draft) => {
                draft.defaultGradient.to = value;
              });
            }}
            aria-label="Gradiente: colore di arrivo"
          />
        </Group>
        <Group gap={8} align="center" wrap="nowrap" style={{ flexShrink: 0 }}>
          <GradientAngleDial
            value={config.defaultGradient.deg}
            onChange={(deg) => {
              updateConfig((draft) => {
                draft.defaultGradient.deg = deg;
              });
            }}
            from={config.defaultGradient.from}
            to={config.defaultGradient.to}
            size={30}
            aria-label="Gradiente: angolo"
          />
          <NumberInput
            size="xs"
            hideControls
            min={THEME_NUMERIC_LIMITS.gradientDeg.min}
            max={THEME_NUMERIC_LIMITS.gradientDeg.max}
            value={config.defaultGradient.deg}
            onChange={(value) => {
              const bounded = toBoundedNumber(value, THEME_NUMERIC_LIMITS.gradientDeg);
              if (bounded !== null) {
                updateConfig((draft) => {
                  draft.defaultGradient.deg = bounded;
                });
              }
            }}
            suffix="°"
            aria-label="Gradiente: angolo in gradi (valore esatto)"
            style={{ width: 52, flexShrink: 0 }}
          />
        </Group>
      </Group>
      <Divider label="Radius componenti" labelPosition="left" />
      <SegmentedControl
        data={THEME_RADIUS_VALUES.map((value) => ({ value, label: value }))}
        value={config.radius}
        onChange={(value) =>
          updateConfig((draft) => {
            draft.radius = value as ThemeConfig['radius'];
          })
        }
        size="xs"
        aria-label="Radius componenti"
      />
      <Divider label="Sfondo pagina" labelPosition="left" />
      <ThemeEditorColorPicker
        value={config[editScheme].pageBg}
        onChange={(value) => {
          if (!HEX_TOKEN_REGEX.test(value)) return;
          updateConfig((draft) => {
            draft[editScheme].pageBg = value;
          });
        }}
        aria-label="Sfondo pagina"
      />
    </Stack>
  );
}

/** Pannello "Tipografia": font whitelisted, dimensioni, interlinee, titoli h1–h6. */
function PanelTypography({ config, updateConfig }: ThemeEditorPanelProps): JSX.Element {
  const fontData = (Object.keys(THEME_FONT_FAMILIES) as ThemeFontFamilyId[]).map((id) => ({
    value: id,
    label: THEME_FONT_FAMILIES[id].label,
  }));
  const monoData = (Object.keys(THEME_MONO_FONT_FAMILIES) as ThemeMonoFontFamilyId[]).map((id) => ({
    value: id,
    label: THEME_MONO_FONT_FAMILIES[id].label,
  }));
  return (
    <Stack gap="md">
      <Divider label="Font" labelPosition="left" />
      <Select
        label="Font del testo"
        size="xs"
        value={config.typography.fontFamily}
        allowDeselect={false}
        data={fontData}
        onChange={(value) => {
          if (value && value in THEME_FONT_FAMILIES) {
            updateConfig((draft) => {
              draft.typography.fontFamily = value as ThemeFontFamilyId;
            });
          }
        }}
      />
      <Select
        label="Font monospace"
        size="xs"
        value={config.typography.fontFamilyMonospace}
        allowDeselect={false}
        data={monoData}
        onChange={(value) => {
          if (value && value in THEME_MONO_FONT_FAMILIES) {
            updateConfig((draft) => {
              draft.typography.fontFamilyMonospace = value as ThemeMonoFontFamilyId;
            });
          }
        }}
      />
      <Divider label="Dimensioni testo" labelPosition="left" />
      <DimensionUnitControl
        label="Unità"
        unit={config.typography.fontSizeUnit}
        options={THEME_UNITS}
        onChange={(newUnit) => {
          const converted = convertSizeScale(
            config.typography.fontSizes,
            config.typography.fontSizeUnit,
            newUnit,
            DEFAULT_THEME_CONFIG.typography.fontSizes,
          );
          updateConfig((draft) => {
            draft.typography.fontSizeUnit = newUnit;
            draft.typography.fontSizes = converted;
          });
        }}
      />
      <ScaleNumberRow
        scale={config.typography.fontSizes}
        limits={THEME_DIMENSION_UNIT_LIMITS.fontSize[config.typography.fontSizeUnit]}
        unit={config.typography.fontSizeUnit}
        onChange={(size, value) =>
          updateConfig((draft) => {
            draft.typography.fontSizes[size] = value;
          })
        }
      />
      <Divider label="Interlinee" labelPosition="left" />
      <ScaleNumberRow
        scale={config.typography.lineHeights}
        limits={THEME_NUMERIC_LIMITS.lineHeight}
        step={0.05}
        onChange={(size, value) =>
          updateConfig((draft) => {
            draft.typography.lineHeights[size] = value;
          })
        }
      />
      <Divider label="Titoli" labelPosition="left" />
      <Select
        label="Font dei titoli"
        size="xs"
        value={config.typography.headings.fontFamily}
        allowDeselect={false}
        data={fontData}
        onChange={(value) => {
          if (value && value in THEME_FONT_FAMILIES) {
            updateConfig((draft) => {
              draft.typography.headings.fontFamily = value as ThemeFontFamilyId;
            });
          }
        }}
      />
      <OptionSelect
        label="Peso dei titoli"
        value={config.typography.headings.fontWeight}
        options={THEME_FONT_WEIGHTS}
        onChange={(value: ThemeFontWeight) =>
          updateConfig((draft) => {
            draft.typography.headings.fontWeight = value;
          })
        }
      />
      <DimensionUnitControl
        label="Unità dimensione titoli"
        unit={config.typography.headings.fontSizeUnit}
        options={THEME_UNITS}
        onChange={(newUnit) => {
          updateConfig((draft) => {
            for (const level of THEME_HEADING_LEVELS) {
              draft.typography.headings.sizes[level].fontSize = convertDimension(
                draft.typography.headings.sizes[level].fontSize,
                draft.typography.headings.fontSizeUnit,
                newUnit,
                DEFAULT_THEME_CONFIG.typography.headings.sizes[level].fontSize,
              );
            }
            draft.typography.headings.fontSizeUnit = newUnit;
          });
        }}
      />
      {THEME_HEADING_LEVELS.map((level) => (
        <Group key={level} gap={6} wrap="nowrap" align="flex-end">
          <Text size="xs" fw={600} className={classes.headingLabel}>
            {level}
          </Text>
          <NumberInput
            label={config.typography.headings.fontSizeUnit}
            size="xs"
            hideControls
            value={config.typography.headings.sizes[level].fontSize}
            min={
              THEME_DIMENSION_UNIT_LIMITS.headingFontSize[config.typography.headings.fontSizeUnit]
                .min
            }
            max={
              THEME_DIMENSION_UNIT_LIMITS.headingFontSize[config.typography.headings.fontSizeUnit]
                .max
            }
            step={THEME_UNIT_STEP[config.typography.headings.fontSizeUnit]}
            decimalScale={THEME_UNIT_DECIMAL_SCALE[config.typography.headings.fontSizeUnit]}
            onChange={(value) => {
              const bounded = toBoundedNumber(
                value,
                THEME_DIMENSION_UNIT_LIMITS.headingFontSize[
                  config.typography.headings.fontSizeUnit
                ],
              );
              if (bounded !== null) {
                updateConfig((draft) => {
                  draft.typography.headings.sizes[level].fontSize = bounded;
                });
              }
            }}
            aria-label={`Dimensione ${level}`}
          />
          <NumberInput
            label="Interlinea"
            size="xs"
            hideControls
            step={0.05}
            value={config.typography.headings.sizes[level].lineHeight}
            min={THEME_NUMERIC_LIMITS.lineHeight.min}
            max={THEME_NUMERIC_LIMITS.lineHeight.max}
            onChange={(value) => {
              const bounded = toBoundedNumber(value, THEME_NUMERIC_LIMITS.lineHeight);
              if (bounded !== null) {
                updateConfig((draft) => {
                  draft.typography.headings.sizes[level].lineHeight = bounded;
                });
              }
            }}
            aria-label={`Interlinea ${level}`}
          />
        </Group>
      ))}
    </Stack>
  );
}

/** Pannello "Dimensioni e ombre": spaziatura, radius token, ombre strutturate. */
function PanelScales({ config, updateConfig }: ThemeEditorPanelProps): JSX.Element {
  return (
    <Stack gap="md">
      <Divider label="Spaziatura" labelPosition="left" />
      <DimensionUnitControl
        label="Unità"
        unit={config.spacingUnit}
        options={THEME_UNITS}
        onChange={(newUnit) => {
          const converted = convertSizeScale(
            config.spacing,
            config.spacingUnit,
            newUnit,
            DEFAULT_THEME_CONFIG.spacing,
          );
          updateConfig((draft) => {
            draft.spacingUnit = newUnit;
            draft.spacing = converted;
          });
        }}
      />
      <ScaleNumberRow
        scale={config.spacing}
        limits={THEME_DIMENSION_UNIT_LIMITS.spacing[config.spacingUnit]}
        unit={config.spacingUnit}
        onChange={(size, value) =>
          updateConfig((draft) => {
            draft.spacing[size] = value;
          })
        }
      />
      <Divider label="Radius token" labelPosition="left" />
      <DimensionUnitControl
        label="Unità"
        unit={config.radiusScaleUnit}
        options={THEME_UNITS}
        onChange={(newUnit) => {
          const converted = convertSizeScale(
            config.radiusScale,
            config.radiusScaleUnit,
            newUnit,
            DEFAULT_THEME_CONFIG.radiusScale,
          );
          updateConfig((draft) => {
            draft.radiusScaleUnit = newUnit;
            draft.radiusScale = converted;
          });
        }}
      />
      <ScaleNumberRow
        scale={config.radiusScale}
        limits={THEME_DIMENSION_UNIT_LIMITS.radius[config.radiusScaleUnit]}
        unit={config.radiusScaleUnit}
        onChange={(size, value) =>
          updateConfig((draft) => {
            draft.radiusScale[size] = value;
          })
        }
      />
      <Divider label="Ombre" labelPosition="left" />
      <DimensionUnitControl
        label="Unità"
        unit={config.shadowUnit}
        options={THEME_LENGTH_UNITS}
        onChange={(newUnit) => {
          updateConfig((draft) => {
            for (const size of THEME_SIZE_VALUES) {
              draft.shadows[size].y = convertDimension(
                draft.shadows[size].y,
                draft.shadowUnit,
                newUnit,
                DEFAULT_THEME_CONFIG.shadows[size].y,
              );
              draft.shadows[size].blur = convertDimension(
                draft.shadows[size].blur,
                draft.shadowUnit,
                newUnit,
                DEFAULT_THEME_CONFIG.shadows[size].blur,
              );
              draft.shadows[size].spread = convertDimension(
                draft.shadows[size].spread,
                draft.shadowUnit,
                newUnit,
                DEFAULT_THEME_CONFIG.shadows[size].spread,
              );
            }
            draft.shadowUnit = newUnit;
          });
        }}
      />
      {THEME_SIZE_VALUES.map((size) => (
        <div key={size}>
          <Text size="xs" fw={600} mb={4}>
            Ombra {size}
          </Text>
          <Group gap={6} wrap="nowrap" grow>
            <NumberInput
              label="Y"
              size="xs"
              hideControls
              value={config.shadows[size].y}
              min={THEME_DIMENSION_UNIT_LIMITS.shadowY[config.shadowUnit].min}
              max={THEME_DIMENSION_UNIT_LIMITS.shadowY[config.shadowUnit].max}
              step={THEME_UNIT_STEP[config.shadowUnit]}
              decimalScale={THEME_UNIT_DECIMAL_SCALE[config.shadowUnit]}
              suffix={` ${config.shadowUnit}`}
              onChange={(value) => {
                const bounded = toBoundedNumber(
                  value,
                  THEME_DIMENSION_UNIT_LIMITS.shadowY[config.shadowUnit],
                );
                if (bounded !== null) {
                  updateConfig((draft) => {
                    draft.shadows[size].y = bounded;
                  });
                }
              }}
              aria-label={`Ombra ${size}: offset Y`}
            />
            <NumberInput
              label="Sfocatura"
              size="xs"
              hideControls
              value={config.shadows[size].blur}
              min={THEME_DIMENSION_UNIT_LIMITS.shadowBlur[config.shadowUnit].min}
              max={THEME_DIMENSION_UNIT_LIMITS.shadowBlur[config.shadowUnit].max}
              step={THEME_UNIT_STEP[config.shadowUnit]}
              decimalScale={THEME_UNIT_DECIMAL_SCALE[config.shadowUnit]}
              suffix={` ${config.shadowUnit}`}
              onChange={(value) => {
                const bounded = toBoundedNumber(
                  value,
                  THEME_DIMENSION_UNIT_LIMITS.shadowBlur[config.shadowUnit],
                );
                if (bounded !== null) {
                  updateConfig((draft) => {
                    draft.shadows[size].blur = bounded;
                  });
                }
              }}
              aria-label={`Ombra ${size}: sfocatura`}
            />
            <NumberInput
              label="Espans."
              size="xs"
              hideControls
              value={config.shadows[size].spread}
              min={THEME_DIMENSION_UNIT_LIMITS.shadowSpread[config.shadowUnit].min}
              max={THEME_DIMENSION_UNIT_LIMITS.shadowSpread[config.shadowUnit].max}
              step={THEME_UNIT_STEP[config.shadowUnit]}
              decimalScale={THEME_UNIT_DECIMAL_SCALE[config.shadowUnit]}
              suffix={` ${config.shadowUnit}`}
              onChange={(value) => {
                const bounded = toBoundedNumber(
                  value,
                  THEME_DIMENSION_UNIT_LIMITS.shadowSpread[config.shadowUnit],
                );
                if (bounded !== null) {
                  updateConfig((draft) => {
                    draft.shadows[size].spread = bounded;
                  });
                }
              }}
              aria-label={`Ombra ${size}: espansione`}
            />
            <NumberInput
              label="Opacità"
              size="xs"
              hideControls
              step={0.01}
              value={config.shadows[size].opacity}
              min={THEME_NUMERIC_LIMITS.opacity.min}
              max={THEME_NUMERIC_LIMITS.opacity.max}
              onChange={(value) => {
                const bounded = toBoundedNumber(value, THEME_NUMERIC_LIMITS.opacity);
                if (bounded !== null) {
                  updateConfig((draft) => {
                    draft.shadows[size].opacity = bounded;
                  });
                }
              }}
              aria-label={`Ombra ${size}: opacità`}
            />
          </Group>
        </div>
      ))}
    </Stack>
  );
}

/** Pannello "Bottoni e badge": default di Button, ActionIcon e Badge. */
function PanelButtons({ config, updateConfig }: ThemeEditorPanelProps): JSX.Element {
  return (
    <Stack gap="md">
      <Divider label="Button" labelPosition="left" />
      <OptionSelect
        label="Variant"
        value={config.components.button.variant}
        options={THEME_BUTTON_VARIANTS}
        onChange={(value) =>
          updateConfig((draft) => {
            draft.components.button.variant = value;
          })
        }
      />
      <SizeOptionControl
        label="Dimensione"
        value={config.components.button.size}
        onChange={(value) =>
          updateConfig((draft) => {
            draft.components.button.size = value;
          })
        }
      />
      <SizeOptionControl
        label="Radius"
        value={config.components.button.radius}
        onChange={(value) =>
          updateConfig((draft) => {
            draft.components.button.radius = value;
          })
        }
      />
      <Divider label="ActionIcon" labelPosition="left" />
      <OptionSelect
        label="Variant"
        value={config.components.actionIcon.variant}
        options={THEME_ACTION_ICON_VARIANTS}
        onChange={(value) =>
          updateConfig((draft) => {
            draft.components.actionIcon.variant = value;
          })
        }
      />
      <SizeOptionControl
        label="Radius"
        value={config.components.actionIcon.radius}
        onChange={(value) =>
          updateConfig((draft) => {
            draft.components.actionIcon.radius = value;
          })
        }
      />
      <Divider label="Badge" labelPosition="left" />
      <OptionSelect
        label="Variant"
        value={config.components.badge.variant}
        options={THEME_BADGE_VARIANTS}
        onChange={(value) =>
          updateConfig((draft) => {
            draft.components.badge.variant = value;
          })
        }
      />
      <SizeOptionControl
        label="Dimensione"
        value={config.components.badge.size}
        onChange={(value) =>
          updateConfig((draft) => {
            draft.components.badge.size = value;
          })
        }
      />
      <SizeOptionControl
        label="Radius"
        value={config.components.badge.radius}
        onChange={(value) =>
          updateConfig((draft) => {
            draft.components.badge.radius = value;
          })
        }
      />
    </Stack>
  );
}

/** Pannello "Campi input": default di TextInput/PasswordInput/Select/NumberInput. */
function PanelInputs({ config, updateConfig }: ThemeEditorPanelProps): JSX.Element {
  return (
    <Stack gap="md">
      <OptionSelect
        label="Variant"
        value={config.components.input.variant}
        options={THEME_INPUT_VARIANTS}
        onChange={(value) =>
          updateConfig((draft) => {
            draft.components.input.variant = value;
          })
        }
      />
      <SizeOptionControl
        label="Dimensione"
        value={config.components.input.size}
        onChange={(value) =>
          updateConfig((draft) => {
            draft.components.input.size = value;
          })
        }
      />
      <SizeOptionControl
        label="Radius"
        value={config.components.input.radius}
        onChange={(value) =>
          updateConfig((draft) => {
            draft.components.input.radius = value;
          })
        }
      />
    </Stack>
  );
}

/** Pannello "Card" (parte componente): ombra/radius/padding/bordo di Paper e Card. */
function PanelCardDefaults({ config, updateConfig }: ThemeEditorPanelProps): JSX.Element {
  return (
    <Stack gap="md">
      <Divider label="Default Paper / Card" labelPosition="left" />
      <OptionSelect
        label="Ombra"
        value={config.components.card.shadow}
        options={THEME_SHADOW_OPTIONS}
        onChange={(value) =>
          updateConfig((draft) => {
            draft.components.card.shadow = value;
          })
        }
      />
      <SizeOptionControl
        label="Radius"
        value={config.components.card.radius}
        onChange={(value) =>
          updateConfig((draft) => {
            draft.components.card.radius = value;
          })
        }
      />
      <SizeOptionControl
        label="Padding"
        value={config.components.card.padding}
        onChange={(value) =>
          updateConfig((draft) => {
            draft.components.card.padding = value;
          })
        }
      />
      <Switch
        label="Bordo visibile (withBorder)"
        size="xs"
        checked={config.components.card.withBorder}
        onChange={(event) => {
          const { checked } = event.currentTarget;
          updateConfig((draft) => {
            draft.components.card.withBorder = checked;
          });
        }}
      />
    </Stack>
  );
}

/** Etichetta utente di ogni token colore navbar, nell'ordine di visualizzazione del pannello. */
const NAVBAR_COLOR_TOKENS: { token: ThemeTokenName; label: string }[] = [
  { token: 'navbarBg', label: 'Sfondo sidebar' },
  { token: 'navbarText', label: 'Testo voci' },
  { token: 'navbarHoverBg', label: 'Sfondo hover voce' },
  { token: 'navbarActiveBg', label: 'Sfondo voce attiva' },
  { token: 'navbarActiveText', label: 'Testo voce attiva' },
  { token: 'navbarBorder', label: 'Bordi interni' },
];

/**
 * Pannello "Navbar": larghezza, stato di apertura di default e stile del
 * bordo destro della sidebar (non token colore, quindi non passano dal loop
 * generico di `PageThemeEditor`), seguiti dai 6 token colore — applicati a
 * entrambi gli scheme insieme, come il resto della sezione
 * (`scopedByScheme: false`).
 */
function PanelNavbar({ config, updateConfig }: ThemeEditorPanelProps): JSX.Element {
  return (
    <Stack gap="md">
      <div>
        <Text size="xs" fw={500} mb={4}>
          Larghezza navbar
        </Text>
        <Group gap={6} wrap="nowrap" align="flex-end">
          <NumberInput
            size="xs"
            value={config.navbarWidth}
            min={THEME_DIMENSION_UNIT_LIMITS.navbarWidth[config.navbarWidthUnit].min}
            max={THEME_DIMENSION_UNIT_LIMITS.navbarWidth[config.navbarWidthUnit].max}
            step={THEME_UNIT_STEP[config.navbarWidthUnit]}
            decimalScale={THEME_UNIT_DECIMAL_SCALE[config.navbarWidthUnit]}
            suffix={` ${config.navbarWidthUnit}`}
            onChange={(value) => {
              const bounded = toBoundedNumber(
                value,
                THEME_DIMENSION_UNIT_LIMITS.navbarWidth[config.navbarWidthUnit],
              );
              if (bounded !== null) {
                updateConfig((draft) => {
                  draft.navbarWidth = bounded;
                });
              }
            }}
            aria-label="Larghezza navbar"
            style={{ flex: 1 }}
          />
          <SegmentedControl
            size="xs"
            value={config.navbarWidthUnit}
            onChange={(value) => {
              const newUnit = value as ThemeUnit;
              const converted = convertDimension(
                config.navbarWidth,
                config.navbarWidthUnit,
                newUnit,
                DEFAULT_THEME_CONFIG.navbarWidth,
              );
              updateConfig((draft) => {
                draft.navbarWidthUnit = newUnit;
                draft.navbarWidth = converted;
              });
            }}
            data={THEME_UNITS.map((u) => ({ value: u, label: u }))}
            aria-label="Unità larghezza navbar"
          />
        </Group>
      </div>
      <div>
        <Text size="xs" fw={500} mb={4}>
          Stato di apertura di default
        </Text>
        <SegmentedControl
          fullWidth
          size="xs"
          value={config.navbarDefaultCollapsed ? 'closed' : 'open'}
          onChange={(value) =>
            updateConfig((draft) => {
              draft.navbarDefaultCollapsed = value === 'closed';
            })
          }
          data={[
            { value: 'open', label: 'Aperto' },
            { value: 'closed', label: 'Chiuso' },
          ]}
          aria-label="Stato di apertura di default della navbar"
        />
      </div>
      <Divider label="Bordo destro" labelPosition="left" />
      <SegmentedControl
        fullWidth
        size="xs"
        value={config.navbarEdgeStyle}
        onChange={(value) =>
          updateConfig((draft) => {
            draft.navbarEdgeStyle = value as ThemeNavbarEdgeStyle;
          })
        }
        data={[
          { value: 'border', label: 'Bordo' },
          { value: 'shadow', label: 'Ombra' },
        ]}
        aria-label="Stile del bordo destro della sidebar"
      />
      {config.navbarEdgeStyle === 'shadow' && (
        <div>
          <Text size="xs" fw={500} mb={4}>
            Intensità ombra: {Math.round(config.navbarEdgeShadowIntensity * 100)}%
          </Text>
          <Slider
            min={THEME_NUMERIC_LIMITS.opacity.min}
            max={THEME_NUMERIC_LIMITS.opacity.max}
            step={0.01}
            value={config.navbarEdgeShadowIntensity}
            onChange={(value) =>
              updateConfig((draft) => {
                draft.navbarEdgeShadowIntensity = value;
              })
            }
            aria-label="Intensità ombra del bordo destro della sidebar"
          />
        </div>
      )}
      <Divider label="Colori" labelPosition="left" />
      {NAVBAR_COLOR_TOKENS.map(({ token, label }) => (
        <ThemeEditorColorPicker
          key={token}
          label={label}
          value={config.light[token]}
          onChange={(value) => {
            if (!HEX_TOKEN_REGEX.test(value)) return;
            updateConfig((draft) => {
              draft.light[token] = value;
              draft.dark[token] = value;
            });
          }}
          aria-label={label}
        />
      ))}
    </Stack>
  );
}

/** Pannello "Tabelle": righe alternate, hover, bordi, spaziatura verticale. */
function PanelTable({ config, updateConfig }: ThemeEditorPanelProps): JSX.Element {
  return (
    <Stack gap="md">
      <Switch
        label="Righe alternate (striped)"
        size="xs"
        checked={config.components.table.striped}
        onChange={(event) => {
          const { checked } = event.currentTarget;
          updateConfig((draft) => {
            draft.components.table.striped = checked;
          });
        }}
      />
      <Switch
        label="Evidenzia riga al passaggio"
        size="xs"
        checked={config.components.table.highlightOnHover}
        onChange={(event) => {
          const { checked } = event.currentTarget;
          updateConfig((draft) => {
            draft.components.table.highlightOnHover = checked;
          });
        }}
      />
      <Switch
        label="Bordo esterno tabella"
        size="xs"
        checked={config.components.table.withTableBorder}
        onChange={(event) => {
          const { checked } = event.currentTarget;
          updateConfig((draft) => {
            draft.components.table.withTableBorder = checked;
          });
        }}
      />
      <Switch
        label="Bordi tra le colonne"
        size="xs"
        checked={config.components.table.withColumnBorders}
        onChange={(event) => {
          const { checked } = event.currentTarget;
          updateConfig((draft) => {
            draft.components.table.withColumnBorders = checked;
          });
        }}
      />
      <SizeOptionControl
        label="Spaziatura verticale"
        value={config.components.table.verticalSpacing}
        onChange={(value) =>
          updateConfig((draft) => {
            draft.components.table.verticalSpacing = value;
          })
        }
      />
    </Stack>
  );
}

/** Pannello "Modali e overlay": Modal/Drawer, Tooltip, Loader. */
function PanelOverlays({ config, updateConfig }: ThemeEditorPanelProps): JSX.Element {
  return (
    <Stack gap="md">
      <Divider label="Modale / Drawer" labelPosition="left" />
      <SizeOptionControl
        label="Radius modale"
        value={config.components.modal.radius}
        onChange={(value) =>
          updateConfig((draft) => {
            draft.components.modal.radius = value;
          })
        }
      />
      <OptionSelect
        label="Ombra modale"
        value={config.components.modal.shadow}
        options={THEME_SHADOW_OPTIONS}
        onChange={(value) =>
          updateConfig((draft) => {
            draft.components.modal.shadow = value;
          })
        }
      />
      <SizeOptionControl
        label="Padding"
        value={config.components.modal.padding}
        onChange={(value) =>
          updateConfig((draft) => {
            draft.components.modal.padding = value;
          })
        }
      />
      <Switch
        label="Modale centrata verticalmente"
        size="xs"
        checked={config.components.modal.centered}
        onChange={(event) => {
          const { checked } = event.currentTarget;
          updateConfig((draft) => {
            draft.components.modal.centered = checked;
          });
        }}
      />
      <div>
        <Text size="xs" fw={500} mb={4}>
          Blur overlay: {config.components.modal.overlayBlur}
        </Text>
        <Slider
          min={THEME_NUMERIC_LIMITS.overlayBlur.min}
          max={THEME_NUMERIC_LIMITS.overlayBlur.max}
          step={1}
          value={config.components.modal.overlayBlur}
          onChange={(value) =>
            updateConfig((draft) => {
              draft.components.modal.overlayBlur = value;
            })
          }
          aria-label="Blur overlay"
        />
      </div>
      <Divider label="Tooltip" labelPosition="left" />
      <Switch
        label="Freccia sul tooltip"
        size="xs"
        checked={config.components.tooltip.withArrow}
        onChange={(event) => {
          const { checked } = event.currentTarget;
          updateConfig((draft) => {
            draft.components.tooltip.withArrow = checked;
          });
        }}
      />
      <SizeOptionControl
        label="Radius tooltip"
        value={config.components.tooltip.radius}
        onChange={(value) =>
          updateConfig((draft) => {
            draft.components.tooltip.radius = value;
          })
        }
      />
      <Divider label="Loader" labelPosition="left" />
      <div>
        <Text size="xs" fw={500} mb={4}>
          Tipo di loader
        </Text>
        <SegmentedControl
          fullWidth
          size="xs"
          value={config.components.loader.type}
          onChange={(value) =>
            updateConfig((draft) => {
              draft.components.loader.type = value as ThemeConfig['components']['loader']['type'];
            })
          }
          data={THEME_LOADER_TYPES.map((type) => ({
            value: type,
            label: OPTION_LABELS[type] ?? type,
          }))}
          aria-label="Tipo di loader"
        />
      </div>
    </Stack>
  );
}

interface ThemeEditorSectionPanelProps extends ThemeEditorPanelProps {
  /** Chiave della sezione attiva (da `THEME_EDITOR_SECTIONS`). */
  sectionKey: string;
}

/** Dispatcher: renderizza il pannello dedicato della sezione attiva (se esiste). */
export function ThemeEditorSectionPanel({
  sectionKey,
  ...props
}: ThemeEditorSectionPanelProps): JSX.Element | null {
  switch (sectionKey) {
    case 'primary':
      return <PanelGeneral {...props} />;
    case 'typography':
      return <PanelTypography {...props} />;
    case 'scales':
      return <PanelScales {...props} />;
    case 'buttons':
      return <PanelButtons {...props} />;
    case 'inputs':
      return <PanelInputs {...props} />;
    case 'card':
      return <PanelCardDefaults {...props} />;
    case 'navbar':
      return <PanelNavbar {...props} />;
    case 'table':
      return <PanelTable {...props} />;
    case 'overlays':
      return <PanelOverlays {...props} />;
    default:
      return null;
  }
}
