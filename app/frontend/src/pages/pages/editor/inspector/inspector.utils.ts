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
import type {
  BlockEditorPropMeta,
  BlockPropDescriptor,
  PropStateName,
  ResponsiveBreakpointName,
} from '../../../../types/blocks.types';
import type { EditorViewport } from '../../../../hooks/useBlockEditorStore';
import { useThemeColorStore } from '../../../../hooks/useThemeColor';
import type { ThemeColorPickerPreset } from './ThemeColorPicker';

/**
 * `kind` di prop il cui controllo scrive nello store ma che nessun renderer/compilatore stile
 * legge ancora (`generateCanvasCss.ts` li ignora, ADR-82 § "Conseguenze"): nell'inspector
 * vanno resi disabilitati con tooltip "In costruzione" (ADR-94). Rimuovere un `kind` da qui
 * quando il compilatore lo implementa. `background` ne è uscito (ADR-96 § "Decisione" punto 1):
 * `backgroundToDeclarations()` lo implementa ora sia server-side (`to-css.ts`) sia nel mirror
 * `generateCanvasCss.ts`, scope `type: 'none' | 'color' | 'gradient'`. `border`/`shadow`
 * restano qui, invariati.
 */
export const UNIMPLEMENTED_PROP_KINDS: ReadonlySet<string> = new Set(['border', 'shadow']);

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

/**
 * Pattern del `guid` (16 esadecimali) per `kind: 'pageRef'` (ADR-52 § 3), ricalcato da
 * `GUID_PATTERN` di `block-tree-validator.service.ts` (stessa forma di `mediaRef`). Duplicato
 * qui solo per anticipare l'errore a chi scrive: il rifiuto autorevole resta quello del
 * server — nessuna verifica di esistenza/pubblicazione della Pagina lato client (la
 * risoluzione è a valle, nella pipeline SSR di `app/public-site`).
 */
export const PAGE_GUID_PATTERN = /^[0-9a-f]{16}$/;

/**
 * Le 5 voci del tema live (`useThemeColorStore`, ADR-4) usate come preset "Colori del Tema" di
 * `ThemeColorPicker` da ogni chiamante **tranne** `ColorField.tsx` (che usa invece i 4 id di
 * sistema del Global Kit, ADR-77 § 2 — mondo diverso, non fuso qui). Centralizza l'elenco che
 * prima viveva duplicato/hardcoded solo dentro `PropField.tsx` `case 'color'` (`paletteTokens`):
 * stessi 5 valori, stesse etichette, ora riusati anche da `BackgroundField.tsx`/`BorderField.tsx`/
 * `ShadowField.tsx`. Scrive sempre l'hex risolto, mai un riferimento dinamico — stesso motivo
 * già dichiarato nel commento di testa di `PropField.tsx` `case 'color'`: il validator
 * server-side di `kind: 'color'` accetta solo hex.
 */
