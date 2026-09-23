/**
 * File generato da 'npm run blocks:types' (blocks:export → blocks:types,
 * PLAN-F02-blocchi.md T6, SPEC-F02-blocchi.md § 5) a partire dal registro
 * dei blocchi del backend (`app/backend/src/blocks/block-registry.ts`).
 *
 * NON MODIFICARE A MANO. Il job CI "blocks-sync" fallisce se questo file è
 * in drift rispetto al registro sorgente.
 *
 * Contratto per la sola UX (SPEC-F02-blocchi.md § 5.3): la validazione
 * autorevole resta il 400 del server. Nessun contratto di rendering incluso
 * qui — punto fermo di ADR-21 § 2, in attesa della decisione sul consumer
 * HTML pubblico (docs/TODO.md 1.9).
 */

/** Un descrittore di prop (SPEC-F02-blocchi.md § 5.1). */
export interface BlockPropDescriptor {
  name: string;
  kind:
    | 'richText'
    | 'plainText'
    | 'number'
    | 'boolean'
    | 'enum'
    | 'url'
    | 'mediaRef'
    | 'pageRef'
    | 'globalSectionRef'
    | 'color'
    | 'unitValue'
    | 'border'
    | 'shadow'
    | 'cssClassName'
    | 'htmlId'
    | 'colorRef'
    | 'fontRef'
    | 'typography'
    | 'spacing'
    | 'radius'
    | 'gradient'
    | 'position'
    | 'transform'
    | 'filter'
    | 'layout'
    | 'background'
    | 'link'
    | 'animation'
    | 'motion'
    | 'attributes'
    | 'css'
    | 'hideOn'
    | 'shapeDivider';
  required: boolean;
  default?: unknown;
  maxLength?: number;
  values?: readonly string[];
  profile?: 'inline' | 'basic';
  nonEmpty?: boolean;
  /** `true` = il valore è `{ default, tablet?, mobile? }`, non uno scalare (ADR-29 § 2/§ 3). */
  responsive?: boolean;
  /** Solo `kind: 'unitValue'` (ADR-38 § 2): elenco chiuso di unità ammesse per questa prop. */
  units?: readonly ('px' | '%' | 'em' | 'rem' | 'vw' | 'vh')[];
  /** Solo `kind: 'unitValue'`/`'spacing'`: intervallo numerico ammesso, dichiarato dalla prop. */
  min?: number;
  max?: number;
  /** Modificatore d'envelope stateful (ADR-75 § "Decisione" punto 1): `{ normal, hover?, focus?, active? }` invece di uno scalare. */
  stateful?: boolean;
  /** Solo `kind: 'colorRef'` (SPEC-PROPKIND-V2-DETAILS.md § 1): ammette `#RRGGBBAA` oltre a `#RGB`/`#RRGGBB`. */
  allowAlpha?: boolean;
  /** Solo `kind: 'colorRef'` (Addendum S1.2, SPEC-PROPKIND-V2-DETAILS.md): proprietà CSS di destinazione, letta da `toCss()`. */
  cssProperty?: 'color' | 'background-color' | 'border-color' | 'outline-color';
  /** Solo `kind: 'spacing'` (SPEC-PROPKIND-V2-DETAILS.md § 4 punto 1): `min` può essere negativo. */
  allowNegative?: boolean;
  /** Solo `kind: 'spacing'` (Addendum S1.2, SPEC-PROPKIND-V2-DETAILS.md): lato CSS di destinazione, letto da `toCss()`. */
  target?: 'padding' | 'margin';
}

/** Nomi di breakpoint ammessi per una prop `responsive` (ADR-76 § "Decisione" punto 1/2), dal più largo al più stretto. */
export const RESPONSIVE_BREAKPOINTS = [
  'default',
  'widescreen',
  'laptop',
  'tabletExtra',
  'tablet',
  'mobileExtra',
  'mobile',
] as const;

/** Uno dei 7 nomi di {@link RESPONSIVE_BREAKPOINTS}. */
export type ResponsiveBreakpointName = (typeof RESPONSIVE_BREAKPOINTS)[number];

/** Elenco chiuso a 4 stati (ADR-75 § "Decisione" punto 3), ordine fisso normal → hover → focus → active. */
export const PROP_STATES = ['normal', 'hover', 'focus', 'active'] as const;

/** Uno dei 4 nomi di {@link PROP_STATES}. */
export type PropStateName = (typeof PROP_STATES)[number];

/** Metadati d'editor di una singola prop (ADR-30 § 1), opachi alla validazione. */
export interface BlockEditorPropMeta {
  label: string;
  tab?: 'content' | 'style' | 'advanced';
  order?: number;
  help?: string;
}

/** Metadati d'editor, opachi alla validazione (consumati solo dalla palette e dall'ispettore di F04). */
export interface BlockEditorMeta {
  label: string;
  icon?: string;
  category?: string;
  /** Metadati per prop, indicizzati per nome (ADR-30 § 1). */
  props?: Record<string, BlockEditorPropMeta>;
}

/** Un tipo di blocco (SPEC-F02-blocchi.md § 5.1). Nessun campo di rendering. */
export interface BlockTypeDescriptor {
  type: string;
  v: number;
  enabled: boolean;
  deprecated?: boolean;
  minRole?: number;
  /** `'*'` = qualunque tipo risolto dal registro, incluso se stesso (ADR-39 § 4). */
  childrenAllow: readonly string[] | '*';
  props: readonly BlockPropDescriptor[];
  meta?: BlockEditorMeta;
}

/** Versione corrente dell'envelope `{ version, blocks }` (ADR-21 § 1). */
export const ENVELOPE_VERSION = 1 as const;

/** Tipi ammessi come nodo di radice dell'albero (ADR-21 § 2). */
export const ROOT_ALLOWED = [
  'section',
  'heading',
  'richText',
  'image',
  'button',
  'container',
  'navMenu',
  'globalRef',
  'accordion',
  'tabs',
  'carousel',
  'modalTrigger',
  'gallery',
] as const;

/** Limiti dell'envelope (SPEC-F02-blocchi.md § 1): per avvisare prima del 400, non per applicarli. */
export const CONTENT_TREE_LIMITS = {
  maxDepth: 8,
  maxNodes: 1500,
  maxPayloadBytes: 524288,
} as const;

