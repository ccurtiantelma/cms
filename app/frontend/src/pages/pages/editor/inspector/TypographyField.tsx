/**
 * Controllo Mantine per `kind: 'typography'` (SPEC-PROPKIND-V2-DETAILS.md § 3): un pannello
 * con un controllo per ciascun campo di `TypographyValue` (`fontFamily`/`fontSize`/`fontWeight`/
 * `fontStyle`/`textTransform`/`textDecoration`/`lineHeight`/`letterSpacing`/`wordSpacing`).
 * Nessun campo `textAlign`: non esiste in `TypographyValue` (verificato contro § 3 dello SPEC
 * prima di scrivere questo file) — aggiungerlo produrrebbe un valore che il validator
 * server-side rifiuterebbe con `400` al primo salvataggio.
 *
 * Due modificatori indipendenti, ordine fisso (SPEC-PROPKIND-V2-DETAILS.md § 3 punti 3/4):
 * - `stateful` (ADR-75) opera sull'**intero oggetto**: un solo `StateSwitcher` Normal/Hover in
 *   testa al pannello, mai per campo.
 * - `responsive` (ADR-76) opera **per campo**: ciascun campo presente porta il proprio
 *   envelope breakpoint indipendente — ogni riga sotto ha il proprio pallino d'override e
 *   scrive/legge con {@link buildTypographyFieldPatch}/{@link readTypographyFieldValue}, mai
 *   un unico envelope condiviso a livello di intero oggetto (a differenza di `spacing`/`layout`).
 *
 * Il breakpoint attivo è letto da `useActiveBreakpoint()` (7 vie, ADR-76), non dal prop
 * `activeBreakpoint` a 3 vie di `PropField.tsx` — stesso principio di `ColorField.tsx`.
 *
 * Debito dichiarato (Sub-Task S2.3, gap 3, vedi resoconto): l'allowlist Google/custom completa
 * di `SPEC-GLOBAL-KIT.md` § 1 (`fonts.google_allowlist`/`customFonts[]`) non ha oggi un hook
 * frontend pronto da consumare. `fontFamily` si limita quindi alle famiglie di sistema già
 * note (`THEME_FONT_FAMILIES`, `theme-tokens.ts`, la stessa whitelist del Theme Customizer),
 * scritte come `{ family: <id>, source: 'system' }` — il vocabolario letterale citato da
 * SPEC-PROPKIND-V2-DETAILS.md § 2 punto 2 (`default|inter|roboto|playfair|montserrat|
 * monospace`, righe riferite a un `styleFontFamily` che non esiste più nel registro dopo
 * `ADR-81-migrazione-propkind-v1-v2.md`) non ha una fonte di verità frontend viva da cui
 * leggerlo: `THEME_FONT_FAMILIES` è la whitelist di sistema più vicina realmente presente nel
 * codebase oggi.
 */
import type { ReactNode } from 'react';
import {
  Center,
  Group,
  NumberInput,
  SegmentedControl,
  Select,
  Stack,
  Text,
  Tooltip,
  VisuallyHidden,
} from '@mantine/core';
import {
  IconItalic,
  IconLetterA,
  IconLetterCase,
  IconLetterCaseLower,
  IconLetterCaseUpper,
  IconMinus,
  IconOverline,
  IconSlash,
  IconStrikethrough,
  IconUnderline,
} from '@tabler/icons-react';
import type { BlockPropDescriptor, PropStateName } from '../../../../types/blocks.types';
import { useActiveBreakpoint } from '../../../../hooks/useBlockEditorStore';
import { THEME_FONT_FAMILIES, type ThemeFontFamilyId } from '../../../../theme-tokens';
import { BREAKPOINT_LABELS } from '../../../../libs/breakpoints';
import StateSwitcher from './StateSwitcher';
import { useEditingState } from './editingState';
import {
  buildTypographyFieldPatch,
  hasTypographyFieldOverride,
  propLabel,
  readTypographyFieldValue,
  type PropsMeta,
} from './inspector.utils';
import styles from './inspector.module.css';

/** Forma runtime di un `UnitValue` (SPEC-PROPKIND-V2-DETAILS.md § 3). */
interface UnitValueLike {
  value: number;
  unit: string;
}

function isUnitValue(value: unknown): value is UnitValueLike {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as UnitValueLike).value === 'number' &&
    typeof (value as UnitValueLike).unit === 'string'
  );
}

/** Forma runtime di un `FontRefValue` con `source: 'system'` (unico caso scrivibile oggi, vedi il debito dichiarato). */
interface SystemFontRefLike {
  family: string;
  source: string;
}

function isSystemFontRef(value: unknown): value is SystemFontRefLike {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as SystemFontRefLike).family === 'string' &&
    (value as SystemFontRefLike).source === 'system'
  );
}

