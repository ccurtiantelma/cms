/**
 * Ispettore delle proprietà del blocco selezionato (PLAN-F04-editor-visivo.md T5,
 * ispettore a schede PLAN-F04c-editor-maturo.md T6).
 *
 * **Un solo componente per tutti i tipi di blocco.** Non esiste — e non va introdotto —
 * un `HeadingInspector`/`ButtonInspector`: il form è generato leggendo il descrittore del
 * tipo in `BLOCK_TYPES` (generato dal registro backend, ADR-21) e mappando `PropSpec.kind`
 * al controllo Mantine corrispondente. Aggiungere una prop al registro la fa comparire qui
 * senza toccare questo file; aggiungere un tipo di blocco non richiede alcun file nuovo.
 * La mappa sotto è indicizzata per `kind`, mai per `type`: è la proprietà che rende vero
 * quanto sopra, e l'unica da preservare se il componente viene modificato.
 *
 * Le schede "Contenuto" e "Stile" (ADR-30 § 1) sono un raggruppamento dei descrittori
 * *prima* dello `switch` su `kind`: non una seconda via di dispaccio per tipo di blocco.
 * Un tipo senza alcuna prop `tab:'style'` mostra una sola scheda — mai una scheda vuota.
 * Le etichette vengono **solo** da `meta.props[nome].label`: il nome tecnico resta un
 * fallback per un difetto del registro, mai atteso sui cinque tipi reali (T3 li ha già
 * compilati tutti).
 *
 * La validazione mostrata qui è **solo UX**: l'autorità resta il `400` del server, che
 * `PagePageDetail` traduce nel blocco colpevole. Nessun controllo di questo file blocca il
 * salvataggio — coerente con CLAUDE.md § Frontend ("validazione client solo UX").
 */