export function useThemeColorPresets(): ThemeColorPickerPreset[] {
  const themeConfig = useThemeColorStore((state) => state.themeConfig);
  return [
    { id: 'primary', label: 'Primario', hex: themeConfig.colors.primary },
    { id: 'secondary', label: 'Secondario', hex: themeConfig.colors.secondary },
    { id: 'accent', label: 'Accento', hex: themeConfig.colors.accent },
    { id: 'text', label: 'Testo', hex: themeConfig.light.textPrimary },
    { id: 'textSecondary', label: 'Testo secondario', hex: themeConfig.light.textSecondary },
  ];
}

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
 * Le props di direzione/allineamento flex a `kind: 'enum'`/`responsive` che usano un
 * `SegmentedControl` (scelta fra un piccolo insieme chiuso di opzioni mutuamente esclusive)
 * invece del `Select` generico (ADR-39, round originario di `container` v1). Riconosciute
 * per nome, stesso principio di `SPACING_SLIDER_PROPS`.
 *
 * `container` `v: 2` (`ADR-82-container-unificato-grid-flex.md` § "Decisione" punto 1)
 * consolida `display`/`flexDirection`/`justifyContent`/`alignItems`/`wrap`/`gap` in un solo
 * campo composito `layout: layout` (responsive sull'intero oggetto, non i singoli campi):
 * `flexDirection`/`wrap` non sono più dichiarati da **nessun** tipo del registro, quindi
 * questo `Set` non li contiene più — un editor dedicato per `kind: 'layout'` (Grid/Flex) è
 * un task successivo (ADR-82 § "Conseguenze"), fuori scopo di questa migrazione. `section`
 * (v1, deprecato ma non rimosso, `ADR-82` § "Decisione" punto 2) resta l'unico tipo che
 * dichiara ancora `alignItems`/`justifyContent` come prop scalari indipendenti: restano nel
 * `Set` solo per lui.
 */
export const CONTAINER_FLEX_SEGMENTED_PROPS = new Set(['justifyContent', 'alignItems']);

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
export const STYLE_SECTION_ORDER = [
  'Tipografia',
  'Colori',
  'Bordo',
  'Ombra',
  'Spaziatura',
] as const;

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
  if (prop.kind === 'color' || prop.kind === 'colorRef' || prop.kind === 'background') {
    return 'Colori';
  }
  return 'Tipografia';
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
  // Stesso principio esteso ai kind v2 compositi (Sub-Task S2.3): `colorRef` può essere un
  // oggetto `{ ref }`, `typography`/`spacing`/`layout` sono sempre oggetti (interi o annidati
  // stato/breakpoint) — `asString` li stringificherebbe in `[object Object]`, che non è mai
  // un errore significativo. Ogni campo interno resta comunque vincolato dal proprio controllo
  // dedicato (`ColorField`/`TypographyField`/`SpacingField`/`LayoutField`).
  if (
    prop.kind === 'unitValue' ||
    prop.kind === 'border' ||
    prop.kind === 'shadow' ||
    prop.kind === 'colorRef' ||
    prop.kind === 'typography' ||
    prop.kind === 'spacing' ||
    prop.kind === 'layout'
  ) {
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
  if (prop.kind === 'pageRef' && text.trim() !== '' && !PAGE_GUID_PATTERN.test(text)) {
    return 'Ammesso solo un guid di 16 caratteri esadecimali';
  }
  if ((prop.required || prop.nonEmpty) && text.trim() === '') {
    return 'Obbligatoria: il salvataggio verrà rifiutato finché è vuota';
  }
  return undefined;
}

// ─── PropKind v2 (ADR-75/ADR-76, round R2 "parità Elementor Pro") ───────────────────────────
//
// `updateBlockPropsAction` (`useBlockEditorStore.ts`) resta l'unica azione di scrittura: fa un
// merge **per chiave di prop**, non annidato (`{ ...node.props, [propName]: nextValue }`,
// `block-tree.utils.ts` `updateBlockProps`). Per una prop `stateful`/`responsive` v2 questo
// significa che `nextValue` deve già essere l'intero valore della prop con **un solo ramo
// stato→breakpoint sostituito e ogni altro ramo preservato** — esattamente il rischio di
// "perdita silenziosa" già descritto per il v1 da ADR-29 § "Conseguenza" e raddoppiato da
// ADR-75 § "Conseguenze" per la dimensione stato in più. Le due funzioni sotto sono quel
// costruttore di patch, pure e senza stato, coerenti con `responsiveEnvelope`/`breakpointKey`
// sopra (stesso principio, esteso da un solo modificatore a due componibili — ADR-75 §
// "Decisione" punto 1: ordine fisso stato esterno, breakpoint interno).

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Costruisce il valore completo (da passare a `updateBlockPropsAction`) di una prop `kind` v2
 * il cui modificatore `responsive` si applica sull'**intero** valore di stato (ogni `kind` v2
 * tranne `typography`, che opera per campo — vedi {@link buildTypographyFieldPatch}):
 * `colorRef`, `radius`, `gradient`, `position`, `transform`, `filter`, `layout`, `spacing`
 * (mai `stateful`, ADR-75 § "Decisione" punto 6, ma può essere `responsive`).
 *
 * Sostituisce solo la combinazione `(state, breakpoint)` richiesta, preservando ogni altro
 * stato/breakpoint già presente nel valore corrente — mai `{ [state]: { [breakpoint]:
 * nakedValue } }` da solo, che cancellerebbe silenziosamente il resto.
 *
 * @param prop Descrittore della prop (`stateful`/`responsive`, letti dal registro).
 * @param currentValue Valore grezzo attuale della prop così come letto da `node.props`.
 * @param state Stato da scrivere (`'normal'` se `prop.stateful` non è dichiarato).
 * @param breakpoint Breakpoint da scrivere (`'default'` se `prop.responsive` non è dichiarato).
 * @param nakedValue Il "valore nudo" del `kind` per questa combinazione (mai un envelope).
 * @returns Il valore completo da scrivere sulla prop, con ogni altro ramo intatto.
 */
