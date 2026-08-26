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
  ColorInput,
  Group,
  NumberInput,
  Select,
  Slider,
  Stack,
  Switch,
  Text,
  TextInput,
  Textarea,
} from '@mantine/core';
import { IconPhoto, IconTrash } from '@tabler/icons-react';
import type { BlockPropDescriptor } from '../../../../types/blocks.types';
import type { EditorViewport } from '../../../../hooks/useBlockEditorStore';
import { resolveMediaSrc } from '../../../../components/blocks/media-url';
import RichTextFieldEditor from '../RichTextFieldEditor';
import {
  MULTILINE_THRESHOLD,
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

    case 'color':
      // ADR-33 § 3: non responsive, scalare puro (nessun envelope `{ default, ... }`).
      // `ColorInput` porta già un'anteprima live (swatch nel `leftSection`, controllato
      // dallo stesso `value`) — la validazione qui è solo UX (`uxError` sopra), il
      // vincolo autorevole resta il pattern esadecimale validato server-side.
      return (
        <ColorInput
          label={label}
          withAsterisk={required}
          format="hex"
          placeholder="#RRGGBB"
          value={asString(value)}
          error={error}
          onChange={(next) => onSetAndCommit(next)}
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