import { useState } from 'react';
import {
  Alert,
  Badge,
  ColorInput,
  Group,
  NumberInput,
  Paper,
  Select,
  Slider,
  Stack,
  Switch,
  Tabs,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core';
import { IconInfoCircle } from '@tabler/icons-react';
import {
  BLOCK_TYPES,
  type BlockEditorPropMeta,
  type BlockPropDescriptor,
  type BlockTypeDescriptor,
} from '../../../types/blocks.types';
import {
  useActiveViewport,
  useBlockEditorStore,
  useSelectedNode,
  useTreeGeneration,
  type EditorViewport,
} from '../../../hooks/useBlockEditorStore';
import type { BlockNode } from './block-tree.utils';
import RichTextFieldEditor from './RichTextFieldEditor';
import VisualBoxModelInspector from './VisualBoxModelInspector';

/**
 * Schemi ammessi per `kind: 'url'`, ricalcati da `block-tree-validator.service.ts`
 * (SPEC-F02 § 3.6). Duplicati qui solo per anticipare l'errore a chi scrive: il rifiuto
 * autorevole resta quello del server, che applica gli stessi tre pattern.
 */
const URL_PATTERNS = [/^https?:\/\/.+/i, /^mailto:.+/i, /^\/(?!\/).*/];

/**
 * Pattern esadecimale per `kind: 'color'` (ADR-33 § 3), ricalcato da
 * `block-prop-sanitizer.service.ts`/`block-tree-validator.service.ts`. Duplicato qui solo
 * per anticipare l'errore a chi scrive: il rifiuto autorevole resta quello del server.
 */
const HEX_COLOR_PATTERN = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/**
 * Oltre questa lunghezza massima una prop `plainText` si edita su più righe invece che su
 * una sola. Sotto la soglia stanno le prop che nella pratica sono una riga (titolo,
 * etichetta, testo alternativo); sopra, i testi lunghi.
 */
const MULTILINE_THRESHOLD = 300;

/**
 * Le otto prop di spaziatura per lato di ADR-33 § 4: stesso `kind: 'enum'`/`responsive`
 * delle altre enum responsive del registro, ma l'ADR chiede un controllo Slider a step
 * invece del `Select` generico — "controlli numerici nel senso della UI, non dello
 * schema" (il valore resta comunque un token dell'insieme chiuso `prop.values`, mai un
 * numero libero). Riconosciute per nome, non per `kind` (condiviso con le altre enum
 * responsive che restano un `Select`).
 */
const SPACING_SLIDER_PROPS = new Set([
  'stylePaddingTop',
  'stylePaddingRight',
  'stylePaddingBottom',
  'stylePaddingLeft',
  'styleMarginTop',
  'styleMarginRight',
  'styleMarginBottom',
  'styleMarginLeft',
]);

/**
 * Mappa dei metadati di prop del tipo corrente, indicizzata per nome (ADR-30 § 1).
 * Esportata per `VisualBoxModelInspector.tsx`, che riceve le stesse etichette di
 * registro invece di duplicarne il testo.
 */
export type PropsMeta = Record<string, BlockEditorPropMeta> | undefined;

/**
 * Etichetta leggibile di una prop (ADR-30 § 1). Legge `meta.props[nome].label` dal
 * registro: il nome tecnico è solo un fallback per un difetto del registro (non deve
 * succedere sui tipi reali — T3 compila una voce per ogni prop di ogni tipo). Esportata:
 * `VisualBoxModelInspector.tsx` la riusa per i quattro lati di Margin/Padding, mai una
 * propria copia del fallback.
 */
export function propLabel(prop: BlockPropDescriptor, propsMeta: PropsMeta): string {
  return propsMeta?.[prop.name]?.label ?? prop.name;
}

/** Scheda dichiarata dal registro per una prop; assente = `'content'` (ADR-30 § 1). */
function propTab(prop: BlockPropDescriptor, propsMeta: PropsMeta): 'content' | 'style' {
  return propsMeta?.[prop.name]?.tab ?? 'content';
}

/** Ordine dichiarato dal registro per una prop; assente = in fondo (dopo ogni prop ordinata). */
function propOrder(prop: BlockPropDescriptor, propsMeta: PropsMeta): number {
  return propsMeta?.[prop.name]?.order ?? Number.POSITIVE_INFINITY;
}

/**
 * Raggruppa e ordina le props di un tipo in due schede, `content` e `style`, secondo
 * `meta.props[nome].tab`/`.order`. L'ordinamento è stabile: a parità di `order` (comprese
 * le props senza `order` dichiarato, tutte in fondo) resta l'ordine dichiarato dal registro.
 */
function groupPropsByTab(
  props: readonly BlockPropDescriptor[],
  propsMeta: PropsMeta,
): { content: BlockPropDescriptor[]; style: BlockPropDescriptor[] } {
  const ordered = props
    .map((prop, index) => ({ prop, index }))
    .sort((a, b) => {
      const diff = propOrder(a.prop, propsMeta) - propOrder(b.prop, propsMeta);
      return diff !== 0 ? diff : a.index - b.index;
    });

  const content: BlockPropDescriptor[] = [];
  const style: BlockPropDescriptor[] = [];
  for (const { prop } of ordered) {
    (propTab(prop, propsMeta) === 'style' ? style : content).push(prop);
  }
  return { content, style };
}

/**
 * Il valore corrente di una prop come stringa, qualunque cosa contenga il `jsonb`.
 * Esportata: `VisualBoxModelInspector.tsx` la riusa per leggere il token corrente di
 * ciascun lato invece di una propria coercizione.
 */
export function asString(value: unknown): string {
  return typeof value === 'string'
    ? value
    : value === undefined || value === null
      ? ''
      : String(value);
}

/**
 * Il default del breakpoint `default` dichiarato dal registro per una prop responsive
 * (il `default` del descrittore è già un envelope `{ default, tablet?, mobile? }`,
 * ADR-29 § 2/§ 3), come stringa. Stringa vuota se il registro non ne dichiara uno.
 */
function registryDefaultScalar(prop: BlockPropDescriptor): string {
  const envelope = prop.default;
  if (envelope && typeof envelope === 'object' && !Array.isArray(envelope)) {
    return asString((envelope as Record<string, unknown>).default);
  }
  return '';
}

/**
 * Il valore di una prop `responsive` come oggetto `{ default, tablet?, mobile? }`, mai
 * uno scalare nudo (ADR-29 § 2/§ 3). Un nodo nuovo (nessun valore ancora scritto in store)
 * riceve `{ default: <default del registro> }` — non uno scalare, per non far scrivere un
 * controllo desktop successivo sopra un valore di forma sbagliata.
 */
export function responsiveEnvelope(
  prop: BlockPropDescriptor,
  value: unknown,
): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return { default: registryDefaultScalar(prop) };
}

/**
 * Chiave dell'envelope `{ default, tablet?, mobile? }` scritta/letta per un viewport
 * dell'ispettore. Esportata: `VisualBoxModelInspector.tsx` la riusa per decidere su quale
 * chiave scrivere — mai una propria mappa duplicata (invariante protetto, vedi il suo
 * commento di testa).
 */
