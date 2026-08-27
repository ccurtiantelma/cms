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
  ActionIcon,
  Button,
  ColorInput,
  Group,
  NumberInput,
  Popover,
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
import { useDisclosure } from '@mantine/hooks';
import {
  IconArrowDown,
  IconArrowLeft,
  IconArrowRight,
  IconArrowUp,
  IconPhoto,
  IconTrash,
  IconWorld,
  type Icon,
} from '@tabler/icons-react';
import type { BlockPropDescriptor } from '../../../../types/blocks.types';
import { useGlobalTokens, type EditorViewport } from '../../../../hooks/useBlockEditorStore';
import { resolveMediaSrc } from '../../../../components/blocks/media-url';
import RichTextFieldEditor from '../RichTextFieldEditor';
import {
  BORDER_RADIUS_RANGE,
  BORDER_STYLE_OPTIONS,
  BORDER_WIDTH_RANGE,
  CONTAINER_FLEX_SEGMENTED_PROPS,
  CSS_CLASS_NAME_MAX_LENGTH,
  HTML_ID_MAX_LENGTH,
  MULTILINE_THRESHOLD,
  SHADOW_BLUR_RANGE,
  SHADOW_OFFSET_RANGE,
  SHADOW_SPREAD_RANGE,
  SPACING_SLIDER_PROPS,
  VIEWPORT_LABELS,
  asString,
  effectiveScalarForViewport,
  propLabel,
  responsiveEnvelope,
  uxError,
  type PropsMeta,
} from './inspector.utils';
import styles from './inspector.module.css';

/**
 * Icona per ciascun valore di `flexDirection` (ADR-39, "Conseguenza": "nuovi controlli
 * Mantine ... con overlay responsive"): frecce che rappresentano l'asse principale del
 * flex layout — l'unico dei quattro controlli `CONTAINER_FLEX_SEGMENTED_PROPS` con una
 * mappatura icona/valore univoca e senza ambiguità (a differenza di `justifyContent`/
 * `alignItems`/`wrap`, dove un'icona per opzione aggiungerebbe rumore senza chiarezza).
 */
