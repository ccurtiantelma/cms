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
 * Pattern per un singolo token di `kind: 'cssClassName'`/`'htmlId'` (ADR-38 § 5), ricalcato
 * da `CSS_IDENTIFIER_TOKEN_PATTERN` di `block-tree-validator.service.ts`. Duplicato qui solo
 * per anticipare l'errore a chi scrive: il rifiuto autorevole resta quello del server.
 */
export const CSS_IDENTIFIER_TOKEN_PATTERN = /^[a-zA-Z_-][a-zA-Z0-9_-]{0,49}$/;

/** Lunghezza massima totale di `kind: 'cssClassName'` (somma di 1-3 token, ADR-38 § 5). */
export const CSS_CLASS_NAME_MAX_LENGTH = 100;

/** Numero massimo di token spazio-separati ammessi da `kind: 'cssClassName'` (ADR-38 § 5). */
export const CSS_CLASS_NAME_MAX_TOKENS = 3;

/** Lunghezza massima di `kind: 'htmlId'`: un solo token (ADR-38 § 5). */
export const HTML_ID_MAX_LENGTH = 50;

/**
 * Vero se `value` è un `kind: 'cssClassName'` ammesso: 1-3 token spazio-separati, ciascuno
 * conforme a `CSS_IDENTIFIER_TOKEN_PATTERN`, somma ≤ `CSS_CLASS_NAME_MAX_LENGTH` — ricalcato
 * da `isValidCssClassName` del validator server-side, stesso principio di duplicazione di
 * `HEX_COLOR_PATTERN`/`URL_PATTERNS`: solo UX, l'autorità resta il 400 del server.
 */
export function isValidCssClassNameUx(value: string): boolean {
  if (value.length === 0 || value.length > CSS_CLASS_NAME_MAX_LENGTH) return false;
  const tokens = value.split(' ');
  if (tokens.length > CSS_CLASS_NAME_MAX_TOKENS) return false;
  return tokens.every((token) => CSS_IDENTIFIER_TOKEN_PATTERN.test(token));
}

/** Stili ammessi per `kind: 'border'` (ADR-38 § 3), stesso elenco chiuso del validator. */
export const BORDER_STYLE_OPTIONS = ['solid', 'dashed', 'dotted', 'none'] as const;

/**
 * Intervalli **fissi** (unità implicita px) di `kind: 'border'`/`'shadow'` (ADR-38 § 3/§ 4):
 * non configurabili dalla prop, a differenza di `unitValue` — ricalcati dalle stesse
 * costanti del validator server-side, di nuovo solo per anticipare l'errore in UI.
 */
export const BORDER_WIDTH_RANGE = [0, 12] as const;
export const BORDER_RADIUS_RANGE = [0, 48] as const;
export const SHADOW_OFFSET_RANGE = [-48, 48] as const;
export const SHADOW_BLUR_RANGE = [0, 64] as const;
export const SHADOW_SPREAD_RANGE = [-24, 24] as const;

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
 * Le quattro props di direzione/allineamento flex di `container` (ADR-39): stesso
 * `kind: 'enum'`/`responsive` delle altre enum responsive del registro, ma la
 * "Conseguenza" dell'ADR chiede esplicitamente "nuovi controlli Mantine per
 * display/flexDirection/justifyContent/alignItems/wrap con overlay responsive
 * tablet/mobile" — un `SegmentedControl` (scelta fra un piccolo insieme chiuso di
 * opzioni mutuamente esclusive) invece del `Select` generico. Riconosciute per nome,
 * stesso principio di `SPACING_SLIDER_PROPS`: `gap` resta deliberatamente fuori da questo
 * insieme (stessa scala di token di `section.gap`, l'ADR chiede di riusare il controllo
 * esistente così com'è), `display` resta sul `Select` non responsive (un solo valore
 * ammesso in questo round, ADR-39 § 2 punto 1).
 */
export const CONTAINER_FLEX_SEGMENTED_PROPS = new Set([
  'flexDirection',
  'justifyContent',
  'alignItems',
  'wrap',
]);