export function breakpointKey(viewport: EditorViewport): 'default' | 'tablet' | 'mobile' {
  return viewport === 'desktop' ? 'default' : viewport;
}

/**
 * Etichetta in coda al label del controllo quando il viewport attivo non è Desktop.
 * Esportata: `VisualBoxModelInspector.tsx` la riusa per lo stesso badge testuale sugli
 * `aria-label` dei quattro lati di Margin/Padding.
 */
export const VIEWPORT_LABELS: Record<EditorViewport, string> = {
  desktop: 'Desktop',
  tablet: 'Tablet',
  mobile: 'Mobile',
};

/**
 * Valore effettivo di una prop responsive al viewport attivo, seguendo la cascata di
 * ADR-29 § 2 (`mobile` assente ricade su `tablet`, `tablet` assente ricade su `default`) —
 * solo per mostrare nel controllo un valore mai vuoto, mai per decidere cosa scrivere: la
 * scrittura resta sempre e solo sulla chiave del viewport attivo (vedi chiamante).
 */
export function effectiveScalarForViewport(
  envelope: Record<string, unknown>,
  viewport: EditorViewport,
): unknown {
  if (viewport === 'mobile' && envelope.mobile !== undefined) return envelope.mobile;
  if (viewport !== 'desktop' && envelope.tablet !== undefined) return envelope.tablet;
  return envelope.default;
}

/** Messaggio di errore UX per una prop, o `undefined` se il valore è accettabile. */
function uxError(prop: BlockPropDescriptor, value: unknown): string | undefined {
  const text = asString(value);
  if (prop.kind === 'url' && text.trim() !== '' && !URL_PATTERNS.some((re) => re.test(text))) {
    return 'Ammessi: http(s)://…, mailto:… o un percorso che inizia con una sola /';
  }
  if (prop.kind === 'color' && text.trim() !== '' && !HEX_COLOR_PATTERN.test(text)) {
    return 'Ammesso solo esadecimale: #RGB o #RRGGBB';
  }
  if ((prop.required || prop.nonEmpty) && text.trim() === '') {
    return 'Obbligatoria: il salvataggio verrà rifiutato finché è vuota';
  }
  return undefined;
}

interface PropertyFormProps {
  node: BlockNode;
  descriptor: BlockTypeDescriptor;
}

/**
 * Form delle proprietà di un singolo nodo. Il componente esportato lo monta con una `key`
 * che unisce l'id del nodo e la generazione dell'albero: cambiare selezione **o** ricaricare
 * l'albero dal server lo rimonta, azzerando le bozze locali senza bisogno di un effetto che
 * le sincronizzi. La generazione è indispensabile perché gli id sopravvivono a un
 * salvataggio: senza, dopo la sanitizzazione server-side il campo continuerebbe a mostrare
 * il testo digitato invece di quello davvero salvato, e il `blur` successivo lo rimanderebbe
 * in store.
 *
 * Le scritture testuali vanno in store `onBlur`, non a ogni tasto: un dispatch per
 * carattere farebbe ricalcolare i selettori dell'albero ad ogni battuta (NFR § Performance
 * — editor). I controlli senza semantica di "fine modifica" (`Select`, `Switch`) scrivono
 * invece `onChange`, dove il cambiamento è già l'atto conclusivo.
 */