export function buildStatefulResponsivePropPatch(
  prop: BlockPropDescriptor,
  currentValue: unknown,
  state: PropStateName,
  breakpoint: ResponsiveBreakpointName,
  nakedValue: unknown,
): unknown {
  const stateful = Boolean(prop.stateful);
  const responsive = Boolean(prop.responsive);

  if (!stateful && !responsive) {
    // Nessun envelope: il valore nudo è l'intera prop (stesso principio di § 10 punto 1 di
    // SPEC-PROPKIND-V2-DETAILS.md, applicato qui alla scrittura invece che alla lettura).
    return nakedValue;
  }

  if (!stateful) {
    // Solo `responsive`: il valore corrente è già l'envelope breakpoint `{ default, ... }`.
    const envelope = isPlainRecord(currentValue) ? currentValue : {};
    return { ...envelope, [breakpoint]: nakedValue };
  }

  // `stateful` (con o senza `responsive`, ADR-75 § "Decisione" punto 1): stato esterno,
  // breakpoint interno. `normal` è sempre la chiave obbligatoria — preservata se già presente,
  // mai richiesta esplicitamente da questa funzione (un nodo nuovo senza valore ancora scritto
  // parte da un oggetto vuoto, coerente con `responsiveEnvelope` sopra per il v1).
  const stateEnvelope = isPlainRecord(currentValue) ? { ...currentValue } : {};
  if (!responsive) {
    stateEnvelope[state] = nakedValue;
    return stateEnvelope;
  }
  const breakpointEnvelope = isPlainRecord(stateEnvelope[state]) ? stateEnvelope[state] : {};
  stateEnvelope[state] = { ...breakpointEnvelope, [breakpoint]: nakedValue };
  return stateEnvelope;
}

/**
 * Stessa funzione di {@link buildStatefulResponsivePropPatch}, specializzata per `kind:
 * 'typography'` (SPEC-PROPKIND-V2-DETAILS.md § 3 punto 3/punto 4): `stateful` opera
 * sull'intero oggetto (come sopra), ma `responsive` opera **per campo** — il breakpoint si
 * annida dentro il singolo campo del ramo di stato attivo, non sull'intero `TypographyValue`.
 *
 * @param currentValue Valore grezzo attuale della prop `typography`.
 * @param state Stato da scrivere (sempre presente per questo `kind`, ADR-75 § "Decisione" punto 1).
 * @param field Il campo di `TypographyValue` da scrivere (es. `'fontSize'`).
 * @param breakpoint Breakpoint da scrivere per **questo campo**.
 * @param nakedFieldValue Il valore nudo del campo (es. `{ value: 32, unit: 'px' }`).
 * @returns Il valore completo da scrivere sulla prop `typography`, con ogni altro
 *   stato/campo/breakpoint intatto.
 */
export function buildTypographyFieldPatch(
  currentValue: unknown,
  state: PropStateName,
  field: string,
  breakpoint: ResponsiveBreakpointName,
  nakedFieldValue: unknown,
): unknown {
  const stateEnvelope = isPlainRecord(currentValue) ? { ...currentValue } : {};
  const typographyValue = isPlainRecord(stateEnvelope[state]) ? { ...stateEnvelope[state] } : {};
  const fieldEnvelope = isPlainRecord(typographyValue[field]) ? typographyValue[field] : {};
  typographyValue[field] = { ...fieldEnvelope, [breakpoint]: nakedFieldValue };
  stateEnvelope[state] = typographyValue;
  return stateEnvelope;
}