/**
 * Nomi extra (oltre a `SPACING_SLIDER_PROPS`) che nel tab "Stile" finiscono nella sezione
 * Accordion "Spaziatura" (T-inspector-elementor-parity): `styleSpaceBefore/After` sono lo
 * spazio verticale attorno al blocco, `stylePadding`/`styleBackground` sono l'unico altro
 * controllo di spaziatura/sfondo dichiarato dal registro (oggi solo su `section`).
 * Riconosciuti per nome, non per `kind` — stesso principio di `SPACING_SLIDER_PROPS`.
 */
const STYLE_SPACING_SECTION_EXTRA_NAMES = new Set([
  'styleSpaceBefore',
  'styleSpaceAfter',
  'stylePadding',
  'styleBackground',
]);

/**
 * Nomi di prop del tab "Contenuto" riconosciuti come allineamento (T-inspector-elementor-
 * parity), sul modello di `SPACING_SLIDER_PROPS`: per nome, mai per `kind`. Nel registro
 * reale odierno nessuna prop `tab: 'content'` corrisponde (`heading.level` è strutturale,
 * non di allineamento) — la sezione "Allineamento" del `ContentTab` semplicemente non
 * compare finché non esisterà una prop così, stessa regola di "una sezione senza campi non
 * compare" applicata alle sezioni Accordion.
 */
function isContentAlignmentPropName(name: string): boolean {
  return /align/i.test(name);
}

/** Sezioni Accordion del tab "Contenuto" (T-inspector-elementor-parity), in ordine fisso di visualizzazione. */
export const CONTENT_SECTION_ORDER = ['Testo / Media', 'Allineamento'] as const;

/** Sezioni Accordion del tab "Stile" (T-inspector-elementor-parity), in ordine fisso di visualizzazione. */
export const STYLE_SECTION_ORDER = ['Tipografia & Colori', 'Bordo', 'Ombra', 'Spaziatura'] as const;

/** Sezioni Accordion del tab "Avanzato" (T-inspector-elementor-parity), in ordine fisso di visualizzazione. */
export const ADVANCED_SECTION_ORDER = ['Layout & Responsive', 'Attributi Custom'] as const;

/**
 * Sezione Accordion del tab "Contenuto" per una prop: quasi sempre "Testo / Media", tranne
 * il piccolo insieme di nomi riconosciuti come allineamento (vedi `isContentAlignmentPropName`).
 */
export function contentSectionFor(
  prop: BlockPropDescriptor,
): (typeof CONTENT_SECTION_ORDER)[number] {
  return isContentAlignmentPropName(prop.name) ? 'Allineamento' : 'Testo / Media';
}

/**
 * Sezione Accordion del tab "Stile" per una prop: `border`/`shadow` per `kind`, spaziatura
 * per nome (`SPACING_SLIDER_PROPS` + `STYLE_SPACING_SECTION_EXTRA_NAMES`), tutto il resto
 * (colori, `unitValue`, gli altri enum di font/layout) in "Tipografia & Colori" — mai una
 * distinzione per `node.type`.
 */
export function styleSectionFor(prop: BlockPropDescriptor): (typeof STYLE_SECTION_ORDER)[number] {
  if (prop.kind === 'border') return 'Bordo';
  if (prop.kind === 'shadow') return 'Ombra';
  if (SPACING_SLIDER_PROPS.has(prop.name) || STYLE_SPACING_SECTION_EXTRA_NAMES.has(prop.name)) {
    return 'Spaziatura';
  }
  return 'Tipografia & Colori';
}

/**
 * Sezione Accordion del tab "Avanzato" per una prop: `cssClassName`/`htmlId` per `kind` in
 * "Attributi Custom", tutto il resto (`styleLayer`, `styleHideDesktop/Tablet/Mobile`) in
 * "Layout & Responsive".
 */
export function advancedSectionFor(
  prop: BlockPropDescriptor,
): (typeof ADVANCED_SECTION_ORDER)[number] {
  return prop.kind === 'cssClassName' || prop.kind === 'htmlId'
    ? 'Attributi Custom'
    : 'Layout & Responsive';
}

/** Una sezione Accordion popolata: nome e le props del tab che vi appartengono, in ordine di registro. */
export interface PropSection {
  section: string;
  items: BlockPropDescriptor[];
}

