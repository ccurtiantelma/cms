/**
 * Utility pure e costanti condivise dall'ispettore delle proprietà (`PropertyInspector.tsx`,
 * `ContentTab.tsx`, `StyleTab.tsx`, `PropField.tsx`) e da `VisualBoxModelInspector.tsx`.
 *
 * Vive fuori da `PropertyInspector.tsx` proprio perché non è più un solo file: prima del
 * T-inspector-restyle queste funzioni erano definite lì e riesportate; ora che il rendering
 * dei campi è diviso in sotto-componenti, il punto di verità unico è questo modulo — mai
 * una copia locale in un sotto-componente (violerebbe lo stesso invariante che
 * `VisualBoxModelInspector.tsx` proteggeva riusando gli export di `PropertyInspector.tsx`).
 */
import type { BlockEditorPropMeta, BlockPropDescriptor } from '../../../../types/blocks.types';
import type { EditorViewport } from '../../../../hooks/useBlockEditorStore';

/**
 * Schemi ammessi per `kind: 'url'`, ricalcati da `block-tree-validator.service.ts`
 * (SPEC-F02 § 3.6). Duplicati qui solo per anticipare l'errore a chi scrive: il rifiuto
 * autorevole resta quello del server, che applica gli stessi tre pattern.
 */
export const URL_PATTERNS = [/^https?:\/\/.+/i, /^mailto:.+/i, /^\/(?!\/).*/];

/**
 * Pattern esadecimale per `kind: 'color'` (ADR-33 § 3), ricalcato da
 * `block-prop-sanitizer.service.ts`/`block-tree-validator.service.ts`. Duplicato qui solo
 * per anticipare l'errore a chi scrive: il rifiuto autorevole resta quello del server.
 */
export const HEX_COLOR_PATTERN = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/**
 * Oltre questa lunghezza massima una prop `plainText` si edita su più righe invece che su
 * una sola. Sotto la soglia stanno le prop che nella pratica sono una riga (titolo,
 * etichetta, testo alternativo); sopra, i testi lunghi.
 */
export const MULTILINE_THRESHOLD = 300;

/**
 * z-index della Media Library aperta dall'ispettore. `FullScreenEditorLayout` occupa il
 * livello 1000 (`FullScreenEditorLayout.module.css`) e il pannello a schermo intero del
 * rich text arriva a 1200 (`RichTextFieldEditor.module.css`): il default 200 di `Modal`
 * finirebbe **sotto** l'editor, invisibile. Stessa ragione per cui i `Select` di `PropField`
 * forzano già `comboboxProps={{ zIndex: 1100 }}`.
 */
export const MEDIA_MODAL_Z_INDEX = 1300;

/**
 * Le otto prop di spaziatura per lato di ADR-33 § 4: stesso `kind: 'enum'`/`responsive`
 * delle altre enum responsive del registro, ma l'ADR chiede un controllo Slider a step
 * invece del `Select` generico — "controlli numerici nel senso della UI, non dello
 * schema" (il valore resta comunque un token dell'insieme chiuso `prop.values`, mai un
 * numero libero). Riconosciute per nome, non per `kind` (condiviso con le altre enum
 * responsive che restano un `Select`).
 */
export const SPACING_SLIDER_PROPS = new Set([
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
 * Riusata da ogni sotto-componente dell'ispettore e da `VisualBoxModelInspector.tsx`, che
 * riceve le stesse etichette di registro invece di duplicarne il testo.
 */
export type PropsMeta = Record<string, BlockEditorPropMeta> | undefined;

/**
 * Etichetta leggibile di una prop (ADR-30 § 1). Legge `meta.props[nome].label` dal
 * registro: il nome tecnico è solo un fallback per un difetto del registro (non deve
 * succedere sui tipi reali — T3 compila una voce per ogni prop di ogni tipo).
 */
export function propLabel(prop: BlockPropDescriptor, propsMeta: PropsMeta): string {
  return propsMeta?.[prop.name]?.label ?? prop.name;
}

/** Scheda dichiarata dal registro per una prop; assente = `'content'` (ADR-30 § 1, ADR-37 § 5). */
export function propTab(
  prop: BlockPropDescriptor,
  propsMeta: PropsMeta,
): 'content' | 'style' | 'advanced' {
  return propsMeta?.[prop.name]?.tab ?? 'content';
}

/** Ordine dichiarato dal registro per una prop; assente = in fondo (dopo ogni prop ordinata). */
export function propOrder(prop: BlockPropDescriptor, propsMeta: PropsMeta): number {
  return propsMeta?.[prop.name]?.order ?? Number.POSITIVE_INFINITY;
}

/**
 * Raggruppa e ordina le props di un tipo in tre schede, `content`/`style`/`advanced`,
 * secondo `meta.props[nome].tab`/`.order` (ADR-30 § 1, ADR-37 § 5). L'ordinamento è
 * stabile: a parità di `order` (comprese le props senza `order` dichiarato, tutte in
 * fondo) resta l'ordine dichiarato dal registro.
 */
export function groupPropsByTab(
  props: readonly BlockPropDescriptor[],
  propsMeta: PropsMeta,
): { content: BlockPropDescriptor[]; style: BlockPropDescriptor[]; advanced: BlockPropDescriptor[] } {
  const ordered = props
    .map((prop, index) => ({ prop, index }))
    .sort((a, b) => {
      const diff = propOrder(a.prop, propsMeta) - propOrder(b.prop, propsMeta);
      return diff !== 0 ? diff : a.index - b.index;
    });

  const content: BlockPropDescriptor[] = [];
  const style: BlockPropDescriptor[] = [];
  const advanced: BlockPropDescriptor[] = [];
  for (const { prop } of ordered) {
    const tab = propTab(prop, propsMeta);
    (tab === 'style' ? style : tab === 'advanced' ? advanced : content).push(prop);
  }
  return { content, style, advanced };
}

/**
 * Il valore corrente di una prop come stringa, qualunque cosa contenga il `jsonb`.
 * Riusata da `VisualBoxModelInspector.tsx` per leggere il token corrente di ciascun lato
 * invece di una propria coercizione.
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
 * dell'ispettore. Riusata da `VisualBoxModelInspector.tsx` per decidere su quale chiave
 * scrivere — mai una propria mappa duplicata (invariante protetto, vedi il suo commento
 * di testa).
 */
export function breakpointKey(viewport: EditorViewport): 'default' | 'tablet' | 'mobile' {
  return viewport === 'desktop' ? 'default' : viewport;
}

/**
 * Etichetta in coda al label del controllo quando il viewport attivo non è Desktop.
 * Riusata da `VisualBoxModelInspector.tsx` per lo stesso badge testuale sugli `aria-label`
 * dei quattro lati di Margin/Padding.
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
export function uxError(prop: BlockPropDescriptor, value: unknown): string | undefined {
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