/** I tipi di blocco registrati, nell'ordine dichiarato dal backend. */
export const BLOCK_TYPES: readonly BlockTypeDescriptor[] = [
  {
    type: 'section',
    v: 1,
    enabled: false,
    childrenAllow: [
      'heading',
      'richText',
      'image',
      'button',
      'container',
      'form',
      'globalRef',
      'accordion',
      'tabs',
      'carousel',
      'modalTrigger',
      'gallery',
    ],
    props: [
      {
        name: 'styleSpaceBefore',
        kind: 'enum',
        required: false,
        default: {
          default: 'none',
        },
        values: ['none', 'xs', 'sm', 'md', 'lg', 'xl'],
        responsive: true,
      },
      {
        name: 'styleSpaceAfter',
        kind: 'enum',
        required: false,
        default: {
          default: 'none',
        },
        values: ['none', 'xs', 'sm', 'md', 'lg', 'xl'],
        responsive: true,
      },
      {
        name: 'stylePadding',
        kind: 'enum',
        required: false,
        default: {
          default: 'none',
        },
        values: ['none', 'sm', 'md', 'lg'],
        responsive: true,
      },
      {
        name: 'styleBackground',
        kind: 'enum',
        required: false,
        default: {
          default: 'none',
        },
        values: ['none', 'subtle', 'accent', 'inverse'],
        responsive: true,
      },
      {
        name: 'columns',
        kind: 'enum',
        required: false,
        default: {
          default: '1',
        },
        values: ['1', '2', '3', '4'],
        responsive: true,
      },
      {
        name: 'gap',
        kind: 'enum',
        required: false,
        default: {
          default: 'none',
        },
        values: ['none', 'sm', 'md', 'lg'],
        responsive: true,
      },
      {
        name: 'alignItems',
        kind: 'enum',
        required: false,
        default: {
          default: 'stretch',
        },
        values: ['stretch', 'flex-start', 'center', 'flex-end'],
        responsive: true,
      },
      {
        name: 'justifyContent',
        kind: 'enum',
        required: false,
        default: {
          default: 'flex-start',
        },
        values: [
          'flex-start',
          'flex-end',
          'center',
          'space-between',
          'space-around',
          'space-evenly',
        ],
        responsive: true,
      },
      {
        name: 'contentWidth',
        kind: 'enum',
        required: false,
        default: 'boxed',
        values: ['boxed', 'full-width'],
      },
      {
        name: 'maxWidth',
        kind: 'enum',
        required: false,
        default: 'md',
        values: ['sm', 'md', 'lg', 'xl'],
      },
      {
        name: 'columnRatio',
        kind: 'enum',
        required: false,
        default: 'equal',
        values: ['equal', '33-66', '66-33', '30-70', '70-30'],
      },
      {
        name: 'styleBackgroundColor',
        kind: 'color',
        required: false,
      },
      {
        name: 'styleColor',
        kind: 'color',
        required: false,
      },
      {
        name: 'backgroundColor',
        kind: 'color',
        required: false,
      },
      {
        name: 'color',
        kind: 'color',
        required: false,
      },
      {
        name: 'stylePaddingTop',
        kind: 'enum',
        required: false,
        default: {
          default: '0',
        },
        values: ['0', '4', '8', '12', '16', '24', '32', '48', '64', '96'],
        responsive: true,
      },
      {
        name: 'stylePaddingRight',
        kind: 'enum',
        required: false,
        default: {
          default: '0',
        },
        values: ['0', '4', '8', '12', '16', '24', '32', '48', '64', '96'],
        responsive: true,
      },
      {
        name: 'stylePaddingBottom',
        kind: 'enum',
        required: false,
        default: {
          default: '0',
        },
        values: ['0', '4', '8', '12', '16', '24', '32', '48', '64', '96'],
        responsive: true,
      },
      {
        name: 'stylePaddingLeft',
        kind: 'enum',
        required: false,
        default: {
          default: '0',
        },
        values: ['0', '4', '8', '12', '16', '24', '32', '48', '64', '96'],
        responsive: true,
      },
      {
        name: 'styleMarginTop',
        kind: 'enum',
        required: false,
        default: {
          default: '0',
        },
        values: ['0', '4', '8', '12', '16', '24', '32', '48', '64', '96'],
        responsive: true,
      },
      {
        name: 'styleMarginRight',
        kind: 'enum',
        required: false,
        default: {
          default: '0',
        },
        values: ['0', '4', '8', '12', '16', '24', '32', '48', '64', '96'],
        responsive: true,
      },
      {
        name: 'styleMarginBottom',
        kind: 'enum',
        required: false,
        default: {
          default: '0',
        },
        values: ['0', '4', '8', '12', '16', '24', '32', '48', '64', '96'],
        responsive: true,
      },
      {
        name: 'styleMarginLeft',
        kind: 'enum',
        required: false,
        default: {
          default: '0',
        },
        values: ['0', '4', '8', '12', '16', '24', '32', '48', '64', '96'],
        responsive: true,
      },
      {
        name: 'styleLayer',
        kind: 'enum',
        required: false,
        default: 'base',
        values: ['base', 'raised', 'overlay', 'top'],
      },
      {
        name: 'styleHideDesktop',
        kind: 'boolean',
        required: false,
        default: false,
      },
      {
        name: 'styleHideTablet',
        kind: 'boolean',
        required: false,
        default: false,
      },
      {
        name: 'styleHideMobile',
        kind: 'boolean',
        required: false,
        default: false,
      },
      {
        name: 'styleBorder',
        kind: 'border',
        required: false,
      },
      {
        name: 'styleShadow',
        kind: 'shadow',
        required: false,
      },
      {
        name: 'customCssClass',
        kind: 'cssClassName',
        required: false,
      },
      {
        name: 'customElementId',
        kind: 'htmlId',
        required: false,
      },
      {
        name: 'styleBackgroundImageRef',
        kind: 'mediaRef',
        required: false,
      },
      {
        name: 'styleOverlayColor',
        kind: 'color',
        required: false,
      },
      {
        name: 'styleOverlayOpacity',
        kind: 'number',
        required: false,
        min: 0,
        max: 1,
      },
      {
        name: 'styleBackgroundType',
        kind: 'enum',
        required: false,
        default: 'color',
        values: ['color', 'image', 'gradient'],
      },
      {
        name: 'styleBackgroundPosition',
        kind: 'enum',
        required: false,
        default: 'center center',
        values: [
          'top left',
          'top center',
          'top right',
          'center left',
          'center center',
          'center right',
          'bottom left',
          'bottom center',
          'bottom right',
        ],
      },
      {
        name: 'styleBackgroundSize',
        kind: 'enum',
        required: false,
        default: 'cover',
        values: ['cover', 'contain', 'auto'],
      },
      {
        name: 'styleGradientStart',
        kind: 'color',
        required: false,
      },
      {
        name: 'styleGradientEnd',
        kind: 'color',
        required: false,
      },
    ],
    meta: {
      label: 'Sezione',
      category: 'layout',
      icon: 'layout-board',
      props: {
        styleSpaceBefore: {
          label: 'Spazio prima',
          tab: 'style',
          order: 1,
        },
        styleSpaceAfter: {
          label: 'Spazio dopo',
          tab: 'style',
          order: 2,
        },
        stylePadding: {
          label: 'Spaziatura interna',
          tab: 'style',
          order: 3,
        },
        styleBackground: {
          label: 'Sfondo',
          tab: 'style',
          order: 4,
        },
        columns: {
          label: 'Colonne',
          tab: 'style',
          order: 5,
          help: 'Numero di colonne del contenitore',
        },
        gap: {
          label: 'Spaziatura tra colonne',
          tab: 'style',
          order: 6,
        },
        alignItems: {
          label: 'Allineamento verticale',
          tab: 'style',
          order: 7,
        },
        justifyContent: {
          label: 'Allineamento orizzontale',
          tab: 'style',
          order: 8,
        },
        contentWidth: {
          label: 'Larghezza contenuto',
          tab: 'style',
          order: 9,
        },
        maxWidth: {
          label: 'Larghezza massima',
          tab: 'style',
          order: 10,
        },
        columnRatio: {
          label: 'Proporzione colonne',
          tab: 'style',
          order: 11,
          help: 'Significativa solo con 2 colonne',
        },
        styleBackgroundColor: {
          label: 'Colore di sfondo',
          tab: 'style',
          order: 12,
        },
        styleColor: {
          label: 'Colore testo',
          tab: 'style',
          order: 13,
        },
        backgroundColor: {
          label: 'Colore di sfondo (fallback)',
          tab: 'style',
          order: 14,
        },
        color: {
          label: 'Colore testo (fallback)',
          tab: 'style',
          order: 15,
        },
        stylePaddingTop: {
          label: 'Padding superiore',
          tab: 'style',
          order: 16,
        },
        stylePaddingRight: {
          label: 'Padding destro',
          tab: 'style',
          order: 17,
        },
        stylePaddingBottom: {
          label: 'Padding inferiore',
          tab: 'style',
          order: 18,
        },
        stylePaddingLeft: {
          label: 'Padding sinistro',
          tab: 'style',
          order: 19,
        },
        styleMarginTop: {
          label: 'Margine superiore',
          tab: 'style',
          order: 20,
        },
        styleMarginRight: {
          label: 'Margine destro',
          tab: 'style',
          order: 21,
        },
        styleMarginBottom: {
          label: 'Margine inferiore',
          tab: 'style',
          order: 22,
        },
        styleMarginLeft: {
          label: 'Margine sinistro',
          tab: 'style',
          order: 23,
        },
        styleLayer: {
          label: 'Livello di sovrapposizione',
          tab: 'advanced',
          order: 24,
        },
        styleHideDesktop: {
          label: 'Nascondi su Desktop',
          tab: 'advanced',
          order: 25,
        },
        styleHideTablet: {
          label: 'Nascondi su Tablet',
          tab: 'advanced',
          order: 26,
        },
        styleHideMobile: {
          label: 'Nascondi su Mobile',
          tab: 'advanced',
          order: 27,
        },
        styleBorder: {
          label: 'Bordo',
          tab: 'style',
          order: 28,
        },
        styleShadow: {
          label: 'Ombra',
          tab: 'style',
          order: 29,
        },
        customCssClass: {
          label: 'Classe CSS personalizzata',
          tab: 'advanced',
          order: 30,
          help: 'Una o più classi separate da spazio: solo lettere, numeri, trattino, underscore.',
        },
        customElementId: {
          label: 'ID elemento personalizzato',
          tab: 'advanced',
          order: 31,
          help: 'Solo lettere, numeri, trattino, underscore — nessuno spazio.',
        },
        styleBackgroundImageRef: {
          label: 'Immagine di sfondo',
          tab: 'style',
          order: 32,
          help: 'Riferimento a un file della media library.',
        },
        styleOverlayColor: {
          label: 'Colore overlay',
          tab: 'style',
          order: 33,
          help: "Colore esadecimale sovrapposto all'immagine di sfondo.",
        },
        styleOverlayOpacity: {
          label: 'Opacità overlay',
          tab: 'style',
          order: 34,
          help: 'Valore da 0 (trasparente) a 1 (opaco).',
        },
        styleBackgroundType: {
          label: 'Tipo sfondo',
          tab: 'style',
          order: 35,
          help: 'Colore, immagine o gradiente.',
        },
        styleBackgroundPosition: {
          label: 'Posizione sfondo',
          tab: 'style',
          order: 36,
          help: 'Applicata solo quando il tipo sfondo è Immagine.',
        },
        styleBackgroundSize: {
          label: 'Dimensione sfondo',
          tab: 'style',
          order: 37,
          help: 'Applicata solo quando il tipo sfondo è Immagine.',
        },
        styleGradientStart: {
          label: 'Colore iniziale gradiente',
          tab: 'style',
          order: 38,
          help: 'Applicato solo quando il tipo sfondo è Gradiente.',
        },
        styleGradientEnd: {
          label: 'Colore finale gradiente',
          tab: 'style',
          order: 39,
          help: 'Applicato solo quando il tipo sfondo è Gradiente.',
        },
      },
    },
  },
  {
    type: 'heading',
    v: 2,
    enabled: true,
    childrenAllow: [],
    props: [
      {
        name: 'level',
        kind: 'enum',
        required: true,
        values: ['h2', 'h3', 'h4', 'h5', 'h6'],
      },
      {
        name: 'text',
        kind: 'plainText',
        required: true,
        maxLength: 200,
      },
      {
        name: 'styleSpaceBefore',
        kind: 'enum',
        required: false,
        default: {
          default: 'none',
        },
        values: ['none', 'xs', 'sm', 'md', 'lg', 'xl'],
        responsive: true,
      },
      {
        name: 'styleSpaceAfter',
        kind: 'enum',
        required: false,
        default: {
          default: 'none',
        },
        values: ['none', 'xs', 'sm', 'md', 'lg', 'xl'],
        responsive: true,
      },
      {
        name: 'color',
        kind: 'colorRef',
        required: false,
        responsive: true,
        stateful: true,
        cssProperty: 'color',
      },
      {
        name: 'typography',
        kind: 'typography',
        required: false,
        responsive: true,
        stateful: true,
      },
      {
        name: 'styleLayer',
        kind: 'enum',
        required: false,
        default: 'base',
        values: ['base', 'raised', 'overlay', 'top'],
      },
      {
        name: 'hideOn',
        kind: 'hideOn',
        required: false,
      },
      {
        name: 'styleBorder',
        kind: 'border',
        required: false,
      },
      {
        name: 'styleShadow',
        kind: 'shadow',
        required: false,
      },
      {
        name: 'customCssClass',
        kind: 'cssClassName',
        required: false,
      },
      {
        name: 'customElementId',
        kind: 'htmlId',
        required: false,
      },
      {
        name: 'styleTextAlign',
        kind: 'enum',
        required: false,
        values: ['left', 'center', 'right', 'justify'],
      },
      {
        name: 'margin',
        kind: 'spacing',
        required: false,
        responsive: true,
        units: ['px', '%', 'em', 'rem'],
        min: 0,
        max: 500,
        target: 'margin',
      },
    ],
    meta: {
      label: 'Titolo',
      category: 'testo',
      icon: 'heading',
      props: {
        level: {
          label: 'Livello',
          order: 1,
        },
        text: {
          label: 'Testo',
          order: 2,
        },
        styleSpaceBefore: {
          label: 'Spazio prima',
          tab: 'style',
          order: 3,
        },
        styleSpaceAfter: {
          label: 'Spazio dopo',
          tab: 'style',
          order: 4,
        },
        color: {
          label: 'Colore testo',
          tab: 'style',
          order: 5,
        },
        typography: {
          label: 'Tipografia',
          tab: 'style',
          order: 6,
        },
        styleLayer: {
          label: 'Livello di sovrapposizione',
          tab: 'advanced',
          order: 9,
        },
        hideOn: {
          label: 'Nascondi su breakpoint',
          tab: 'advanced',
          order: 10,
        },
        styleBorder: {
          label: 'Bordo',
          tab: 'style',
          order: 15,
        },
        styleShadow: {
          label: 'Ombra',
          tab: 'style',
          order: 16,
        },
        customCssClass: {
          label: 'Classe CSS personalizzata',
          tab: 'advanced',
          order: 17,
          help: 'Una o più classi separate da spazio: solo lettere, numeri, trattino, underscore.',
        },
        customElementId: {
          label: 'ID elemento personalizzato',
          tab: 'advanced',
          order: 18,
          help: 'Solo lettere, numeri, trattino, underscore — nessuno spazio.',
        },
        styleTextAlign: {
          label: 'Allineamento testo',
          tab: 'style',
          order: 19,
        },
        margin: {
          label: 'Margine',
          tab: 'style',
          order: 20,
        },
      },
    },
  },
  {
    type: 'richText',
    v: 2,
    enabled: true,
    childrenAllow: [],
    props: [
      {
        name: 'html',
        kind: 'richText',
        required: true,
        maxLength: 20000,
        profile: 'basic',
      },
      {
        name: 'styleSpaceBefore',
        kind: 'enum',
        required: false,
        default: {
          default: 'none',
        },
        values: ['none', 'xs', 'sm', 'md', 'lg', 'xl'],
        responsive: true,
      },
      {
        name: 'styleSpaceAfter',
        kind: 'enum',
        required: false,
        default: {
          default: 'none',
        },
        values: ['none', 'xs', 'sm', 'md', 'lg', 'xl'],
        responsive: true,
      },
      {
        name: 'color',
        kind: 'colorRef',
        required: false,
        responsive: true,
        stateful: true,
        cssProperty: 'color',
      },
      {
        name: 'typography',
        kind: 'typography',
        required: false,
        responsive: true,
        stateful: true,
      },
      {
        name: 'styleLayer',
        kind: 'enum',
        required: false,
        default: 'base',
        values: ['base', 'raised', 'overlay', 'top'],
      },
      {
        name: 'hideOn',
        kind: 'hideOn',
        required: false,
      },
      {
        name: 'styleBorder',
        kind: 'border',
        required: false,
      },
      {
        name: 'styleShadow',
        kind: 'shadow',
        required: false,
      },
      {
        name: 'customCssClass',
        kind: 'cssClassName',
        required: false,
      },
      {
        name: 'customElementId',
        kind: 'htmlId',
        required: false,
      },
      {
        name: 'margin',
        kind: 'spacing',
        required: false,
        responsive: true,
        units: ['px', '%', 'em', 'rem'],
        min: 0,
        max: 500,
        target: 'margin',
      },
    ],
    meta: {
      label: 'Testo',
      category: 'testo',
      icon: 'align-left',
      props: {
        html: {
          label: 'Contenuto',
          order: 1,
        },
        styleSpaceBefore: {
          label: 'Spazio prima',
          tab: 'style',
          order: 2,
        },
        styleSpaceAfter: {
          label: 'Spazio dopo',
          tab: 'style',
          order: 3,
        },
        color: {
          label: 'Colore testo',
          tab: 'style',
          order: 4,
        },
        typography: {
          label: 'Tipografia',
          tab: 'style',
          order: 5,
        },
        styleLayer: {
          label: 'Livello di sovrapposizione',
          tab: 'advanced',
          order: 9,
        },
        hideOn: {
          label: 'Nascondi su breakpoint',
          tab: 'advanced',
          order: 10,
        },
        styleBorder: {
          label: 'Bordo',
          tab: 'style',
          order: 15,
        },
        styleShadow: {
          label: 'Ombra',
          tab: 'style',
          order: 16,
        },
        customCssClass: {
          label: 'Classe CSS personalizzata',
          tab: 'advanced',
          order: 17,
          help: 'Una o più classi separate da spazio: solo lettere, numeri, trattino, underscore.',
        },
        customElementId: {
          label: 'ID elemento personalizzato',
          tab: 'advanced',
          order: 18,
          help: 'Solo lettere, numeri, trattino, underscore — nessuno spazio.',
        },
        margin: {
          label: 'Margine',
          tab: 'style',
          order: 19,
        },
      },
    },
  },
  {
    type: 'image',
    v: 2,
    enabled: true,
    childrenAllow: [],
    props: [
      {
        name: 'mediaRef',
        kind: 'mediaRef',
        required: true,
      },
      {
        name: 'alt',
        kind: 'plainText',
        required: true,
        maxLength: 300,
        nonEmpty: true,
      },
      {
        name: 'styleSpaceBefore',
        kind: 'enum',
        required: false,
        default: {
          default: 'none',
        },
        values: ['none', 'xs', 'sm', 'md', 'lg', 'xl'],
        responsive: true,
      },
      {
        name: 'styleSpaceAfter',
        kind: 'enum',
        required: false,
        default: {
          default: 'none',
        },
        values: ['none', 'xs', 'sm', 'md', 'lg', 'xl'],
        responsive: true,
      },
      {
        name: 'styleLayer',
        kind: 'enum',
        required: false,
        default: 'base',
        values: ['base', 'raised', 'overlay', 'top'],
      },
      {
        name: 'hideOn',
        kind: 'hideOn',
        required: false,
      },
      {
        name: 'styleBorder',
        kind: 'border',
        required: false,
      },
      {
        name: 'styleShadow',
        kind: 'shadow',
        required: false,
      },
      {
        name: 'styleSizePreset',
        kind: 'enum',
        required: false,
        default: 'full',
        values: ['thumbnail', 'card', 'hero', 'og', 'full', 'custom'],
      },
      {
        name: 'styleWidth',
        kind: 'unitValue',
        required: false,
        units: ['px', '%', 'vw'],
        min: 0,
        max: 3840,
      },
      {
        name: 'styleHeight',
        kind: 'unitValue',
        required: false,
        units: ['px', '%', 'vh'],
        min: 0,
        max: 2160,
      },
      {
        name: 'styleObjectFit',
        kind: 'enum',
        required: false,
        default: 'cover',
        values: ['cover', 'contain', 'fill', 'none'],
      },
      {
        name: 'styleAlign',
        kind: 'enum',
        required: false,
        default: 'left',
        values: ['left', 'center', 'right'],
      },
      {
        name: 'customCssClass',
        kind: 'cssClassName',
        required: false,
      },
      {
        name: 'customElementId',
        kind: 'htmlId',
        required: false,
      },
      {
        name: 'margin',
        kind: 'spacing',
        required: false,
        responsive: true,
        units: ['px', '%', 'em', 'rem'],
        min: 0,
        max: 500,
        target: 'margin',
      },
    ],
    meta: {
      label: 'Immagine',
      category: 'media',
      icon: 'photo',
      props: {
        mediaRef: {
          label: 'File',
          order: 1,
        },
        alt: {
          label: 'Testo alternativo',
          order: 2,
        },
        styleSpaceBefore: {
          label: 'Spazio prima',
          tab: 'style',
          order: 3,
        },
        styleSpaceAfter: {
          label: 'Spazio dopo',
          tab: 'style',
          order: 4,
        },
        styleLayer: {
          label: 'Livello di sovrapposizione',
          tab: 'advanced',
          order: 5,
        },
        hideOn: {
          label: 'Nascondi su breakpoint',
          tab: 'advanced',
          order: 6,
        },
        styleBorder: {
          label: 'Bordo',
          tab: 'style',
          order: 9,
        },
        styleShadow: {
          label: 'Ombra',
          tab: 'style',
          order: 10,
        },
        styleSizePreset: {
          label: 'Formato predefinito',
          tab: 'style',
          order: 11,
        },
        styleWidth: {
          label: 'Larghezza personalizzata',
          tab: 'style',
          order: 12,
        },
        styleHeight: {
          label: 'Altezza personalizzata',
          tab: 'style',
          order: 13,
        },
        styleObjectFit: {
          label: 'Adattamento immagine',
          tab: 'style',
          order: 14,
        },
        styleAlign: {
          label: 'Allineamento',
          tab: 'style',
          order: 15,
        },
        customCssClass: {
          label: 'Classe CSS personalizzata',
          tab: 'advanced',
          order: 16,
          help: 'Una o più classi separate da spazio: solo lettere, numeri, trattino, underscore.',
        },
        customElementId: {
          label: 'ID elemento personalizzato',
          tab: 'advanced',
          order: 17,
          help: 'Solo lettere, numeri, trattino, underscore — nessuno spazio.',
        },
        margin: {
          label: 'Margine',
          tab: 'style',
          order: 18,
        },
      },
    },
  },
  {
    type: 'button',
    v: 2,
    enabled: true,
    childrenAllow: [],
    props: [
      {
        name: 'label',
        kind: 'plainText',
        required: true,
        maxLength: 80,
      },
      {
        name: 'link',
        kind: 'link',
        required: true,
      },
      {
        name: 'styleSpaceBefore',
        kind: 'enum',
        required: false,
        default: {
          default: 'none',
        },
        values: ['none', 'xs', 'sm', 'md', 'lg', 'xl'],
        responsive: true,
      },
      {
        name: 'styleSpaceAfter',
        kind: 'enum',
        required: false,
        default: {
          default: 'none',
        },
        values: ['none', 'xs', 'sm', 'md', 'lg', 'xl'],
        responsive: true,
      },
      {
        name: 'color',
        kind: 'colorRef',
        required: false,
        responsive: true,
        stateful: true,
        cssProperty: 'color',
      },
      {
        name: 'typography',
        kind: 'typography',
        required: false,
        responsive: true,
        stateful: true,
      },
      {
        name: 'styleLayer',
        kind: 'enum',
        required: false,
        default: 'base',
        values: ['base', 'raised', 'overlay', 'top'],
      },
      {
        name: 'hideOn',
        kind: 'hideOn',
        required: false,
      },
      {
        name: 'margin',
        kind: 'spacing',
        required: false,
        responsive: true,
        units: ['px', '%', 'em', 'rem'],
        min: 0,
        max: 500,
        target: 'margin',
      },
      {
        name: 'customCssClass',
        kind: 'cssClassName',
        required: false,
      },
      {
        name: 'customElementId',
        kind: 'htmlId',
        required: false,
      },
    ],
    meta: {
      label: 'Pulsante',
      category: 'azione',
      icon: 'hand-click',
      props: {
        label: {
          label: 'Etichetta',
          order: 1,
        },
        link: {
          label: 'Link',
          order: 2,
        },
        styleSpaceBefore: {
          label: 'Spazio prima',
          tab: 'style',
          order: 3,
        },
        styleSpaceAfter: {
          label: 'Spazio dopo',
          tab: 'style',
          order: 4,
        },
        color: {
          label: 'Colore testo',
          tab: 'style',
          order: 5,
        },
        typography: {
          label: 'Tipografia',
          tab: 'style',
          order: 6,
        },
        styleLayer: {
          label: 'Livello di sovrapposizione',
          tab: 'advanced',
          order: 9,
        },
        hideOn: {
          label: 'Nascondi su breakpoint',
          tab: 'advanced',
          order: 10,
        },
        margin: {
          label: 'Margine',
          tab: 'style',
          order: 15,
        },
        customCssClass: {
          label: 'Classe CSS personalizzata',
          tab: 'advanced',
          order: 13,
          help: 'Una o più classi separate da spazio: solo lettere, numeri, trattino, underscore.',
        },
        customElementId: {
          label: 'ID elemento personalizzato',
          tab: 'advanced',
          order: 14,
          help: 'Solo lettere, numeri, trattino, underscore — nessuno spazio.',
        },
      },
    },
  },
  {
    type: 'container',
    v: 2,
    enabled: true,
    childrenAllow: '*',
    props: [
      {
        name: 'tag',
        kind: 'enum',
        required: false,
        default: 'div',
        values: ['div', 'section', 'header', 'footer', 'article', 'aside', 'nav', 'main'],
      },
      {
        name: 'layout',
        kind: 'layout',
        required: false,
        responsive: true,
      },
      {
        name: 'contentWidth',
        kind: 'enum',
        required: false,
        default: 'boxed',
        values: ['boxed', 'full'],
      },
      {
        name: 'boxedWidth',
        kind: 'unitValue',
        required: false,
        units: ['px', '%', 'em', 'rem', 'vw'],
        min: 0,
        max: 4000,
      },
      {
        name: 'minHeight',
        kind: 'unitValue',
        required: false,
        units: ['px', '%', 'em', 'rem', 'vh'],
        min: 0,
        max: 2000,
      },
      {
        name: 'overflow',
        kind: 'enum',
        required: false,
        default: 'visible',
        values: ['visible', 'hidden', 'auto'],
      },
      {
        name: 'background',
        kind: 'background',
        required: false,
        stateful: true,
      },
      {
        name: 'border',
        kind: 'border',
        required: false,
        stateful: true,
      },
      {
        name: 'radius',
        kind: 'radius',
        required: false,
      },
      {
        name: 'shadow',
        kind: 'shadow',
        required: false,
        stateful: true,
      },
      {
        name: 'padding',
        kind: 'spacing',
        required: false,
        responsive: true,
        units: ['px', '%', 'em', 'rem'],
        min: 0,
        max: 500,
        target: 'padding',
      },
      {
        name: 'margin',
        kind: 'spacing',
        required: false,
        responsive: true,
        units: ['px', '%', 'em', 'rem'],
        min: 0,
        max: 500,
        target: 'margin',
      },
      {
        name: 'position',
        kind: 'position',
        required: false,
        responsive: true,
      },
      {
        name: 'transform',
        kind: 'transform',
        required: false,
        responsive: true,
        stateful: true,
      },
      {
        name: 'opacity',
        kind: 'number',
        required: false,
        min: 0,
        max: 1,
      },
      {
        name: 'filter',
        kind: 'filter',
        required: false,
        responsive: true,
        stateful: true,
      },
      {
        name: 'link',
        kind: 'link',
        required: false,
      },
      {
        name: 'animation',
        kind: 'animation',
        required: false,
      },
      {
        name: 'motion',
        kind: 'motion',
        required: false,
      },
      {
        name: 'shapeDividerTop',
        kind: 'shapeDivider',
        required: false,
      },
      {
        name: 'shapeDividerBottom',
        kind: 'shapeDivider',
        required: false,
      },
      {
        name: 'htmlId',
        kind: 'htmlId',
        required: false,
      },
      {
        name: 'cssClass',
        kind: 'cssClassName',
        required: false,
      },
      {
        name: 'attributes',
        kind: 'attributes',
        required: false,
      },
      {
        name: 'css',
        kind: 'css',
        required: false,
        maxLength: 5000,
      },
      {
        name: 'hideOn',
        kind: 'hideOn',
        required: false,
      },
    ],
    meta: {
      label: 'Contenitore',
      category: 'layout',
      icon: 'box-align-top',
      props: {
        tag: {
          label: 'Tag HTML',
          tab: 'advanced',
          order: 1,
        },
        layout: {
          label: 'Layout (Flex/Grid)',
          tab: 'style',
          order: 2,
        },
        contentWidth: {
          label: 'Larghezza contenuto',
          tab: 'style',
          order: 3,
        },
        boxedWidth: {
          label: 'Larghezza massima',
          tab: 'style',
          order: 4,
        },
        minHeight: {
          label: 'Altezza minima',
          tab: 'style',
          order: 5,
        },
        overflow: {
          label: 'Overflow',
          tab: 'style',
          order: 6,
        },
        background: {
          label: 'Sfondo',
          tab: 'style',
          order: 7,
        },
        border: {
          label: 'Bordo',
          tab: 'style',
          order: 8,
        },
        radius: {
          label: 'Raggio angoli',
          tab: 'style',
          order: 9,
        },
        shadow: {
          label: 'Ombra',
          tab: 'style',
          order: 10,
        },
        padding: {
          label: 'Padding',
          tab: 'style',
          order: 11,
        },
        margin: {
          label: 'Margine',
          tab: 'style',
          order: 12,
        },
        position: {
          label: 'Posizionamento',
          tab: 'advanced',
          order: 13,
        },
        transform: {
          label: 'Trasformazione',
          tab: 'advanced',
          order: 14,
        },
        opacity: {
          label: 'Opacità',
          tab: 'style',
          order: 15,
        },
        filter: {
          label: 'Filtro',
          tab: 'style',
          order: 16,
        },
        link: {
          label: 'Link',
          tab: 'content',
          order: 17,
        },
        animation: {
          label: 'Animazione',
          tab: 'advanced',
          order: 18,
        },
        motion: {
          label: 'Effetti di scorrimento',
          tab: 'advanced',
          order: 19,
        },
        shapeDividerTop: {
          label: 'Divisore forma (superiore)',
          tab: 'style',
          order: 20,
        },
        shapeDividerBottom: {
          label: 'Divisore forma (inferiore)',
          tab: 'style',
          order: 21,
        },
        htmlId: {
          label: 'ID elemento personalizzato',
          tab: 'advanced',
          order: 22,
          help: 'Solo lettere, numeri, trattino, underscore — nessuno spazio.',
        },
        cssClass: {
          label: 'Classe CSS personalizzata',
          tab: 'advanced',
          order: 23,
          help: 'Una o più classi separate da spazio: solo lettere, numeri, trattino, underscore.',
        },
        attributes: {
          label: 'Attributi HTML personalizzati',
          tab: 'advanced',
          order: 24,
        },
        css: {
          label: 'CSS personalizzato',
          tab: 'advanced',
          order: 25,
          help: 'Sanitizzazione avanzata rimandata ad ADR-78 (non ancora firmata).',
        },
        hideOn: {
          label: 'Nascondi su breakpoint',
          tab: 'advanced',
          order: 26,
        },
      },
    },
  },
  {
    type: 'form',
    v: 1,
    enabled: true,
    childrenAllow: ['form-field', 'form-submit'],
    props: [
      {
        name: 'formKey',
        kind: 'plainText',
        required: true,
        maxLength: 100,
        nonEmpty: true,
      },
      {
        name: 'successMessage',
        kind: 'plainText',
        required: false,
        default: 'Grazie, il messaggio è stato inviato con successo.',
        maxLength: 300,
      },
      {
        name: 'errorMessage',
        kind: 'plainText',
        required: false,
        default: 'Non è stato possibile inviare il modulo. Controlla i campi compilati e riprova.',
        maxLength: 300,
      },
    ],
    meta: {
      label: 'Modulo di contatto',
      category: 'form',
      icon: 'forms',
      props: {
        formKey: {
          label: 'Chiave del modulo',
          order: 1,
          help: 'Identificatore stabile del modulo: collega questo blocco alla configurazione dei destinatari (app_settings) e agli Invii storici. Non cambia duplicando il blocco.',
        },
        successMessage: {
          label: 'Messaggio di successo',
          order: 2,
          help: "Mostrato dopo l'invio riuscito del modulo.",
        },
        errorMessage: {
          label: 'Messaggio di errore',
          order: 3,
          help: "Mostrato se l'invio del modulo fallisce (errore del server o di rete).",
        },
      },
    },
  },
  {
    type: 'form-field',
    v: 1,
    enabled: true,
    childrenAllow: [],
    props: [
      {
        name: 'fieldType',
        kind: 'enum',
        required: true,
        values: ['text', 'email', 'textarea', 'select', 'checkbox'],
      },
      {
        name: 'name',
        kind: 'plainText',
        required: true,
        maxLength: 100,
        nonEmpty: true,
      },
      {
        name: 'label',
        kind: 'plainText',
        required: true,
        maxLength: 200,
      },
      {
        name: 'required',
        kind: 'boolean',
        required: false,
        default: false,
      },
      {
        name: 'placeholder',
        kind: 'plainText',
        required: false,
        maxLength: 200,
      },
      {
        name: 'options',
        kind: 'plainText',
        required: false,
        maxLength: 1000,
      },
      {
        name: 'colSpan',
        kind: 'enum',
        required: false,
        default: {
          default: '12',
        },
        values: ['6', '12'],
        responsive: true,
      },
      {
        name: 'defaultValue',
        kind: 'plainText',
        required: false,
        maxLength: 500,
      },
      {
        name: 'defaultChecked',
        kind: 'boolean',
        required: false,
        default: false,
      },
      {
        name: 'validationMessage',
        kind: 'plainText',
        required: false,
        maxLength: 200,
      },
    ],
    meta: {
      label: 'Campo modulo',
      category: 'form',
      icon: 'input-search',
      props: {
        fieldType: {
          label: 'Tipo campo',
          order: 1,
        },
        name: {
          label: 'Nome campo',
          order: 2,
          help: 'Identificatore stabile nel payload di sottomissione: non cambia duplicando il blocco.',
        },
        label: {
          label: 'Etichetta',
          order: 3,
        },
        required: {
          label: 'Obbligatorio',
          order: 4,
        },
        placeholder: {
          label: 'Placeholder',
          order: 5,
        },
        options: {
          label: 'Opzioni (solo per "Select")',
          order: 6,
          help: 'Elenco separato da virgola, es. "Nord,Centro,Sud".',
        },
        colSpan: {
          label: 'Larghezza campo',
          order: 7,
          help: "50% per affiancare due campi sulla stessa riga, 100% per occupare l'intera larghezza.",
        },
        defaultValue: {
          label: 'Valore predefinito',
          order: 8,
          help: 'Valore iniziale del campo. Ignorato per "Checkbox" (vedi "Selezionato di default").',
        },
        defaultChecked: {
          label: 'Selezionato di default',
          order: 9,
          help: 'Solo per "Checkbox": se attivo, il campo parte selezionato.',
        },
        validationMessage: {
          label: 'Messaggio di validazione',
          order: 10,
          help: 'Messaggio mostrato quando il campo obbligatorio non viene compilato correttamente.',
        },
      },
    },
  },
  {
    type: 'form-submit',
    v: 1,
    enabled: true,
    childrenAllow: [],
    props: [
      {
        name: 'label',
        kind: 'plainText',
        required: false,
        default: 'Invia',
        maxLength: 80,
      },
      {
        name: 'styleBackgroundColor',
        kind: 'color',
        required: false,
      },
      {
        name: 'styleTextColor',
        kind: 'color',
        required: false,
      },
    ],
    meta: {
      label: 'Pulsante invio modulo',
      category: 'form',
      icon: 'send',
      props: {
        label: {
          label: 'Etichetta',
          order: 1,
        },
        styleBackgroundColor: {
          label: 'Colore di sfondo',
          tab: 'style',
          order: 2,
        },
        styleTextColor: {
          label: 'Colore testo',
          tab: 'style',
          order: 3,
        },
      },
    },
  },
  {
    type: 'navMenu',
    v: 1,
    enabled: true,
    childrenAllow: ['navMenuItem'],
    props: [],
    meta: {
      label: 'Menu di navigazione',
      category: 'navigazione',
      icon: 'menu-2',
    },
  },
  {
    type: 'navMenuItem',
    v: 1,
    enabled: true,
    childrenAllow: [],
    props: [
      {
        name: 'label',
        kind: 'plainText',
        required: true,
        maxLength: 80,
      },
      {
        name: 'pageGuid',
        kind: 'pageRef',
        required: false,
      },
      {
        name: 'url',
        kind: 'url',
        required: false,
        maxLength: 2048,
      },
      {
        name: 'target',
        kind: 'enum',
        required: false,
        default: '_self',
        values: ['_self', '_blank'],
      },
    ],
    meta: {
      label: 'Voce di menu',
      category: 'navigazione',
      icon: 'link',
      props: {
        label: {
          label: 'Etichetta',
          order: 1,
        },
        pageGuid: {
          label: 'Pagina collegata',
          order: 2,
          help: "Pagina interna a cui la voce rimanda. Se è impostato anche un URL, l'URL vince.",
        },
        url: {
          label: 'URL',
          order: 3,
          help: 'Link esterno o assoluto. Se presente, vince sulla Pagina collegata.',
        },
        target: {
          label: 'Apertura link',
          order: 4,
        },
      },
    },
  },
  {
    type: 'globalRef',
    v: 1,
    enabled: true,
    childrenAllow: [],
    props: [
      {
        name: 'globalSectionGuid',
        kind: 'globalSectionRef',
        required: true,
      },
    ],
    meta: {
      label: 'Sezione Globale',
      category: 'navigazione',
      icon: 'puzzle',
      props: {
        globalSectionGuid: {
          label: 'Sezione Globale',
          order: 1,
          help: 'Sezione Globale referenziata: la modifica del suo contenuto si riflette qui e in ogni altro punto che la referenzia.',
        },
      },
    },
  },
  {
    type: 'accordion',
    v: 1,
    enabled: true,
    childrenAllow: ['accordionItem'],
    props: [
      {
        name: 'exclusive',
        kind: 'boolean',
        required: false,
        default: false,
      },
    ],
    meta: {
      label: 'Accordion',
      category: 'interattivo',
      icon: 'list-details',
      props: {
        exclusive: {
          label: 'Apertura esclusiva',
          order: 1,
          help: 'Se attivo, aprire una voce chiude automaticamente le altre (comportamento CSS-only, degrada su browser molto datati).',
        },
      },
    },
  },
  {
    type: 'accordionItem',
    v: 1,
    enabled: true,
    childrenAllow: ['heading', 'richText', 'image', 'button', 'container'],
    props: [
      {
        name: 'title',
        kind: 'plainText',
        required: true,
        maxLength: 120,
      },
    ],
    meta: {
      label: 'Voce accordion',
      category: 'interattivo',
      icon: 'chevron-down',
      props: {
        title: {
          label: 'Titolo',
          order: 1,
        },
      },
    },
  },
  {
    type: 'tabs',
    v: 1,
    enabled: true,
    childrenAllow: ['tabPanel'],
    props: [],
    meta: {
      label: 'Tabs',
      category: 'interattivo',
      icon: 'layout-navbar',
    },
  },
  {
    type: 'tabPanel',
    v: 1,
    enabled: true,
    childrenAllow: ['heading', 'richText', 'image', 'button', 'container'],
    props: [
      {
        name: 'label',
        kind: 'plainText',
        required: true,
        maxLength: 60,
      },
    ],
    meta: {
      label: 'Pannello tab',
      category: 'interattivo',
      icon: 'square',
      props: {
        label: {
          label: 'Etichetta',
          order: 1,
        },
      },
    },
  },
  {
    type: 'carousel',
    v: 1,
    enabled: true,
    childrenAllow: ['carouselSlide'],
    props: [
      {
        name: 'autoplay',
        kind: 'boolean',
        required: false,
        default: false,
      },
      {
        name: 'transition',
        kind: 'enum',
        required: false,
        default: 'manual-scroll',
        values: ['manual-scroll', 'fade-loop', 'slide-loop'],
      },
    ],
    meta: {
      label: 'Carousel',
      category: 'interattivo',
      icon: 'carousel-horizontal',
      props: {
        autoplay: {
          label: 'Avvio automatico',
          order: 1,
          help: "Nessun effetto se la transizione è impostata su 'Scorrimento manuale' (no-op silenzioso, ADR-57 § 4).",
        },
        transition: {
          label: 'Transizione',
          order: 2,
        },
      },
    },
  },
  {
    type: 'carouselSlide',
    v: 1,
    enabled: true,
    childrenAllow: ['heading', 'richText', 'image', 'button', 'container'],
    props: [],
    meta: {
      label: 'Slide carousel',
      category: 'interattivo',
      icon: 'photo',
    },
  },
  {
    type: 'modalTrigger',
    v: 1,
    enabled: true,
    childrenAllow: ['heading', 'richText', 'image', 'button', 'container'],
    props: [
      {
        name: 'triggerLabel',
        kind: 'plainText',
        required: true,
        maxLength: 80,
      },
      {
        name: 'animation',
        kind: 'enum',
        required: false,
        default: 'fade',
        values: ['none', 'fade', 'slide-down'],
      },
    ],
    meta: {
      label: 'Modale',
      category: 'interattivo',
      icon: 'square-arrow-up',
      props: {
        triggerLabel: {
          label: 'Etichetta del link',
          order: 1,
        },
        animation: {
          label: 'Animazione',
          order: 2,
          help: 'Solo presentazione: nessun JavaScript, tecnica CSS :target.',
        },
      },
    },
  },
  {
    type: 'gallery',
    v: 1,
    enabled: true,
    childrenAllow: ['image'],
    props: [
      {
        name: 'layout',
        kind: 'layout',
        required: false,
        responsive: true,
      },
      {
        name: 'galleryMode',
        kind: 'enum',
        required: false,
        default: 'grid',
        values: ['grid', 'masonry', 'metro'],
      },
      {
        name: 'lightbox',
        kind: 'boolean',
        required: false,
        default: false,
      },
      {
        name: 'hideOn',
        kind: 'hideOn',
        required: false,
      },
      {
        name: 'customCssClass',
        kind: 'cssClassName',
        required: false,
      },
      {
        name: 'customElementId',
        kind: 'htmlId',
        required: false,
      },
    ],
    meta: {
      label: 'Galleria',
      category: 'media',
      icon: 'layout-grid',
      props: {
        layout: {
          label: 'Layout (colonne/spaziatura)',
          tab: 'style',
          order: 1,
        },
        galleryMode: {
          label: 'Modalità',
          tab: 'style',
          order: 2,
          help: 'Algoritmo di disposizione sopra la griglia base: grid (celle uniformi), masonry, metro.',
        },
        lightbox: {
          label: 'Lightbox',
          tab: 'advanced',
          order: 3,
          help: 'Solo persistito in questo round: nessun runtime JS lo onora ancora (R5, PLAN-parita-elementor-pro.md § R4/R5).',
        },
        hideOn: {
          label: 'Nascondi su breakpoint',
          tab: 'advanced',
          order: 4,
        },
        customCssClass: {
          label: 'Classe CSS personalizzata',
          tab: 'advanced',
          order: 5,
          help: 'Una o più classi separate da spazio: solo lettere, numeri, trattino, underscore.',
        },
        customElementId: {
          label: 'ID elemento personalizzato',
          tab: 'advanced',
          order: 6,
          help: 'Solo lettere, numeri, trattino, underscore — nessuno spazio.',
        },
      },
    },
  },
] as const;