/**
 * Raggruppa le props già filtrate per tab (`groupPropsByTab`) in sezioni Accordion, secondo
 * `sectionFor` e nell'ordine fisso di `order`. Stessa regola già in vigore per le tre schede
 * di primo livello: **una sezione senza props non compare mai** — mai una sezione Accordion
 * vuota, coerente con `PropertyForm.availableTabs` in `PropertyInspector.tsx`.
 */
export function groupPropsBySection(
  props: readonly BlockPropDescriptor[],
  sectionFor: (prop: BlockPropDescriptor) => string,
  order: readonly string[],
): PropSection[] {
  const bySection = new Map<string, BlockPropDescriptor[]>();
  for (const prop of props) {
    const section = sectionFor(prop);
    const existing = bySection.get(section);
    if (existing) existing.push(prop);
    else bySection.set(section, [prop]);
  }
  return order
    .map((section) => ({ section, items: bySection.get(section) ?? [] }))
    .filter((entry) => entry.items.length > 0);
}

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
): {
  content: BlockPropDescriptor[];
  style: BlockPropDescriptor[];
  advanced: BlockPropDescriptor[];
} {
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

/**
 * Vero se una prop `responsive` porta un valore esplicito per il breakpoint attivo — cioè
 * la chiave esiste nell'envelope (ADR-29 § 2), non che coincida col valore in cascata: un
 * `tablet` esplicito uguale al `default` resta comunque un override (`{ ...valore,
 * default: nuovo }`, mai la cancellazione della chiave). `default` non è mai un
 * "override": è la base su cui gli altri due breakpoint cascano, quindi `false` a
 * prescindere dal valore quando `breakpoint === 'default'`.
 */
export function hasExplicitOverrideAtBreakpoint(
  prop: BlockPropDescriptor,
  value: unknown,
  breakpoint: 'default' | 'tablet' | 'mobile',
): boolean {
  if (!prop.responsive || breakpoint === 'default') return false;
  const envelope = responsiveEnvelope(prop, value);
  return envelope[breakpoint] !== undefined;
}

/** Messaggio di errore UX per una prop, o `undefined` se il valore è accettabile. */
export function uxError(prop: BlockPropDescriptor, value: unknown): string | undefined {
  // `unitValue`/`border`/`shadow` sono valori a oggetto, mai testo (ADR-38 § 2/§ 3/§ 4):
  // `asString` li stringificherebbe in `[object Object]`. Non c'è uno stato "vuoto"
  // significativo per questi tre — ogni campo numerico resta comunque vincolato dal proprio
  // controllo (Slider min/max, `Select` per un enum chiuso), e nessuna delle prop reali che
  // li usano è `required`. Il controllo qui si ferma prima di leggerli come stringa.
  if (prop.kind === 'unitValue' || prop.kind === 'border' || prop.kind === 'shadow') {
    return undefined;
  }
  const text = asString(value);
  if (prop.kind === 'url' && text.trim() !== '' && !URL_PATTERNS.some((re) => re.test(text))) {
    return 'Ammessi: http(s)://…, mailto:… o un percorso che inizia con una sola /';
  }
  if (prop.kind === 'color' && text.trim() !== '' && !HEX_COLOR_PATTERN.test(text)) {
    return 'Ammesso solo esadecimale: #RGB o #RRGGBB';
  }
  if (prop.kind === 'cssClassName' && text.trim() !== '' && !isValidCssClassNameUx(text)) {
    return 'Ammessi 1-3 nomi separati da spazio: lettere, cifre, trattino o underscore, mai una cifra iniziale — massimo 100 caratteri in totale';
  }
  if (prop.kind === 'htmlId' && text.trim() !== '' && !CSS_IDENTIFIER_TOKEN_PATTERN.test(text)) {
    return 'Ammesso un solo identificativo: lettere, cifre, trattino o underscore, mai una cifra iniziale — massimo 50 caratteri';
  }
  if ((prop.required || prop.nonEmpty) && text.trim() === '') {
    return 'Obbligatoria: il salvataggio verrà rifiutato finché è vuota';
  }
  return undefined;
}