const FLEX_DIRECTION_ICON: Record<string, Icon> = {
  row: IconArrowRight,
  'row-reverse': IconArrowLeft,
  column: IconArrowDown,
  'column-reverse': IconArrowUp,
};

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
}: PropFieldProps): JSX.Element {
  // Letto qui in cima (regola degli hook: mai dentro un ramo dello `switch` sotto), usato solo
  // da `case 'color'` — F07 step 2, token picker. `null` finché l'editor non ha idratato i
  // Global Design Tokens in questa sessione (`FullScreenEditorLayout.tsx`).
  const globalTokens = useGlobalTokens();
  const [colorTokensOpened, { toggle: toggleColorTokens, close: closeColorTokens }] =
    useDisclosure(false);
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
              <Text size="sm" fw={500} mb={4}>
                {fieldLabel}
                {required && (
                  <Text component="span" c="red" inherit>
                    {' '}
                    *
                  </Text>
                )}
              </Text>
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
              <Text size="sm" fw={500} mb={4}>
                {fieldLabel}
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
            label={fieldLabel}
            withAsterisk={required}
            allowDeselect={false}
            comboboxProps={{ zIndex: 1100 }}
            data={[...(prop.values ?? [])]}
            value={asString(displayValue) || null}
            error={error}
            onChange={(next) => onSetAndCommit({ ...envelope, [activeBreakpoint]: next ?? '' })}
          />
        );
      }
      return (
        <Select
          label={label}
          withAsterisk={required}
          allowDeselect={false}
          comboboxProps={{ zIndex: 1100 }}
          data={[...(prop.values ?? [])]}
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
      // `ColorInput` porta già un'anteprima live (swatch nel `leftSection`, controllato
      // dallo stesso `value`) — la validazione qui è solo UX (`uxError` sopra), il
      // vincolo autorevole resta il pattern esadecimale validato server-side.
      //
      // F07 step 2: accanto al campo, un token picker sui Global Design Tokens (palette di
      // sito). Scrive **l'hex risolto corrente** del token scelto — mai `var(...)`: il
      // validator server-side di `kind: 'color'` accetta solo hex `#rgb`/`#rrggbb` (ADR-33 §
      // 3), una stringa `var(...)` farebbe fallire il salvataggio con 400. La selezione è
      // quindi uno snapshot statico del token al momento del click, non un riferimento
      // dinamico che segue future modifiche del Global Kit.
      const paletteTokens: ReadonlyArray<[string, string]> = globalTokens
        ? [
            ['Primario', globalTokens.palette.primary],
            ['Secondario', globalTokens.palette.secondary],
            ['Testo', globalTokens.palette.text],
            ['Accento', globalTokens.palette.accent],
          ]
        : [];
      return (
        <Group gap="xs" align="flex-end" wrap="nowrap">
          <ColorInput
            style={{ flex: 1 }}
            label={label}
            withAsterisk={required}
            format="hex"
            placeholder="#RRGGBB"
            value={asString(value)}
            error={error}
            onChange={(next) => onSetAndCommit(next)}
          />
          <Popover
            opened={colorTokensOpened}
            onClose={closeColorTokens}
            position="bottom-end"
            shadow="md"
            withinPortal
          >
            <Popover.Target>
              <Tooltip
                label={globalTokens ? 'Colori globali' : 'Nessun token globale disponibile'}
                withArrow
              >
                <ActionIcon
                  variant="default"
                  size="lg"
                  disabled={!globalTokens}
                  aria-label="Colori globali"
                  onClick={toggleColorTokens}
                >
                  <IconWorld size={16} />
                </ActionIcon>
              </Tooltip>
            </Popover.Target>
            <Popover.Dropdown>
              <Stack gap={2}>
                {paletteTokens.map(([tokenLabel, hex]) => (
                  <button
                    key={tokenLabel}
                    type="button"
                    className={styles.colorTokenOption}
                    onClick={() => {
                      onSetAndCommit(hex);
                      closeColorTokens();
                    }}
                  >
                    <span className={styles.colorTokenSwatch} style={{ backgroundColor: hex }} />
                    <span>
                      {tokenLabel} · {hex}
                    </span>
                  </button>
                ))}
              </Stack>
            </Popover.Dropdown>
          </Popover>
        </Group>
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

    case 'border': {
      // ADR-38 § 3: 4 campi fissi (`width/style/color/radius`), intervalli non configurabili
      // dalla prop. Il raggio resta un solo valore, non un campo per angolo: il registro
      // approvato dichiara `radius: number` — quattro campi per-angolo verrebbero respinti
      // dal validator (`hasOnlyKeys`) a ogni salvataggio con un 400.
      const objectValue =
        value && typeof value === 'object' && !Array.isArray(value)
          ? (value as { width?: unknown; style?: unknown; color?: unknown; radius?: unknown })
          : {};
      const currentWidth = typeof objectValue.width === 'number' ? objectValue.width : 0;
      const currentStyle =
        typeof objectValue.style === 'string' &&
        (BORDER_STYLE_OPTIONS as readonly string[]).includes(objectValue.style)
          ? objectValue.style
          : 'solid';
      const currentColor = typeof objectValue.color === 'string' ? objectValue.color : '#000000';
      const currentRadius = typeof objectValue.radius === 'number' ? objectValue.radius : 0;
      const write = (
        patch: Partial<{ width: number; style: string; color: string; radius: number }>,
      ) =>
        onSetAndCommit({
          width: currentWidth,
          style: currentStyle,
          color: currentColor,
          radius: currentRadius,
          ...patch,
        });
      return (
        <Stack gap="xs">
          <Text size="sm" fw={500}>
            {label}
            {required && (
              <Text component="span" c="red" inherit>
                {' '}
                *
              </Text>
            )}
          </Text>
          <Group grow align="flex-end" wrap="nowrap">
            <Select
              label={`${label} — Stile`}
              allowDeselect={false}
              comboboxProps={{ zIndex: 1100 }}
              data={[...BORDER_STYLE_OPTIONS]}
              value={currentStyle}
              onChange={(next) => write({ style: next ?? currentStyle })}
            />
            <ColorInput
              label={`${label} — Colore`}
              format="hex"
              placeholder="#RRGGBB"
              value={currentColor}
              onChange={(next) => write({ color: next })}
            />
          </Group>
          <div>
            <Text size="xs" c="dimmed" mb={4}>
              Spessore ({currentWidth}px)
            </Text>
            <Slider
              min={BORDER_WIDTH_RANGE[0]}
              max={BORDER_WIDTH_RANGE[1]}
              value={currentWidth}
              label={(next) => `${next}px`}
              thumbLabel={`${label} — Spessore`}
              onChange={(next) => write({ width: next })}
            />
          </div>
          <div>
            {/* Un solo controllo di raggio, non quattro per-angolo: vedi il commento sopra. */}
            <Text size="xs" c="dimmed" mb={4}>
              Raggio ({currentRadius}px)
            </Text>
            <Slider
              min={BORDER_RADIUS_RANGE[0]}
              max={BORDER_RADIUS_RANGE[1]}
              value={currentRadius}
              label={(next) => `${next}px`}
              thumbLabel={`${label} — Raggio`}
              onChange={(next) => write({ radius: next })}
            />
          </div>
          {error && (
            <Text size="xs" c="red">
              {error}
            </Text>
          )}
        </Stack>
      );
    }

    case 'shadow': {
      // ADR-38 § 4: 5 campi fissi, intervalli non configurabili dalla prop. Stessa forma per
      // box-shadow e text-shadow — nessun campo che le distingua nello schema: è il renderer
      // ad applicarla secondo il tipo di blocco, nessun toggle "Box/Text" qui (non
      // scriverebbe nulla di validato).
      const objectValue =
        value && typeof value === 'object' && !Array.isArray(value)
          ? (value as {
              x?: unknown;
              y?: unknown;
              blur?: unknown;
              spread?: unknown;
              color?: unknown;
            })
          : {};
      const currentX = typeof objectValue.x === 'number' ? objectValue.x : 0;
      const currentY = typeof objectValue.y === 'number' ? objectValue.y : 0;
      const currentBlur = typeof objectValue.blur === 'number' ? objectValue.blur : 0;
      const currentSpread = typeof objectValue.spread === 'number' ? objectValue.spread : 0;
      const currentColor = typeof objectValue.color === 'string' ? objectValue.color : '#000000';
      const write = (
        patch: Partial<{ x: number; y: number; blur: number; spread: number; color: string }>,
      ) =>
        onSetAndCommit({
          x: currentX,
          y: currentY,
          blur: currentBlur,
          spread: currentSpread,
          color: currentColor,
          ...patch,
        });
      return (
        <Stack gap="xs">
          <Text size="sm" fw={500}>
            {label}
            {required && (
              <Text component="span" c="red" inherit>
                {' '}
                *
              </Text>
            )}
          </Text>
          <ColorInput
            label={`${label} — Colore`}
            format="hex"
            placeholder="#RRGGBB"
            value={currentColor}
            onChange={(next) => write({ color: next })}
          />
          <Group grow>
            <div>
              <Text size="xs" c="dimmed" mb={4}>
                Offset X ({currentX}px)
              </Text>
              <Slider
                min={SHADOW_OFFSET_RANGE[0]}
                max={SHADOW_OFFSET_RANGE[1]}
                value={currentX}
                label={(next) => `${next}px`}
                thumbLabel={`${label} — Offset X`}
                onChange={(next) => write({ x: next })}
              />
            </div>
            <div>
              <Text size="xs" c="dimmed" mb={4}>
                Offset Y ({currentY}px)
              </Text>
              <Slider
                min={SHADOW_OFFSET_RANGE[0]}
                max={SHADOW_OFFSET_RANGE[1]}
                value={currentY}
                label={(next) => `${next}px`}
                thumbLabel={`${label} — Offset Y`}
                onChange={(next) => write({ y: next })}
              />
            </div>
          </Group>
          <div>
            <Text size="xs" c="dimmed" mb={4}>
              Sfocatura ({currentBlur}px)
            </Text>
            <Slider
              min={SHADOW_BLUR_RANGE[0]}
              max={SHADOW_BLUR_RANGE[1]}
              value={currentBlur}
              label={(next) => `${next}px`}
              thumbLabel={`${label} — Sfocatura`}
              onChange={(next) => write({ blur: next })}
            />
          </div>
          <div>
            <Text size="xs" c="dimmed" mb={4}>
              Diffusione ({currentSpread}px)
            </Text>
            <Slider
              min={SHADOW_SPREAD_RANGE[0]}
              max={SHADOW_SPREAD_RANGE[1]}
              value={currentSpread}
              label={(next) => `${next}px`}
              thumbLabel={`${label} — Diffusione`}
              onChange={(next) => write({ spread: next })}
            />
          </div>
          {error && (
            <Text size="xs" c="red">
              {error}
            </Text>
          )}
        </Stack>
      );
    }

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
