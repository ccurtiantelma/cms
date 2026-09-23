/**
 * Il controllo Mantine di una singola prop, indicizzato per `PropSpec.kind` — **mai** per
 * tipo di blocco. Questo `switch` è l'intero contenuto dell'invariante strutturale di T5/T6
 * descritto nel commento di testa di `PropertyInspector.tsx`: non esiste — e non va
 * introdotto — un `HeadingField`/`ButtonField` a fianco di questo. `ContentTab.tsx` e
 * `StyleTab.tsx` sono i soli chiamanti: iterano la lista di descrittori già filtrata per
 * scheda e montano un `PropField` per ciascuno, senza mai guardare `prop.name`/`node.type`
 * per scegliere un ramo diverso da questo.
 *
 * Riceve `value`/callback come prop invece di chiudere su `PropertyForm.draft`: lo stato
 * resta un'unica fonte di verità nel form (vedi il suo commento di testa), questo
 * componente la legge e la scrive, non la duplica.
 */
import {
  Button,
  Group,
  NumberInput,
  Select,
  SegmentedControl,
  Slider,
  Stack,
  Switch,
  Text,
  TextInput,
  Textarea,
  Tooltip,
} from '@mantine/core';
import {
  IconAlignCenter,
  IconAlignLeft,
  IconAlignRight,
  IconArrowDown,
  IconArrowLeft,
  IconArrowRight,
  IconArrowUp,
  IconCrop,
  IconPhoto,
  IconTrash,
  type Icon,
} from '@tabler/icons-react';
import type { BlockPropDescriptor } from '../../../../types/blocks.types';
import { type EditorViewport } from '../../../../hooks/useBlockEditorStore';
import { resolveMediaSrc } from '../../../../components/blocks/media-url';
import RichTextFieldEditor from '../RichTextFieldEditor';
import ThemeColorPicker from './ThemeColorPicker';
import BorderField from './BorderField';
import ShadowField from './ShadowField';
import BackgroundField from './BackgroundField';
import ColorField from './ColorField';
import TypographyField from './TypographyField';
import SpacingField from './SpacingField';
import LayoutField from './LayoutField';
import {
  CONTAINER_FLEX_SEGMENTED_PROPS,
  CSS_CLASS_NAME_MAX_LENGTH,
  HTML_ID_MAX_LENGTH,
  MULTILINE_THRESHOLD,
  SPACING_SLIDER_PROPS,
  VIEWPORT_LABELS,
  asString,
  effectiveScalarForViewport,
  hasExplicitOverrideAtBreakpoint,
  propLabel,
  responsiveEnvelope,
  useThemeColorPresets,
  uxError,
  type PropsMeta,
} from './inspector.utils';
import styles from './inspector.module.css';

/**
 * Icona per ciascun valore di `flexDirection` (ADR-39, "Conseguenza": "nuovi controlli
 * Mantine ... con overlay responsive"): frecce che rappresentano l'asse principale del
 * flex layout. `flexDirection` non è più dichiarata da nessun tipo del registro dopo
 * `ADR-82-container-unificato-grid-flex.md` § "Decisione" punto 1 (consolidata dentro
 * `layout: layout` su `container` `v: 2`) — questa mappa non ha più un token da risolvere
 * finché un editor dedicato per `kind: 'layout'` non la riusa (task successivo, ADR-82 §
 * "Conseguenze"), ma resta innocua: {@link CONTAINER_FLEX_SEGMENTED_PROPS} oggi contiene
 * solo `justifyContent`/`alignItems` (vive su `section`), per cui il lookup qui sotto
 * risolve sempre a `undefined` e i segmenti restano senza icona.
 */
const FLEX_DIRECTION_ICON: Record<string, Icon> = {
  row: IconArrowRight,
  'row-reverse': IconArrowLeft,
  column: IconArrowDown,
  'column-reverse': IconArrowUp,
};