function PropertyForm({ node, descriptor }: PropertyFormProps): JSX.Element {
  const updateBlockPropsAction = useBlockEditorStore((state) => state.updateBlockPropsAction);
  const activeViewport = useActiveViewport();
  const activeBreakpoint = breakpointKey(activeViewport);
  const [draft, setDraft] = useState<Record<string, unknown>>(() => ({ ...node.props }));

  /** Aggiorna la sola bozza locale (nessun dispatch): usato mentre si digita. */
  function setLocal(name: string, value: unknown): void {
    setDraft((previous) => ({ ...previous, [name]: value }));
  }

  /** Scrive nello store, se il valore è davvero cambiato rispetto al nodo. */
  function commit(name: string, value: unknown): void {
    if (Object.is(value, node.props[name])) return;
    updateBlockPropsAction(node.id, { [name]: value });
  }

  /** Scrive nello store immediatamente (controlli senza `onBlur` significativo). */
  function setAndCommit(name: string, value: unknown): void {
    setLocal(name, value);
    commit(name, value);
  }

  if (descriptor.props.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        Il blocco &laquo;{descriptor.meta?.label ?? descriptor.type}&raquo; non ha proprietà
        modificabili: si configura aggiungendo blocchi al suo interno.
      </Text>
    );
  }

  const propsMeta = descriptor.meta?.props;

  /**
   * Rende il controllo Mantine di una singola prop. La mappa è per `kind` — mai per tipo
   * di blocco: è il vincolo strutturale preservato da T5/T6.
   */
  function renderField(prop: BlockPropDescriptor): JSX.Element {
    const value = draft[prop.name];
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
              setAndCommit(prop.name, {
                ...envelope,
                [activeBreakpoint]: scale[index] ?? scale[0],
              });
            return (
              <div key={prop.name}>
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
              key={prop.name}
              label={fieldLabel}
              withAsterisk={required}
              allowDeselect={false}
              comboboxProps={{ zIndex: 1100 }}
              data={[...(prop.values ?? [])]}
              value={asString(displayValue) || null}
              error={error}
              onChange={(next) =>
                setAndCommit(prop.name, { ...envelope, [activeBreakpoint]: next ?? '' })
              }
            />
          );
        }
        return (
          <Select
            key={prop.name}
            label={label}
            withAsterisk={required}
            allowDeselect={false}
            comboboxProps={{ zIndex: 1100 }}
            data={[...(prop.values ?? [])]}
            value={asString(value) || null}
            error={error}
            onChange={(next) => setAndCommit(prop.name, next ?? '')}
          />
        );
      }

      case 'boolean':
        return (
          <Switch
            key={prop.name}
            label={label}
            checked={value === true}
            onChange={(event) => setAndCommit(prop.name, event.currentTarget.checked)}
          />
        );

      case 'number':
        return (
          <NumberInput
            key={prop.name}
            label={label}
            withAsterisk={required}
            value={typeof value === 'number' ? value : ''}
            error={error}
            onChange={(next) => setLocal(prop.name, next)}
            onBlur={() => commit(prop.name, typeof value === 'number' ? value : Number(value) || 0)}
          />
        );

      case 'mediaRef':
        // Nessuna scorciatoia che finga una libreria media: F09 non è costruita, e un
        // campo libero inviterebbe a incollare un riferimento che il server rifiuta.
        return (
          <TextInput
            key={prop.name}
            label={label}
            withAsterisk={required}
            disabled
            value={asString(value)}
            placeholder="Libreria media non disponibile (F09 non ancora costruita)"
          />
        );

      case 'url':
        return (
          <TextInput
            key={prop.name}
            label={label}
            withAsterisk={required}
            maxLength={prop.maxLength}
            value={asString(value)}
            error={error}
            placeholder="https://esempio.it/pagina"
            onChange={(event) => setLocal(prop.name, event.currentTarget.value)}
            onBlur={() => commit(prop.name, asString(value))}
          />
        );

      case 'color':
        // ADR-33 § 3: non responsive, scalare puro (nessun envelope `{ default, ... }`).
        // `ColorInput` porta già un'anteprima live (swatch nel `leftSection`, controllato
        // dallo stesso `value`) — la validazione qui è solo UX (`uxError` sopra), il
        // vincolo autorevole resta il pattern esadecimale validato server-side.
        return (
          <ColorInput
            key={prop.name}
            label={label}
            withAsterisk={required}
            format="hex"
            placeholder="#RRGGBB"
            value={asString(value)}
            error={error}
            onChange={(next) => setAndCommit(prop.name, next)}
          />
        );

      case 'richText':
        return (
          <RichTextFieldEditor
            key={prop.name}
            label={label}
            required={required}
            maxLength={prop.maxLength}
            value={asString(value)}
            error={error}
            onLocalChange={(next) => setLocal(prop.name, next)}
            onCommit={(next) => commit(prop.name, next)}
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
            setLocal(prop.name, event.currentTarget.value),
          onBlur: () => commit(prop.name, asString(value)),
        };
        return multiline ? (
          <Textarea key={prop.name} autosize minRows={3} {...shared} />
        ) : (
          <TextInput key={prop.name} {...shared} />
        );
      }
    }
  }

  /**
   * Le prop della scheda "Stile", con le otto di spaziatura raggruppate in un unico
   * `VisualBoxModelInspector` invece degli otto `Slider` individuali — solo quando il tipo
   * in editing le dichiara **tutte e otto** (ADR-33 § 4): un tipo futuro con solo alcune
   * di quelle otto (oggi non reale) ricade sul rendering individuale invariato, mai
   * un'assunzione che siano sempre tutte presenti. L'ordine delle altre prop di stile
   * resta quello dichiarato dal registro; il box model prende il posto della prima prop
   * di spaziatura incontrata, le successive vengono saltate (già rese lì dentro).
   */
  function renderStyleFields(fields: BlockPropDescriptor[]): JSX.Element[] {
    const spacingByName = new Map(
      fields
        .filter((field) => SPACING_SLIDER_PROPS.has(field.name))
        .map((field) => [field.name, field]),
    );
    if (spacingByName.size !== SPACING_SLIDER_PROPS.size) {
      return fields.map(renderField);
    }

    const rendered: JSX.Element[] = [];
    let boxModelInserted = false;
    for (const field of fields) {
      if (SPACING_SLIDER_PROPS.has(field.name)) {
        if (!boxModelInserted) {
          rendered.push(
            <VisualBoxModelInspector
              key="visual-box-model"
              spacingProps={{
                stylePaddingTop: spacingByName.get('stylePaddingTop')!,
                stylePaddingRight: spacingByName.get('stylePaddingRight')!,
                stylePaddingBottom: spacingByName.get('stylePaddingBottom')!,
                stylePaddingLeft: spacingByName.get('stylePaddingLeft')!,
                styleMarginTop: spacingByName.get('styleMarginTop')!,
                styleMarginRight: spacingByName.get('styleMarginRight')!,
                styleMarginBottom: spacingByName.get('styleMarginBottom')!,
                styleMarginLeft: spacingByName.get('styleMarginLeft')!,
              }}
              draft={draft}
              propsMeta={propsMeta}
              activeViewport={activeViewport}
              setAndCommit={setAndCommit}
            />,
          );
          boxModelInserted = true;
        }
        continue;
      }
      rendered.push(renderField(field));
    }
    return rendered;
  }

  const { content, style } = groupPropsByTab(descriptor.props, propsMeta);

  // Un tipo senza alcuna prop `tab:'style'` mostra una sola scheda — mai una scheda vuota
  // (ADR-30 § 1). Simmetricamente per l'ipotesi (oggi non reale sui cinque tipi) di un tipo
  // interamente di stile: nessuna scelta da offrire quando c'è una sola scheda possibile.
  if (style.length === 0) {
    return <Stack gap="md">{content.map(renderField)}</Stack>;
  }
  if (content.length === 0) {
    return <Stack gap="md">{renderStyleFields(style)}</Stack>;
  }

  return (
    <Tabs defaultValue="content" keepMounted={false}>
      <Tabs.List>
        <Tabs.Tab value="content">Contenuto</Tabs.Tab>
        <Tabs.Tab value="style">Stile</Tabs.Tab>
      </Tabs.List>
      <Tabs.Panel value="content" pt="md">
        <Stack gap="md">{content.map(renderField)}</Stack>
      </Tabs.Panel>
      <Tabs.Panel value="style" pt="md">
        <Stack gap="md">{renderStyleFields(style)}</Stack>
      </Tabs.Panel>
    </Tabs>
  );
}