// ─── Lettura a 7 vie per i nuovi controlli dedicati (Sub-Task S2.3) ─────────────────────────
//
// `PropField.tsx` riceve oggi `activeBreakpoint: 'default' | 'tablet' | 'mobile'` (derivato da
// `breakpointKey(activeViewport)`, modello legacy a 3 vie di ADR-29 — usato dai controlli v1
// invariati sopra). I kind v2 `responsive` (`colorRef`/`typography`/`spacing`/`layout`/...)
// usano invece la busta a 7 nomi di ADR-76 (`RESPONSIVE_BREAKPOINTS`): le funzioni sotto
// generalizzano `effectiveScalarForViewport`/`hasExplicitOverrideAtBreakpoint` a quelle 7
// chiavi, lette dal breakpoint REALE dello store (`useActiveBreakpoint()`, 7 vie), mai dal
// prop legacy a 3 vie — scelta di design dichiarata nel resoconto finale del Sub-Task (gap 1).
// Scrivono solo sulla chiave attiva corrente, mai sovrascrivendo l'intero envelope: stesso
// principio "niente perdita silenziosa" di ADR-29 § "Conseguenza", qui in lettura.

/**
 * Ordine di cascata dei 7 breakpoint di ADR-76 (dal più stretto al più largo, `default` come
 * terminale): generalizza a 7 vie la cascata a 3 di `effectiveScalarForViewport` (ADR-29).
 * `widescreen` ne resta fuori (ADR-76 § "Decisione" punto 3, soglia `min-width`, non cascata
 * verso il basso: un valore assente per `widescreen` ricade direttamente su `default`).
 */
export const BREAKPOINT_CASCADE_ORDER: readonly ResponsiveBreakpointName[] = [
  'mobile',
  'mobileExtra',
  'tablet',
  'tabletExtra',
  'laptop',
  'default',
];

/**
 * Valore effettivo di un envelope a 7 vie (ADR-76) per `breakpoint`, seguendo la cascata verso
 * il basso — generalizzazione di `effectiveScalarForViewport` (3 vie, ADR-29) per i kind v2.
 * Solo per la lettura/anteprima in UI, mai per decidere cosa scrivere: la scrittura resta
 * sempre e solo sulla chiave del breakpoint attivo (vedi {@link buildStatefulResponsivePropPatch}).
 */
export function effectiveNakedValueForBreakpoint(
  envelope: Record<string, unknown>,
  breakpoint: ResponsiveBreakpointName,
): unknown {
  if (breakpoint === 'widescreen') {
    return envelope.widescreen !== undefined ? envelope.widescreen : envelope.default;
  }
  const startIndex = BREAKPOINT_CASCADE_ORDER.indexOf(breakpoint);
  const chain = startIndex >= 0 ? BREAKPOINT_CASCADE_ORDER.slice(startIndex) : ['default'];
  for (const name of chain) {
    if (envelope[name] !== undefined) return envelope[name];
  }
  return undefined;
}

/**
 * Vero se l'envelope a 7 vie porta un valore esplicito per `breakpoint` (non ereditato in
 * cascata) — generalizzazione di `hasExplicitOverrideAtBreakpoint` (3 vie, ADR-29) per i kind
 * v2. `default` non è mai un "override" (è la base della cascata), stesso principio della
 * funzione a 3 vie.
 */
export function hasExplicitBreakpointOverride(
  envelope: Record<string, unknown>,
  breakpoint: ResponsiveBreakpointName,
): boolean {
  if (breakpoint === 'default') return false;
  return envelope[breakpoint] !== undefined;
}

/**
 * Mirror in lettura di {@link buildStatefulResponsivePropPatch}: il valore nudo corrente per
 * la combinazione (stato, breakpoint) richiesta, cascando sui breakpoint quando la prop è
 * `responsive` (mai fra stati diversi: uno stato assente è semplicemente "non ancora
 * impostato", ADR-75 non prevede una cascata fra stati).
 */