/**
 * Icona per ciascun valore di `styleAlign` (ADR-58, blocco `image`): stesso principio di
 * {@link FLEX_DIRECTION_ICON} — un allineamento orizzontale ha una mappatura icona/valore
 * universale e senza ambiguità, a differenza di `styleObjectFit` (nessuna icona standard per
 * "cover"/"contain"/"fill"/"none"), che resta un `Select` semplice.
 */
const TEXT_ALIGN_ICON: Record<string, Icon> = {
  left: IconAlignLeft,
  center: IconAlignCenter,
  right: IconAlignRight,
};

/**
 * Etichette leggibili per i valori `enum` di alcune prop, quando il token grezzo del
 * registro (es. `'6'`/`'12'` di `colSpan`, ADR-51) non è già il testo da mostrare —
 * riconosciute per nome, mai per `kind`, stesso principio di `CONTAINER_FLEX_SEGMENTED_PROPS`.
 * Un token assente dalla mappa per la prop ricade sul token grezzo (nessuna voce
 * obbligatoria).
 */
const ENUM_VALUE_LABELS: Record<string, Record<string, string>> = {
  colSpan: { '6': '50%', '12': '100%' },
  // ADR-58 (blocco `image`): i token grezzi del registro (`og`, `fill`...) non sono già il
  // testo da mostrare, stesso principio di `colSpan` sopra.
  styleSizePreset: {
    thumbnail: 'Thumbnail (1:1)',
    card: 'Card (16:9)',
    hero: 'Hero (21:9)',
    og: 'Social OG (1.91:1)',
    full: 'Originale',
    custom: 'Personalizzata',
  },
  styleObjectFit: {
    cover: 'Riempi (cover)',
    contain: 'Adatta (contain)',
    fill: 'Estendi (fill)',
    none: 'Nessuno',
  },
  styleAlign: { left: 'Sinistra', center: 'Centro', right: 'Destra' },
  // `container`/`section` v2 (ADR-82), riusato da `ContainerLayoutTab.tsx` (T-container-
  // layout-tab) per l'etichetta "Larghezza piena"/"Boxed" — stesso `Select`
  // generico di questo `case 'enum'`, nessun controllo dedicato duplicato.
  contentWidth: { boxed: 'Boxed', full: 'Larghezza piena' },
};

/**
 * Pallino d'override accanto all'etichetta di un campo `responsive` (ADR-29 § 2): visibile
 * solo quando il breakpoint attivo porta un valore esplicito nell'envelope, mai su
 * `default` (che non è mai un "override" — è la base della cascata). Il calcolo vive nel
 * chiamante (`hasExplicitOverrideAtBreakpoint`, `inspector.utils.ts`): questo componente è
 * solo la resa visiva, per restare riusabile identica nei tre rami di controllo responsive
 * sotto (Slider/SegmentedControl/Select).
 */
function BreakpointOverrideDot({ show }: { show: boolean }): JSX.Element | null {
  if (!show) return null;
  return (
    <Tooltip label="Valore specifico per questo breakpoint, non ereditato dal Desktop" withArrow>
      <span className={styles.breakpointOverrideDot} data-testid="breakpoint-override-dot" />
    </Tooltip>
  );
}

export interface PropFieldProps {
  prop: BlockPropDescriptor;
  /** Valore corrente in bozza (`PropertyForm.draft[prop.name]`). */
  value: unknown;
  propsMeta: PropsMeta;
  activeViewport: EditorViewport;
  activeBreakpoint: 'default' | 'tablet' | 'mobile';
  /** Aggiorna la sola bozza locale (nessun dispatch): usato mentre si digita. */
  onLocal: (value: unknown) => void;
  /** Scrive nello store, se il valore è davvero cambiato. */
  onCommit: (value: unknown) => void;
  /** Scrive nello store immediatamente (controlli senza `onBlur` significativo). */
  onSetAndCommit: (value: unknown) => void;
  /** Apre la Media Library per questa prop (solo `kind: 'mediaRef'`). */
  onOpenMediaPicker: () => void;
  /**
   * Apre `MediaCropperModal` sul `guid` corrente della prop (solo `kind: 'mediaRef'`, e solo
   * quando un `guid` è già scritto — ADR-49: niente da ritagliare senza un asset scelto).
   */
  onOpenCropper: () => void;
}