/** Pannello delle proprietà del blocco selezionato nel canvas. */
export default function PropertyInspector(): JSX.Element {
  const node = useSelectedNode();
  const generation = useTreeGeneration();
  const descriptor = node ? BLOCK_TYPES.find((entry) => entry.type === node.type) : undefined;

  return (
    <Paper withBorder p="md" radius="md">
      <Stack gap="sm">
        <Group justify="space-between" wrap="nowrap">
          <Text fw={600}>Proprietà</Text>
          {descriptor && <Badge variant="light">{descriptor.meta?.label ?? descriptor.type}</Badge>}
        </Group>

        {!node ? (
          <Text size="sm" c="dimmed">
            Seleziona un blocco nel canvas per modificarne le proprietà.
          </Text>
        ) : !descriptor ? (
          // Un tipo fuori registro non è raggiungibile dalla palette, ma può arrivare da un
          // contenuto salvato prima che il tipo venisse rimosso: si dice cosa succede invece
          // di mostrare un pannello vuoto.
          <Alert color="orange" icon={<IconInfoCircle size={16} />}>
            Il tipo di blocco &laquo;{node.type}&raquo; non è nel registro: non è modificabile e il
            salvataggio verrà rifiutato finché il blocco resta nell&apos;albero.
          </Alert>
        ) : (
          <PropertyForm key={`${node.id}:${generation}`} node={node} descriptor={descriptor} />
        )}
      </Stack>
    </Paper>
  );
}