const FONT_WEIGHT_OPTIONS = [
  '100',
  '200',
  '300',
  '400',
  '500',
  '600',
  '700',
  '800',
  '900',
  'normal',
  'bold',
] as const;

/** Voce di un enum a icona: `hint` è il nome accessibile e il tooltip, mai solo l'icona. */
interface IconOption {
  value: string;
  hint: string;
  icon: ReactNode;
}

const ICON_SIZE = 14;

const TEXT_TRANSFORM_OPTIONS: readonly IconOption[] = [
  { value: 'none', hint: 'Nessuna trasformazione', icon: <IconMinus size={ICON_SIZE} /> },
  { value: 'uppercase', hint: 'Maiuscolo', icon: <IconLetterCaseUpper size={ICON_SIZE} /> },
  { value: 'lowercase', hint: 'Minuscolo', icon: <IconLetterCaseLower size={ICON_SIZE} /> },
  { value: 'capitalize', hint: 'Iniziali maiuscole', icon: <IconLetterCase size={ICON_SIZE} /> },
];
const FONT_STYLE_OPTIONS: readonly IconOption[] = [
  { value: 'normal', hint: 'Stile normale', icon: <IconLetterA size={ICON_SIZE} /> },
  { value: 'italic', hint: 'Corsivo', icon: <IconItalic size={ICON_SIZE} /> },
  { value: 'oblique', hint: 'Obliquo', icon: <IconSlash size={ICON_SIZE} /> },
];
const TEXT_DECORATION_OPTIONS: readonly IconOption[] = [
  { value: 'none', hint: 'Nessuna decorazione', icon: <IconMinus size={ICON_SIZE} /> },
  { value: 'underline', hint: 'Sottolineato', icon: <IconUnderline size={ICON_SIZE} /> },
  { value: 'overline', hint: 'Sopralineato', icon: <IconOverline size={ICON_SIZE} /> },
  { value: 'line-through', hint: 'Barrato', icon: <IconStrikethrough size={ICON_SIZE} /> },
];

export interface TypographyFieldProps {
  prop: BlockPropDescriptor;
  /** Valore grezzo corrente della prop (`node.props[prop.name]`), stato→campo→breakpoint. */
  value: unknown;
  propsMeta: PropsMeta;
  onSetAndCommit: (value: unknown) => void;
}