/** Rende il controllo Mantine di una singola prop. Vedi il commento di testa del file. */
export default function PropField({
  prop,
  value,
  propsMeta,
  activeViewport,
  activeBreakpoint,
  onLocal,
  onCommit,
  onSetAndCommit,
  onOpenMediaPicker,
  onOpenCropper,
}: PropFieldProps): JSX.Element {
  // Letto qui in cima (regola degli hook: mai dentro un ramo dello `switch` sotto), usato solo
  // da `case 'color'` — preset "Colori del Tema" di `ThemeColorPicker`, centralizzati in
  // `useThemeColorPresets()` (`inspector.utils.ts`).
  const themePresets = useThemeColorPresets();
  const label = propLabel(prop, propsMeta);
  const required = prop.required || prop.nonEmpty === true;
  // Il controllo UX legge sempre uno scalare: per una prop responsive è il valore
  // effettivo al viewport attivo (cascata ADR-29 § 2), mai l'oggetto intero (che
  // finirebbe stringificato).
  const scalarForUx =
    prop.responsive && value && typeof value === 'object' && !Array.isArray(value)
      ? effectiveScalarForViewport(value as Record<string, unknown>, activeViewport)
      : value;
  const error = uxError(prop, scalarForUx);

  switch (prop.kind) {
    case 'enum': {
      if (prop.responsive) {
        // Valore a oggetto `{ default, tablet?, mobile? }`: il controllo scrive sempre e
        // solo la chiave del viewport attivo dello Switcher (`default` su Desktop,
        // `tablet`/`mobile` altrove), preservando le altre chiavi già salvate (ADR-29 §
        // 2/§ 3 — sovrascrivere l'intero envelope con lo scalare nudo le cancellerebbe in
        // silenzio). Il controllo mostra il valore effettivo in cascata così da non
        // apparire mai vuoto, ma un cambiamento scrive solo l'override esplicito del
        // breakpoint corrente, mai un valore derivato negli altri.
        const envelope = responsiveEnvelope(prop, value);
        const displayValue = effectiveScalarForViewport(envelope, activeViewport);
        const fieldLabel =
          activeViewport === 'desktop' ? label : `${label} (${VIEWPORT_LABELS[activeViewport]})`;
        const hasOverride = hasExplicitOverrideAtBreakpoint(prop, value, activeBreakpoint);

        if (SPACING_SLIDER_PROPS.has(prop.name)) {
          // Scala chiusa dichiarata dal registro (ADR-33 § 4): lo Slider lavora per
          // indice di posizione, mai sul valore in px direttamente, così il token
          // scritto in store resta sempre uno dei `prop.values`, mai un numero libero.
          const scale = prop.values ?? [];
          const currentToken = asString(displayValue) || scale[0] || '0';
          const currentIndex = Math.max(0, scale.indexOf(currentToken));
          const writeAt = (index: number) =>
            onSetAndCommit({ ...envelope, [activeBreakpoint]: scale[index] ?? scale[0] });
          return (
            <div>
              <Group gap={6} wrap="nowrap" mb={4}>
                <Text size="sm" fw={500}>
                  {fieldLabel}
                  {required && (
                    <Text component="span" c="red" inherit>
                      {' '}
                      *
                    </Text>
                  )}
                </Text>
                <BreakpointOverrideDot show={hasOverride} />
              </Group>
              <Slider
                min={0}
                max={Math.max(scale.length - 1, 0)}
                step={1}
                value={currentIndex}
                marks={scale.map((token, index) => ({ value: index, label: `${token}px` }))}
                label={(index) => `${scale[index] ?? currentToken}px`}
                thumbLabel={fieldLabel}
                onChange={writeAt}
                mb="lg"
              />
              {error && (
                <Text size="xs" c="red">
                  {error}
                </Text>
              )}
            </div>
          );
        }

        if (CONTAINER_FLEX_SEGMENTED_PROPS.has(prop.name)) {
          // ADR-39 § "Conseguenza": un `SegmentedControl` — scelta fra un piccolo insieme
          // chiuso di opzioni mutuamente esclusive — invece del `Select` generico, per le
          // quattro props di direzione/allineamento flex di `container`. Stessa logica di
          // scrittura responsive del ramo `Select` sotto (`envelope`/`activeBreakpoint`),
          // mai un valore derivato negli altri breakpoint.
          const currentValue = asString(displayValue) || (prop.values?.[0] ?? '');
          const segments = (prop.values ?? []).map((token) => {
            const DirectionIcon = FLEX_DIRECTION_ICON[token];
            return {
              value: token,
              label: DirectionIcon ? (
                <Group gap={4} wrap="nowrap">
                  <DirectionIcon size={14} aria-hidden />
                  <span>{token}</span>
                </Group>
              ) : (
                token
              ),
            };
          });
          return (
            <div>
              <Group gap={6} wrap="nowrap" mb={4}>
                <Text size="sm" fw={500}>
                  {fieldLabel}
                  {required && (
                    <Text component="span" c="red" inherit>
                      {' '}
                      *
                    </Text>
                  )}
                </Text>
                <BreakpointOverrideDot show={hasOverride} />
              </Group>
              <SegmentedControl
                fullWidth
                data={segments}
                value={currentValue}
                onChange={(next) => onSetAndCommit({ ...envelope, [activeBreakpoint]: next })}
              />
              {error && (
                <Text size="xs" c="red">
                  {error}
                </Text>
              )}
            </div>
          );
        }

        return (
          <Select
            label={
              <Group gap={6} wrap="nowrap" component="span">
                <span>{fieldLabel}</span>
                <BreakpointOverrideDot show={hasOverride} />
              </Group>
            }
            withAsterisk={required}
            allowDeselect={false}
            comboboxProps={{ zIndex: 1100 }}
            data={(prop.values ?? []).map((token) => ({
              value: token,
              label: ENUM_VALUE_LABELS[prop.name]?.[token] ?? token,
            }))}
            value={asString(displayValue) || null}
            error={error}
            onChange={(next) => onSetAndCommit({ ...envelope, [activeBreakpoint]: next ?? '' })}
          />
        );
      }
      // `styleAlign` (ADR-58, blocco `image`): `SegmentedControl` a icone invece del `Select`
      // generico — stesso principio di `CONTAINER_FLEX_SEGMENTED_PROPS` sopra, ma per nome
      // (nessun secondo insieme di prop responsive: `styleAlign` non lo è).
      if (prop.name === 'styleAlign') {
        const currentValue = asString(value) || (prop.values?.[0] ?? '');
        const segments = (prop.values ?? []).map((token) => {
          const AlignIcon = TEXT_ALIGN_ICON[token];
          return {
            value: token,
            label: AlignIcon ? (
              <Group gap={4} wrap="nowrap">
                <AlignIcon size={14} aria-hidden />
                <span>{ENUM_VALUE_LABELS[prop.name]?.[token] ?? token}</span>
              </Group>
            ) : (
              token
            ),
          };
        });
        return (
          <div>
            <Text size="sm" fw={500} mb={4}>
              {label}
              {required && (
                <Text component="span" c="red" inherit>
                  {' '}
                  *
                </Text>
              )}
            </Text>
            <SegmentedControl
              fullWidth
              data={segments}
              value={currentValue}
              onChange={(next) => onSetAndCommit(next)}
            />
            {error && (
              <Text size="xs" c="red" mt={4}>
                {error}
              </Text>
            )}
          </div>
        );
      }
      return (
        <Select
          label={label}
          withAsterisk={required}
          allowDeselect={false}
          comboboxProps={{ zIndex: 1100 }}
          data={(prop.values ?? []).map((token) => ({
            value: token,
            label: ENUM_VALUE_LABELS[prop.name]?.[token] ?? token,
          }))}
          value={asString(value) || null}
          error={error}
          onChange={(next) => onSetAndCommit(next ?? '')}
        />
      );
    }

    case 'boolean':
      return (
        <Switch
          label={label}
          checked={value === true}
          onChange={(event) => onSetAndCommit(event.currentTarget.checked)}
        />
      );

    case 'number':
      return (
        <NumberInput
          label={label}
          withAsterisk={required}
          value={typeof value === 'number' ? value : ''}
          error={error}
          onChange={(next) => onLocal(next)}
          onBlur={() => onCommit(typeof value === 'number' ? value : Number(value) || 0)}
        />
      );

    case 'mediaRef': {
      // Niente campo libero: il valore è un `guid` di 16 esadecimali, che nessuno digita a
      // memoria — un campo di testo inviterebbe a incollare un riferimento che il server
      // rifiuta. La scrittura passa solo dalla Media Library (`onOpenMediaPicker`), che
      // restituisce un record davvero presente in `files`; la rimozione passa da
      // `onSetAndCommit`, lo stesso canale di scrittura di ogni altra prop — un guid vuoto
      // attraversa `updateBlockPropsAction` ed entra nella pila undo/redo come qualunque
      // altro commit, mai un ramo di cancellazione dedicato.
      const guid = asString(value);
      return (
        <div>
          <Text size="sm" fw={500} mb={4}>
            {label}
            {required && (
              <Text component="span" c="red" inherit>
                {' '}
                *
              </Text>
            )}
          </Text>
          <Group gap="sm" align="flex-start" wrap="nowrap">
            <span className={styles.mediaThumbFrame}>
              {guid ? (
                <img className={styles.mediaThumb} src={resolveMediaSrc(guid)} alt="" />
              ) : (
                <IconPhoto size={22} className={styles.mediaThumbPlaceholder} />
              )}
            </span>
            <Stack gap={6} flex={1}>
              <Button
                variant="light"
                size="xs"
                leftSection={<IconPhoto size={14} />}
                onClick={onOpenMediaPicker}
              >
                {guid ? 'Sostituisci Immagine' : 'Scegli Immagine'}
              </Button>
              {guid && (
                <Button
                  variant="light"
                  size="xs"
                  leftSection={<IconCrop size={14} />}
                  onClick={onOpenCropper}
                >
                  Gestisci Ritaglio & Punto Focale
                </Button>
              )}
              {guid && (
                <Button
                  variant="subtle"
                  color="red"
                  size="xs"
                  leftSection={<IconTrash size={14} />}
                  onClick={() => onSetAndCommit('')}
                >
                  Rimuovi
                </Button>
              )}
            </Stack>
          </Group>
          {error && (
            <Text size="xs" c="red" mt={4}>
              {error}
            </Text>
          )}
        </div>
      );
    }

    case 'url':
      return (
        <TextInput
          label={label}
          withAsterisk={required}
          maxLength={prop.maxLength}
          value={asString(value)}
          error={error}
          placeholder="https://esempio.it/pagina"
          onChange={(event) => onLocal(event.currentTarget.value)}
          onBlur={() => onCommit(asString(value))}
        />
      );

    case 'color': {
      // ADR-33 § 3: non responsive, scalare puro (nessun envelope `{ default, ... }`).
      // La validazione qui è solo UX (`uxError` sopra), il vincolo autorevole resta il
      // pattern esadecimale validato server-side.
      //
      // Preset "Colori del Tema" dal tema live dell'installazione (`useThemeColorPresets()`),
      // le stesse voci che l'Editor tema espone e che vestono il sito pubblicato, così un
      // colore scelto a mano su un blocco parte dalla tavolozza del sito invece che dal nulla.
      // Scrive **l'hex risolto corrente** del token scelto — mai `var(...)`: il validator
      // server-side di `kind: 'color'` accetta solo hex `#rgb`/`#rrggbb` (ADR-33 § 3), una
      // stringa `var(...)` farebbe fallire il salvataggio con 400. La selezione è quindi uno
      // snapshot statico del token al momento del click, non un riferimento dinamico che
      // segue future modifiche del tema.
      return (
        <ThemeColorPicker
          label={label}
          value={asString(value) || '#000000'}
          aria-label={label}
          themePresets={themePresets}
          onSelectPreset={(_, hex) => onSetAndCommit(hex)}
          onChange={onSetAndCommit}
        />
      );
    }

    case 'unitValue': {
      // ADR-38 § 2: valore composto `{ value, unit }`, mai uno scalare nudo. `prop.min`/
      // `prop.max` si applicano a `value` a prescindere dall'unità scelta (nessun intervallo
      // per-unità, semplificazione dichiarata dallo schema) — non responsive.
      const units = prop.units ?? [];
      const objectValue =
        value && typeof value === 'object' && !Array.isArray(value)
          ? (value as { value?: unknown; unit?: unknown })
          : {};
      const min = prop.min ?? 0;
      const max = prop.max ?? 100;
      const currentUnit =
        typeof objectValue.unit === 'string' &&
        (units as readonly string[]).includes(objectValue.unit)
          ? objectValue.unit
          : (units[0] ?? 'px');
      const currentValue = typeof objectValue.value === 'number' ? objectValue.value : min;
      const writeValue = (nextValue: number) =>
        onSetAndCommit({ value: nextValue, unit: currentUnit });
      const writeUnit = (nextUnit: string) =>
        onSetAndCommit({ value: currentValue, unit: nextUnit });
      return (
        <div>
          <Text size="sm" fw={500} mb={4}>
            {label}
            {required && (
              <Text component="span" c="red" inherit>
                {' '}
                *
              </Text>
            )}
          </Text>
          <Group gap="sm" align="center" wrap="nowrap">
            <Slider
              style={{ flex: 1 }}
              min={min}
              max={max}
              value={currentValue}
              label={(sliderValue) => `${sliderValue}${currentUnit}`}
              thumbLabel={`${label} — Valore`}
              onChange={writeValue}
            />
            <NumberInput
              aria-label={`${label} — Valore`}
              min={min}
              max={max}
              value={currentValue}
              w={90}
              onChange={(next) => writeValue(typeof next === 'number' ? next : currentValue)}
            />
            <Select
              aria-label={`${label} — Unità`}
              data={[...units]}
              value={currentUnit}
              allowDeselect={false}
              comboboxProps={{ zIndex: 1100 }}
              w={80}
              onChange={(next) => writeUnit(next ?? currentUnit)}
            />
          </Group>
          {error && (
            <Text size="xs" c="red" mt={4}>
              {error}
            </Text>
          )}
        </div>
      );
    }

    // `border`/`shadow` (ADR-38 § 3/§ 4): estratti in componenti dedicati (Sub-Task S2.3) per
    // poter aggiungere il supporto stateful (ADR-75) senza gonfiare ulteriormente questo
    // `switch` — il comportamento scalare resta identico byte-per-byte a prima dell'estrazione
    // (stesse etichette, stessi intervalli, stesso canale `onSetAndCommit`).
    case 'border':
      return (
        <BorderField
          prop={prop}
          value={value}
          propsMeta={propsMeta}
          onSetAndCommit={onSetAndCommit}
        />
      );

    case 'shadow':
      return (
        <ShadowField
          prop={prop}
          value={value}
          propsMeta={propsMeta}
          onSetAndCommit={onSetAndCommit}
        />
      );

    // I quattro kind v2 di questo Sub-Task (S2.3): ciascuno delega a un componente dedicato in
    // questa stessa cartella, mai una seconda implementazione locale della cascata stato/
    // breakpoint (`inspector.utils.ts`, sezione "PropKind v2"). `colorRef`/`typography` sono
    // già in uso da `heading`/`richText`/`button`; `spacing`/`layout` da `container`.
    case 'colorRef':
      return (
        <ColorField
          prop={prop}
          value={value}
          propsMeta={propsMeta}
          onSetAndCommit={onSetAndCommit}
        />
      );

    case 'typography':
      return (
        <TypographyField
          prop={prop}
          value={value}
          propsMeta={propsMeta}
          onSetAndCommit={onSetAndCommit}
        />
      );

    case 'spacing':
      return (
        <SpacingField
          prop={prop}
          value={value}
          propsMeta={propsMeta}
          onSetAndCommit={onSetAndCommit}
        />
      );

    case 'layout':
      return (
        <LayoutField
          prop={prop}
          value={value}
          propsMeta={propsMeta}
          onSetAndCommit={onSetAndCommit}
        />
      );

    // `background` (ADR-96 § "Decisione" punto 1): scope `none`/`color`/`gradient`, stesso
    // principio di estrazione in componente dedicato degli altri kind v2 sopra.
    case 'background':
      return (
        <BackgroundField
          prop={prop}
          value={value}
          propsMeta={propsMeta}
          onSetAndCommit={onSetAndCommit}
        />
      );

    case 'cssClassName':
    case 'htmlId':
      // ADR-38 § 5: stringa singola (nessun HTML), validata dal server contro un pattern
      // fisso — qui solo un `TextInput` col pattern duplicato in `uxError` (stesso principio
      // di `url`/`color`). `cssClassName` ammette 1-3 token spazio-separati, `htmlId` un solo
      // token: la differenza è nel `maxLength`/nel messaggio di `uxError`, non nel controllo.
      return (
        <TextInput
          label={label}
          withAsterisk={required}
          maxLength={prop.kind === 'cssClassName' ? CSS_CLASS_NAME_MAX_LENGTH : HTML_ID_MAX_LENGTH}
          value={asString(value)}
          error={error}
          placeholder={prop.kind === 'cssClassName' ? 'classe-uno classe-due' : 'id-elemento'}
          onChange={(event) => onLocal(event.currentTarget.value)}
          onBlur={() => onCommit(asString(value))}
        />
      );

    case 'pageRef':
      // ADR-52 § 3: stessa forma di `mediaRef` (guid di 16 esadecimali), ma nessuna Media
      // Library per scegliere una Pagina — non esiste oggi un "Page Picker" equivalente nel
      // codebase. Un `TextInput` col guid digitato/incollato a mano resta coerente con
      // l'assenza di verifica di esistenza/pubblicazione a scrittura (la risoluzione è a
      // valle, nella pipeline SSR pubblica): un guid inesistente o non pubblicato non è un
      // errore di validazione, produce solo una voce senza `href` in lettura.
      return (
        <TextInput
          label={label}
          withAsterisk={required}
          value={asString(value)}
          error={error}
          placeholder="Es. a1b2c3d4e5f6a7b8 (guid della Pagina)"
          onChange={(event) => onLocal(event.currentTarget.value)}
          onBlur={() => onCommit(asString(value))}
        />
      );

    case 'globalSectionRef':
      // ADR-55 § 1: stessa forma di `pageRef` (guid di 16 esadecimali), nessun Picker
      // dedicato. Il valore è normalmente scritto dall'azione di conversione (mai digitato
      // a mano), ma un `TextInput` resta coerente col resto del registro: nessuna verifica
      // di esistenza/stato a scrittura, la risoluzione è a valle nel job di export.
      return (
        <TextInput
          label={label}
          withAsterisk={required}
          value={asString(value)}
          error={error}
          placeholder="Es. a1b2c3d4e5f6a7b8 (guid della Sezione Globale)"
          onChange={(event) => onLocal(event.currentTarget.value)}
          onBlur={() => onCommit(asString(value))}
        />
      );

    case 'richText':
      return (
        <RichTextFieldEditor
          label={label}
          required={required}
          maxLength={prop.maxLength}
          value={asString(value)}
          error={error}
          onLocalChange={(next) => onLocal(next)}
          onCommit={(next) => onCommit(next)}
        />
      );

    case 'plainText':
    default: {
      const multiline = (prop.maxLength ?? 0) > MULTILINE_THRESHOLD;
      const shared = {
        label,
        withAsterisk: required,
        maxLength: prop.maxLength,
        value: asString(value),
        error,
        onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
          onLocal(event.currentTarget.value),
        onBlur: () => onCommit(asString(value)),
      };
      return multiline ? <Textarea autosize minRows={3} {...shared} /> : <TextInput {...shared} />;
    }
  }
}