export function readStatefulResponsiveValue(
  prop: BlockPropDescriptor,
  currentValue: unknown,
  state: PropStateName,
  breakpoint: ResponsiveBreakpointName,
): unknown {
  const stateful = Boolean(prop.stateful);
  const responsive = Boolean(prop.responsive);

  if (!stateful && !responsive) return currentValue;

  if (!stateful) {
    const envelope = isPlainRecord(currentValue) ? currentValue : {};
    return effectiveNakedValueForBreakpoint(envelope, breakpoint);
  }

  const stateEnvelope = isPlainRecord(currentValue) ? currentValue : {};
  const stateValue = stateEnvelope[state];
  if (!responsive) return stateValue;
  const breakpointEnvelope = isPlainRecord(stateValue) ? stateValue : {};
  return effectiveNakedValueForBreakpoint(breakpointEnvelope, breakpoint);
}

/**
 * Vero se la combinazione (stato, breakpoint) richiesta porta un valore esplicito, non
 * ereditato in cascata dal breakpoint `default` — mirror di lettura pensato per il pallino
 * d'override (`BreakpointOverrideDot`, `PropField.tsx`) applicato ai kind v2.
 */
export function hasStatefulResponsiveOverride(
  prop: BlockPropDescriptor,
  currentValue: unknown,
  state: PropStateName,
  breakpoint: ResponsiveBreakpointName,
): boolean {
  if (!prop.responsive || breakpoint === 'default') return false;
  if (!prop.stateful) {
    const envelope = isPlainRecord(currentValue) ? currentValue : {};
    return hasExplicitBreakpointOverride(envelope, breakpoint);
  }
  const stateEnvelope = isPlainRecord(currentValue) ? currentValue : {};
  const breakpointEnvelope = isPlainRecord(stateEnvelope[state])
    ? (stateEnvelope[state] as Record<string, unknown>)
    : {};
  return hasExplicitBreakpointOverride(breakpointEnvelope, breakpoint);
}

/**
 * Mirror in lettura di {@link buildTypographyFieldPatch}: il valore nudo corrente del campo
 * `field` per (stato, breakpoint), sempre trattato come envelope breakpoint per-campo (SPEC-
 * PROPKIND-V2-DETAILS.md § 3 punto 3) — coerente con l'assunzione già fatta in scrittura da
 * `buildTypographyFieldPatch` (ogni prop reale del registro che dichiara `kind: 'typography'`
 * dichiara anche `responsive: true`, § 3 punto 3/4 dello stesso documento).
 */
export function readTypographyFieldValue(
  currentValue: unknown,
  state: PropStateName,
  field: string,
  breakpoint: ResponsiveBreakpointName,
): unknown {
  const stateEnvelope = isPlainRecord(currentValue) ? currentValue : {};
  const typographyValue = isPlainRecord(stateEnvelope[state])
    ? (stateEnvelope[state] as Record<string, unknown>)
    : {};
  const fieldValue = typographyValue[field];
  const fieldEnvelope = isPlainRecord(fieldValue) ? fieldValue : {};
  return effectiveNakedValueForBreakpoint(fieldEnvelope, breakpoint);
}

/**
 * Vero se il campo `field` di `typography` porta un valore esplicito per (stato, breakpoint),
 * non ereditato in cascata — stesso principio di {@link hasStatefulResponsiveOverride}, per
 * campo invece che per l'intera prop.
 */
export function hasTypographyFieldOverride(
  currentValue: unknown,
  state: PropStateName,
  field: string,
  breakpoint: ResponsiveBreakpointName,
): boolean {
  if (breakpoint === 'default') return false;
  const stateEnvelope = isPlainRecord(currentValue) ? currentValue : {};
  const typographyValue = isPlainRecord(stateEnvelope[state])
    ? (stateEnvelope[state] as Record<string, unknown>)
    : {};
  const fieldValue = typographyValue[field];
  const fieldEnvelope = isPlainRecord(fieldValue) ? (fieldValue as Record<string, unknown>) : {};
  return hasExplicitBreakpointOverride(fieldEnvelope, breakpoint);
}