/** Rende il controllo di `kind: 'typography'`. Vedi il commento di testa del file. */
export default function TypographyField({
  prop,
  value,
  propsMeta,
  onSetAndCommit,
}: TypographyFieldProps): JSX.Element {
  const label = propLabel(prop, propsMeta);
  const activeBreakpoint = useActiveBreakpoint();
  const { editingState, setEditingState, hasPanelSwitcher } = useEditingState();
  const state: PropStateName = prop.stateful ? editingState : 'normal';

  function readField(field: string): unknown {
    return readTypographyFieldValue(value, state, field, activeBreakpoint);
  }

  function hasOverride(field: string): boolean {
    return (
      Boolean(prop.responsive) && hasTypographyFieldOverride(value, state, field, activeBreakpoint)
    );
  }

  function writeField(field: string, nakedFieldValue: unknown): void {
    onSetAndCommit(
      buildTypographyFieldPatch(value, state, field, activeBreakpoint, nakedFieldValue),
    );
  }

  const breakpointSuffix =
    activeBreakpoint === 'default' ? '' : ` (${BREAKPOINT_LABELS[activeBreakpoint]})`;

  /**
   * Etichetta di riga con il pallino d'override, riusata da ogni campo sotto. Funzione
   * chiamata inline (mai un componente JSX `<FieldLabel />`, che React ricreerebbe a ogni
   * render perdendo lo stato interno — regola `react-hooks/static-components`): qui non c'è
   * stato da perdere, ma la funzione resta comunque una funzione, non un componente dichiarato
   * dentro il corpo di un altro componente.
   */
  function renderFieldLabel(field: string, text: string): JSX.Element {
    return (
      <Group gap={6} wrap="nowrap" className={styles.fieldRowLabel}>
        <Text size="sm">
          {text}
          {breakpointSuffix}
        </Text>
        {hasOverride(field) && (
          <Tooltip
            label="Valore specifico per questo breakpoint, non ereditato dal Desktop"
            withArrow
          >
            <span className={styles.breakpointOverrideDot} data-testid="breakpoint-override-dot" />
          </Tooltip>
        )}
      </Group>
    );
  }

  /** Riga di controllo per un campo `UnitValue` (`fontSize`/`lineHeight`/`letterSpacing`/`wordSpacing`). */
  function renderUnitField(
    field: string,
    text: string,
    units: readonly string[],
    min: number,
    max: number,
  ): JSX.Element {
    const raw = readField(field);
    const current = isUnitValue(raw) ? raw : undefined;
    const unit = current?.unit ?? units[0];
    return (
      <div className={styles.fieldRow}>
        {renderFieldLabel(field, text)}
        <Group gap="xs" wrap="nowrap">
          <NumberInput
            aria-label={`${label} — ${text}`}
            min={min}
            max={max}
            value={current?.value ?? ''}
            w={90}
            onChange={(next) =>
              writeField(field, { value: typeof next === 'number' ? next : 0, unit })
            }
          />
          <Select
            aria-label={`${label} — ${text} — Unità`}
            data={[...units]}
            value={unit}
            allowDeselect={false}
            comboboxProps={{ zIndex: 1100 }}
            w={80}
            onChange={(nextUnit) =>
              writeField(field, { value: current?.value ?? 0, unit: nextUnit ?? unit })
            }
          />
        </Group>
      </div>
    );
  }

  /**
   * Riga di controllo per un campo enum: `SegmentedControl` compatto (mockup di Design) al posto
   * di un `Select`. Le voci a icona espongono `hint` come testo nascosto (nome accessibile
   * del radio) e come tooltip; `Peso` (11 valori, troppi per una sola riga da 320px) usa etichette
   * numeriche corte su una griglia a capo, `fullWidth` disattivato per non stirarle.
   */
  function renderEnumField(
    field: string,
    text: string,
    options: readonly IconOption[],
  ): JSX.Element {
    const raw = readField(field);
    const current = typeof raw === 'string' && options.some((o) => o.value === raw) ? raw : '';
    return (
      <div className={styles.fieldRow}>
        {renderFieldLabel(field, text)}
        <SegmentedControl
          size="xs"
          fullWidth
          aria-label={`${label} — ${text}`}
          value={current}
          onChange={(next) => writeField(field, next)}
          data={options.map((option) => ({
            value: option.value,
            label: (
              <Tooltip label={option.hint} withArrow openDelay={300}>
                <Center>
                  {option.icon}
                  <VisuallyHidden>{option.hint}</VisuallyHidden>
                </Center>
              </Tooltip>
            ),
          }))}
        />
      </div>
    );
  }

  /** Riga per `fontWeight`: pulsanti toggle compatti a capo (11 valori), stessa semantica radio. */
  function renderWeightField(): JSX.Element {
    const raw = readField('fontWeight');
    const current = typeof raw === 'string' ? raw : null;
    return (
      <div className={styles.fieldRow}>
        {renderFieldLabel('fontWeight', 'Peso')}
        <div role="radiogroup" aria-label={`${label} — Peso`} className={styles.toggleGrid}>
          {FONT_WEIGHT_OPTIONS.map((weight) => (
            <button
              key={weight}
              type="button"
              role="radio"
              aria-checked={current === weight}
              data-active={current === weight || undefined}
              className={styles.toggleButton}
              onClick={() => writeField('fontWeight', weight)}
            >
              {weight}
            </button>
          ))}
        </div>
      </div>
    );
  }

  const fontFamilyRaw = readField('fontFamily');
  const fontFamilyValue = isSystemFontRef(fontFamilyRaw) ? fontFamilyRaw.family : null;

  return (
    <Stack gap="sm">
      <Group justify="space-between" wrap="nowrap">
        <Text size="sm" fw={500}>
          {label}
        </Text>
        {prop.stateful && !hasPanelSwitcher && (
          <StateSwitcher value={editingState} onChange={setEditingState} />
        )}
      </Group>

      <div className={styles.fieldRow}>
        {renderFieldLabel('fontFamily', 'Famiglia')}
        <Select
          aria-label={`${label} — Famiglia`}
          data={Object.entries(THEME_FONT_FAMILIES).map(([id, entry]) => ({
            value: id,
            label: entry.label,
          }))}
          value={fontFamilyValue}
          comboboxProps={{ zIndex: 1100 }}
          onChange={(next) =>
            next &&
            writeField('fontFamily', { family: next as ThemeFontFamilyId, source: 'system' })
          }
        />
      </div>

      {renderUnitField('fontSize', 'Dimensione', ['px', 'em', 'rem', 'vw', '%'], 1, 400)}
      {renderWeightField()}
      {renderUnitField('lineHeight', 'Interlinea', ['em', 'px'], 0, 200)}
      {renderUnitField('letterSpacing', 'Spaziatura lettere', ['px', 'em'], -20, 50)}
      {renderUnitField('wordSpacing', 'Spaziatura parole', ['px', 'em'], -20, 100)}
      {renderEnumField('textTransform', 'Trasforma', TEXT_TRANSFORM_OPTIONS)}
      {renderEnumField('fontStyle', 'Stile', FONT_STYLE_OPTIONS)}
      {renderEnumField('textDecoration', 'Decorazione', TEXT_DECORATION_OPTIONS)}
    </Stack>
  );
}
