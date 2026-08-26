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
    | 'color'
    | 'unitValue'
    | 'border'
    | 'shadow'
    | 'cssClassName'
    | 'htmlId';
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
  /** Solo `kind: 'unitValue'` (ADR-38 § 2): intervallo numerico ammesso, dichiarato dalla prop. */
  min?: number;
  max?: number;
}

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
  childrenAllow: readonly string[];
  props: readonly BlockPropDescriptor[];
  meta?: BlockEditorMeta;
}

/** Versione corrente dell'envelope `{ version, blocks }` (ADR-21 § 1). */
export const ENVELOPE_VERSION = 1 as const;

/** Tipi ammessi come nodo di radice dell'albero (ADR-21 § 2). */
export const ROOT_ALLOWED = [
  "section",
  "heading",
  "richText",
  "image",
  "button"
] as const;

/** Limiti dell'envelope (SPEC-F02-blocchi.md § 1): per avvisare prima del 400, non per applicarli. */
export const CONTENT_TREE_LIMITS = {
  "maxDepth": 5,
  "maxNodes": 500,
  "maxPayloadBytes": 524288
} as const;

/** I tipi di blocco registrati, nell'ordine dichiarato dal backend. */
export const BLOCK_TYPES: readonly BlockTypeDescriptor[] = [
  {
    "type": "section",
    "v": 1,
    "enabled": true,
    "childrenAllow": [
      "heading",
      "richText",
      "image",
      "button"
    ],
    "props": [
      {
        "name": "styleSpaceBefore",
        "kind": "enum",
        "required": false,
        "default": {
          "default": "none"
        },
        "values": [
          "none",
          "xs",
          "sm",
          "md",
          "lg",
          "xl"
        ],
        "responsive": true
      },
      {
        "name": "styleSpaceAfter",
        "kind": "enum",
        "required": false,
        "default": {
          "default": "none"
        },
        "values": [
          "none",
          "xs",
          "sm",
          "md",
          "lg",
          "xl"
        ],
        "responsive": true
      },
      {
        "name": "stylePadding",
        "kind": "enum",
        "required": false,
        "default": {
          "default": "none"
        },
        "values": [
          "none",
          "sm",
          "md",
          "lg"
        ],
        "responsive": true
      },
      {
        "name": "styleBackground",
        "kind": "enum",
        "required": false,
        "default": {
          "default": "none"
        },
        "values": [
          "none",
          "subtle",
          "accent",
          "inverse"
        ],
        "responsive": true
      },
      {
        "name": "columns",
        "kind": "enum",
        "required": false,
        "default": {
          "default": "1"
        },
        "values": [
          "1",
          "2",
          "3",
          "4"
        ],
        "responsive": true
      },
      {
        "name": "gap",
        "kind": "enum",
        "required": false,
        "default": {
          "default": "none"
        },
        "values": [
          "none",
          "sm",
          "md",
          "lg"
        ],
        "responsive": true
      },
      {
        "name": "alignItems",
        "kind": "enum",
        "required": false,
        "default": {
          "default": "stretch"
        },
        "values": [
          "stretch",
          "flex-start",
          "center",
          "flex-end"
        ],
        "responsive": true
      },
      {
        "name": "contentWidth",
        "kind": "enum",
        "required": false,
        "default": "boxed",
        "values": [
          "boxed",
          "full-width"
        ]
      },
      {
        "name": "maxWidth",
        "kind": "enum",
        "required": false,
        "default": "md",
        "values": [
          "sm",
          "md",
          "lg",
          "xl"
        ]
      },
      {
        "name": "columnRatio",
        "kind": "enum",
        "required": false,
        "default": "equal",
        "values": [
          "equal",
          "33-66",
          "66-33"
        ]
      },
      {
        "name": "styleBackgroundColor",
        "kind": "color",
        "required": false
      },
      {
        "name": "stylePaddingTop",
        "kind": "enum",
        "required": false,
        "default": {
          "default": "0"
        },
        "values": [
          "0",
          "4",
          "8",
          "12",
          "16",
          "24",
          "32",
          "48",
          "64",
          "96"
        ],
        "responsive": true
      },
      {
        "name": "stylePaddingRight",
        "kind": "enum",
        "required": false,
        "default": {
          "default": "0"
        },
        "values": [
          "0",
          "4",
          "8",
          "12",
          "16",
          "24",
          "32",
          "48",
          "64",
          "96"
        ],
        "responsive": true
      },
      {
        "name": "stylePaddingBottom",
        "kind": "enum",
        "required": false,
        "default": {
          "default": "0"
        },
        "values": [
          "0",
          "4",
          "8",
          "12",
          "16",
          "24",
          "32",
          "48",
          "64",
          "96"
        ],
        "responsive": true
      },
      {
        "name": "stylePaddingLeft",
        "kind": "enum",
        "required": false,
        "default": {
          "default": "0"
        },
        "values": [
          "0",
          "4",
          "8",
          "12",
          "16",
          "24",
          "32",
          "48",
          "64",
          "96"
        ],
        "responsive": true
      },
      {
        "name": "styleMarginTop",
        "kind": "enum",
        "required": false,
        "default": {
          "default": "0"
        },
        "values": [
          "0",
          "4",
          "8",
          "12",
          "16",
          "24",
          "32",
          "48",
          "64",
          "96"
        ],
        "responsive": true
      },
      {
        "name": "styleMarginRight",
        "kind": "enum",
        "required": false,
        "default": {
          "default": "0"
        },
        "values": [
          "0",
          "4",
          "8",
          "12",
          "16",
          "24",
          "32",
          "48",
          "64",
          "96"
        ],
        "responsive": true
      },
      {
        "name": "styleMarginBottom",
        "kind": "enum",
        "required": false,
        "default": {
          "default": "0"
        },
        "values": [
          "0",
          "4",
          "8",
          "12",
          "16",
          "24",
          "32",
          "48",
          "64",
          "96"
        ],
        "responsive": true
      },
      {
        "name": "styleMarginLeft",
        "kind": "enum",
        "required": false,
        "default": {
          "default": "0"
        },
        "values": [
          "0",
          "4",
          "8",
          "12",
          "16",
          "24",
          "32",
          "48",
          "64",
          "96"
        ],
        "responsive": true
      },
      {
        "name": "styleLayer",
        "kind": "enum",
        "required": false,
        "default": "base",
        "values": [
          "base",
          "raised",
          "overlay",
          "top"
        ]
      },
      {
        "name": "styleHideDesktop",
        "kind": "boolean",
        "required": false,
        "default": false
      },
      {
        "name": "styleHideTablet",
        "kind": "boolean",
        "required": false,
        "default": false
      },
      {
        "name": "styleHideMobile",
        "kind": "boolean",
        "required": false,
        "default": false
      },
      {
        "name": "styleBorder",
        "kind": "border",
        "required": false
      },
      {
        "name": "styleShadow",
        "kind": "shadow",
        "required": false
      },
      {
        "name": "customCssClass",
        "kind": "cssClassName",
        "required": false
      },
      {
        "name": "customElementId",
        "kind": "htmlId",
        "required": false
      }
    ],
    "meta": {
      "label": "Sezione",
      "category": "layout",
      "icon": "layout-board",
      "props": {
        "styleSpaceBefore": {
          "label": "Spazio prima",
          "tab": "style",
          "order": 1
        },
        "styleSpaceAfter": {
          "label": "Spazio dopo",
          "tab": "style",
          "order": 2
        },
        "stylePadding": {
          "label": "Spaziatura interna",
          "tab": "style",
          "order": 3
        },
        "styleBackground": {
          "label": "Sfondo",
          "tab": "style",
          "order": 4
        },
        "columns": {
          "label": "Colonne",
          "tab": "style",
          "order": 5,
          "help": "Numero di colonne del contenitore"
        },
        "gap": {
          "label": "Spaziatura tra colonne",
          "tab": "style",
          "order": 6
        },
        "alignItems": {
          "label": "Allineamento verticale",
          "tab": "style",
          "order": 7
        },
        "contentWidth": {
          "label": "Larghezza contenuto",
          "tab": "style",
          "order": 8
        },
        "maxWidth": {
          "label": "Larghezza massima",
          "tab": "style",
          "order": 9
        },
        "columnRatio": {
          "label": "Proporzione colonne",
          "tab": "style",
          "order": 10,
          "help": "Significativa solo con 2 colonne"
        },
        "styleBackgroundColor": {
          "label": "Colore di sfondo",
          "tab": "style",
          "order": 11
        },
        "stylePaddingTop": {
          "label": "Padding superiore",
          "tab": "style",
          "order": 12
        },
        "stylePaddingRight": {
          "label": "Padding destro",
          "tab": "style",
          "order": 13
        },
        "stylePaddingBottom": {
          "label": "Padding inferiore",
          "tab": "style",
          "order": 14
        },
        "stylePaddingLeft": {
          "label": "Padding sinistro",
          "tab": "style",
          "order": 15
        },
        "styleMarginTop": {
          "label": "Margine superiore",
          "tab": "style",
          "order": 16
        },
        "styleMarginRight": {
          "label": "Margine destro",
          "tab": "style",
          "order": 17
        },
        "styleMarginBottom": {
          "label": "Margine inferiore",
          "tab": "style",
          "order": 18
        },
        "styleMarginLeft": {
          "label": "Margine sinistro",
          "tab": "style",
          "order": 19
        },
        "styleLayer": {
          "label": "Livello di sovrapposizione",
          "tab": "advanced",
          "order": 20
        },
        "styleHideDesktop": {
          "label": "Nascondi su Desktop",
          "tab": "advanced",
          "order": 21
        },
        "styleHideTablet": {
          "label": "Nascondi su Tablet",
          "tab": "advanced",
          "order": 22
        },
        "styleHideMobile": {
          "label": "Nascondi su Mobile",
          "tab": "advanced",
          "order": 23
        },
        "styleBorder": {
          "label": "Bordo",
          "tab": "style",
          "order": 24
        },
        "styleShadow": {
          "label": "Ombra",
          "tab": "style",
          "order": 25
        },
        "customCssClass": {
          "label": "Classe CSS personalizzata",
          "tab": "advanced",
          "order": 26,
          "help": "Una o più classi separate da spazio: solo lettere, numeri, trattino, underscore."
        },
        "customElementId": {
          "label": "ID elemento personalizzato",
          "tab": "advanced",
          "order": 27,
          "help": "Solo lettere, numeri, trattino, underscore — nessuno spazio."
        }
      }
    }
  },
  {
    "type": "heading",
    "v": 1,
    "enabled": true,
    "childrenAllow": [],
    "props": [
      {
        "name": "level",
        "kind": "enum",
        "required": true,
        "values": [
          "h2",
          "h3",
          "h4",
          "h5",
          "h6"
        ]
      },
      {
        "name": "text",
        "kind": "plainText",
        "required": true,
        "maxLength": 200
      },
      {
        "name": "styleSpaceBefore",
        "kind": "enum",
        "required": false,
        "default": {
          "default": "none"
        },
        "values": [
          "none",
          "xs",
          "sm",
          "md",
          "lg",
          "xl"
        ],
        "responsive": true
      },
      {
        "name": "styleSpaceAfter",
        "kind": "enum",
        "required": false,
        "default": {
          "default": "none"
        },
        "values": [
          "none",
          "xs",
          "sm",
          "md",
          "lg",
          "xl"
        ],
        "responsive": true
      },
      {
        "name": "styleTextColor",
        "kind": "enum",
        "required": false,
        "default": {
          "default": "default"
        },
        "values": [
          "default",
          "muted",
          "accent",
          "inverse"
        ],
        "responsive": true
      },
      {
        "name": "styleFontSize",
        "kind": "enum",
        "required": false,
        "default": {
          "default": "md"
        },
        "values": [
          "sm",
          "md",
          "lg",
          "xl"
        ],
        "responsive": true
      },
      {
        "name": "styleFontWeight",
        "kind": "enum",
        "required": false,
        "default": {
          "default": "regular"
        },
        "values": [
          "regular",
          "medium",
          "bold"
        ],
        "responsive": true
      },
      {
        "name": "styleFontFamily",
        "kind": "enum",
        "required": false,
        "default": {
          "default": "default"
        },
        "values": [
          "default",
          "inter",
          "roboto",
          "playfair",
          "montserrat",
          "monospace"
        ],
        "responsive": true
      },
      {
        "name": "styleLayer",
        "kind": "enum",
        "required": false,
        "default": "base",
        "values": [
          "base",
          "raised",
          "overlay",
          "top"
        ]
      },
      {
        "name": "styleHideDesktop",
        "kind": "boolean",
        "required": false,
        "default": false
      },
      {
        "name": "styleHideTablet",
        "kind": "boolean",
        "required": false,
        "default": false
      },
      {
        "name": "styleHideMobile",
        "kind": "boolean",
        "required": false,
        "default": false
      },
      {
        "name": "styleTextColorCustom",
        "kind": "color",
        "required": false
      },
      {
        "name": "styleFontSizeCustom",
        "kind": "unitValue",
        "required": false,
        "units": [
          "px",
          "%",
          "em",
          "rem"
        ],
        "min": 1,
        "max": 200
      },
      {
        "name": "styleBorder",
        "kind": "border",
        "required": false
      },
      {
        "name": "styleShadow",
        "kind": "shadow",
        "required": false
      },
      {
        "name": "customCssClass",
        "kind": "cssClassName",
        "required": false
      },
      {
        "name": "customElementId",
        "kind": "htmlId",
        "required": false
      }
    ],
    "meta": {
      "label": "Titolo",
      "category": "testo",
      "icon": "heading",
      "props": {
        "level": {
          "label": "Livello",
          "order": 1
        },
        "text": {
          "label": "Testo",
          "order": 2
        },
        "styleSpaceBefore": {
          "label": "Spazio prima",
          "tab": "style",
          "order": 3
        },
        "styleSpaceAfter": {
          "label": "Spazio dopo",
          "tab": "style",
          "order": 4
        },
        "styleTextColor": {
          "label": "Colore testo",
          "tab": "style",
          "order": 5
        },
        "styleFontSize": {
          "label": "Dimensione testo",
          "tab": "style",
          "order": 6
        },
        "styleFontWeight": {
          "label": "Spessore testo",
          "tab": "style",
          "order": 7
        },
        "styleFontFamily": {
          "label": "Famiglia Font",
          "tab": "style",
          "order": 8
        },
        "styleLayer": {
          "label": "Livello di sovrapposizione",
          "tab": "advanced",
          "order": 9
        },
        "styleHideDesktop": {
          "label": "Nascondi su Desktop",
          "tab": "advanced",
          "order": 10
        },
        "styleHideTablet": {
          "label": "Nascondi su Tablet",
          "tab": "advanced",
          "order": 11
        },
        "styleHideMobile": {
          "label": "Nascondi su Mobile",
          "tab": "advanced",
          "order": 12
        },
        "styleTextColorCustom": {
          "label": "Colore testo personalizzato",
          "tab": "style",
          "order": 13,
          "help": "Colore libero (esadecimale). Ha priorità su \"Colore testo\" se impostato."
        },
        "styleFontSizeCustom": {
          "label": "Dimensione testo personalizzata",
          "tab": "style",
          "order": 14,
          "help": "Valore libero con unità. Ha priorità su \"Dimensione testo\" se impostato."
        },
        "styleBorder": {
          "label": "Bordo",
          "tab": "style",
          "order": 15
        },
        "styleShadow": {
          "label": "Ombra",
          "tab": "style",
          "order": 16
        },
        "customCssClass": {
          "label": "Classe CSS personalizzata",
          "tab": "advanced",
          "order": 17,
          "help": "Una o più classi separate da spazio: solo lettere, numeri, trattino, underscore."
        },
        "customElementId": {
          "label": "ID elemento personalizzato",
          "tab": "advanced",
          "order": 18,
          "help": "Solo lettere, numeri, trattino, underscore — nessuno spazio."
        }
      }
    }
  },
  {
    "type": "richText",
    "v": 1,
    "enabled": true,
    "childrenAllow": [],
    "props": [
      {
        "name": "html",
        "kind": "richText",
        "required": true,
        "maxLength": 20000,
        "profile": "basic"
      },
      {
        "name": "styleSpaceBefore",
        "kind": "enum",
        "required": false,
        "default": {
          "default": "none"
        },
        "values": [
          "none",
          "xs",
          "sm",
          "md",
          "lg",
          "xl"
        ],
        "responsive": true
      },
      {
        "name": "styleSpaceAfter",
        "kind": "enum",
        "required": false,
        "default": {
          "default": "none"
        },
        "values": [
          "none",
          "xs",
          "sm",
          "md",
          "lg",
          "xl"
        ],
        "responsive": true
      },
      {
        "name": "styleTextColor",
        "kind": "enum",
        "required": false,
        "default": {
          "default": "default"
        },
        "values": [
          "default",
          "muted",
          "accent",
          "inverse"
        ],
        "responsive": true
      },
      {
        "name": "styleFontSize",
        "kind": "enum",
        "required": false,
        "default": {
          "default": "md"
        },
        "values": [
          "sm",
          "md",
          "lg",
          "xl"
        ],
        "responsive": true
      },
      {
        "name": "styleFontWeight",
        "kind": "enum",
        "required": false,
        "default": {
          "default": "regular"
        },
        "values": [
          "regular",
          "medium",
          "bold"
        ],
        "responsive": true
      },
      {
        "name": "styleFontFamily",
        "kind": "enum",
        "required": false,
        "default": {
          "default": "default"
        },
        "values": [
          "default",
          "inter",
          "roboto",
          "playfair",
          "montserrat",
          "monospace"
        ],
        "responsive": true
      },
      {
        "name": "styleLayer",
        "kind": "enum",
        "required": false,
        "default": "base",
        "values": [
          "base",
          "raised",
          "overlay",
          "top"
        ]
      },
      {
        "name": "styleHideDesktop",
        "kind": "boolean",
        "required": false,
        "default": false
      },
      {
        "name": "styleHideTablet",
        "kind": "boolean",
        "required": false,
        "default": false
      },
      {
        "name": "styleHideMobile",
        "kind": "boolean",
        "required": false,
        "default": false
      },
      {
        "name": "styleTextColorCustom",
        "kind": "color",
        "required": false
      },
      {
        "name": "styleFontSizeCustom",
        "kind": "unitValue",
        "required": false,
        "units": [
          "px",
          "%",
          "em",
          "rem"
        ],
        "min": 1,
        "max": 200
      },
      {
        "name": "styleBorder",
        "kind": "border",
        "required": false
      },
      {
        "name": "styleShadow",
        "kind": "shadow",
        "required": false
      },
      {
        "name": "customCssClass",
        "kind": "cssClassName",
        "required": false
      },
      {
        "name": "customElementId",
        "kind": "htmlId",
        "required": false
      }
    ],
    "meta": {
      "label": "Testo",
      "category": "testo",
      "icon": "align-left",
      "props": {
        "html": {
          "label": "Contenuto",
          "order": 1
        },
        "styleSpaceBefore": {
          "label": "Spazio prima",
          "tab": "style",
          "order": 2
        },
        "styleSpaceAfter": {
          "label": "Spazio dopo",
          "tab": "style",
          "order": 3
        },
        "styleTextColor": {
          "label": "Colore testo",
          "tab": "style",
          "order": 4
        },
        "styleFontSize": {
          "label": "Dimensione testo",
          "tab": "style",
          "order": 5
        },
        "styleFontWeight": {
          "label": "Spessore testo",
          "tab": "style",
          "order": 6
        },
        "styleFontFamily": {
          "label": "Famiglia Font",
          "tab": "style",
          "order": 8
        },
        "styleLayer": {
          "label": "Livello di sovrapposizione",
          "tab": "advanced",
          "order": 9
        },
        "styleHideDesktop": {
          "label": "Nascondi su Desktop",
          "tab": "advanced",
          "order": 10
        },
        "styleHideTablet": {
          "label": "Nascondi su Tablet",
          "tab": "advanced",
          "order": 11
        },
        "styleHideMobile": {
          "label": "Nascondi su Mobile",
          "tab": "advanced",
          "order": 12
        },
        "styleTextColorCustom": {
          "label": "Colore testo personalizzato",
          "tab": "style",
          "order": 13,
          "help": "Colore libero (esadecimale). Ha priorità su \"Colore testo\" se impostato."
        },
        "styleFontSizeCustom": {
          "label": "Dimensione testo personalizzata",
          "tab": "style",
          "order": 14,
          "help": "Valore libero con unità. Ha priorità su \"Dimensione testo\" se impostato."
        },
        "styleBorder": {
          "label": "Bordo",
          "tab": "style",
          "order": 15
        },
        "styleShadow": {
          "label": "Ombra",
          "tab": "style",
          "order": 16
        },
        "customCssClass": {
          "label": "Classe CSS personalizzata",
          "tab": "advanced",
          "order": 17,
          "help": "Una o più classi separate da spazio: solo lettere, numeri, trattino, underscore."
        },
        "customElementId": {
          "label": "ID elemento personalizzato",
          "tab": "advanced",
          "order": 18,
          "help": "Solo lettere, numeri, trattino, underscore — nessuno spazio."
        }
      }
    }
  },
  {
    "type": "image",
    "v": 1,
    "enabled": true,
    "childrenAllow": [],
    "props": [
      {
        "name": "mediaRef",
        "kind": "mediaRef",
        "required": true
      },
      {
        "name": "alt",
        "kind": "plainText",
        "required": true,
        "maxLength": 300,
        "nonEmpty": true
      },
      {
        "name": "styleSpaceBefore",
        "kind": "enum",
        "required": false,
        "default": {
          "default": "none"
        },
        "values": [
          "none",
          "xs",
          "sm",
          "md",
          "lg",
          "xl"
        ],
        "responsive": true
      },
      {
        "name": "styleSpaceAfter",
        "kind": "enum",
        "required": false,
        "default": {
          "default": "none"
        },
        "values": [
          "none",
          "xs",
          "sm",
          "md",
          "lg",
          "xl"
        ],
        "responsive": true
      },
      {
        "name": "styleLayer",
        "kind": "enum",
        "required": false,
        "default": "base",
        "values": [
          "base",
          "raised",
          "overlay",
          "top"
        ]
      },
      {
        "name": "styleHideDesktop",
        "kind": "boolean",
        "required": false,
        "default": false
      },
      {
        "name": "styleHideTablet",
        "kind": "boolean",
        "required": false,
        "default": false
      },
      {
        "name": "styleHideMobile",
        "kind": "boolean",
        "required": false,
        "default": false
      },
      {
        "name": "styleBorder",
        "kind": "border",
        "required": false
      },
      {
        "name": "styleShadow",
        "kind": "shadow",
        "required": false
      },
      {
        "name": "customCssClass",
        "kind": "cssClassName",
        "required": false
      },
      {
        "name": "customElementId",
        "kind": "htmlId",
        "required": false
      }
    ],
    "meta": {
      "label": "Immagine",
      "category": "media",
      "icon": "photo",
      "props": {
        "mediaRef": {
          "label": "File",
          "order": 1
        },
        "alt": {
          "label": "Testo alternativo",
          "order": 2
        },
        "styleSpaceBefore": {
          "label": "Spazio prima",
          "tab": "style",
          "order": 3
        },
        "styleSpaceAfter": {
          "label": "Spazio dopo",
          "tab": "style",
          "order": 4
        },
        "styleLayer": {
          "label": "Livello di sovrapposizione",
          "tab": "advanced",
          "order": 5
        },
        "styleHideDesktop": {
          "label": "Nascondi su Desktop",
          "tab": "advanced",
          "order": 6
        },
        "styleHideTablet": {
          "label": "Nascondi su Tablet",
          "tab": "advanced",
          "order": 7
        },
        "styleHideMobile": {
          "label": "Nascondi su Mobile",
          "tab": "advanced",
          "order": 8
        },
        "styleBorder": {
          "label": "Bordo",
          "tab": "style",
          "order": 9
        },
        "styleShadow": {
          "label": "Ombra",
          "tab": "style",
          "order": 10
        },
        "customCssClass": {
          "label": "Classe CSS personalizzata",
          "tab": "advanced",
          "order": 11,
          "help": "Una o più classi separate da spazio: solo lettere, numeri, trattino, underscore."
        },
        "customElementId": {
          "label": "ID elemento personalizzato",
          "tab": "advanced",
          "order": 12,
          "help": "Solo lettere, numeri, trattino, underscore — nessuno spazio."
        }
      }
    }
  },
  {
    "type": "button",
    "v": 1,
    "enabled": true,
    "childrenAllow": [],
    "props": [
      {
        "name": "label",
        "kind": "plainText",
        "required": true,
        "maxLength": 80
      },
      {
        "name": "href",
        "kind": "url",
        "required": true,
        "maxLength": 2048
      },
      {
        "name": "styleSpaceBefore",
        "kind": "enum",
        "required": false,
        "default": {
          "default": "none"
        },
        "values": [
          "none",
          "xs",
          "sm",
          "md",
          "lg",
          "xl"
        ],
        "responsive": true
      },
      {
        "name": "styleSpaceAfter",
        "kind": "enum",
        "required": false,
        "default": {
          "default": "none"
        },
        "values": [
          "none",
          "xs",
          "sm",
          "md",
          "lg",
          "xl"
        ],
        "responsive": true
      },
      {
        "name": "styleTextColor",
        "kind": "enum",
        "required": false,
        "default": {
          "default": "default"
        },
        "values": [
          "default",
          "muted",
          "accent",
          "inverse"
        ],
        "responsive": true
      },
      {
        "name": "styleFontSize",
        "kind": "enum",
        "required": false,
        "default": {
          "default": "md"
        },
        "values": [
          "sm",
          "md",
          "lg",
          "xl"
        ],
        "responsive": true
      },
      {
        "name": "styleFontWeight",
        "kind": "enum",
        "required": false,
        "default": {
          "default": "regular"
        },
        "values": [
          "regular",
          "medium",
          "bold"
        ],
        "responsive": true
      },
      {
        "name": "styleFontFamily",
        "kind": "enum",
        "required": false,
        "default": {
          "default": "default"
        },
        "values": [
          "default",
          "inter",
          "roboto",
          "playfair",
          "montserrat",
          "monospace"
        ],
        "responsive": true
      },
      {
        "name": "styleLayer",
        "kind": "enum",
        "required": false,
        "default": "base",
        "values": [
          "base",
          "raised",
          "overlay",
          "top"
        ]
      },
      {
        "name": "styleHideDesktop",
        "kind": "boolean",
        "required": false,
        "default": false
      },
      {
        "name": "styleHideTablet",
        "kind": "boolean",
        "required": false,
        "default": false
      },
      {
        "name": "styleHideMobile",
        "kind": "boolean",
        "required": false,
        "default": false
      },
      {
        "name": "customCssClass",
        "kind": "cssClassName",
        "required": false
      },
      {
        "name": "customElementId",
        "kind": "htmlId",
        "required": false
      }
    ],
    "meta": {
      "label": "Pulsante",
      "category": "azione",
      "icon": "hand-click",
      "props": {
        "label": {
          "label": "Etichetta",
          "order": 1
        },
        "href": {
          "label": "Link",
          "order": 2
        },
        "styleSpaceBefore": {
          "label": "Spazio prima",
          "tab": "style",
          "order": 3
        },
        "styleSpaceAfter": {
          "label": "Spazio dopo",
          "tab": "style",
          "order": 4
        },
        "styleTextColor": {
          "label": "Colore testo",
          "tab": "style",
          "order": 5
        },
        "styleFontSize": {
          "label": "Dimensione testo",
          "tab": "style",
          "order": 6
        },
        "styleFontWeight": {
          "label": "Spessore testo",
          "tab": "style",
          "order": 7
        },
        "styleFontFamily": {
          "label": "Famiglia Font",
          "tab": "style",
          "order": 8
        },
        "styleLayer": {
          "label": "Livello di sovrapposizione",
          "tab": "advanced",
          "order": 9
        },
        "styleHideDesktop": {
          "label": "Nascondi su Desktop",
          "tab": "advanced",
          "order": 10
        },
        "styleHideTablet": {
          "label": "Nascondi su Tablet",
          "tab": "advanced",
          "order": 11
        },
        "styleHideMobile": {
          "label": "Nascondi su Mobile",
          "tab": "advanced",
          "order": 12
        },
        "customCssClass": {
          "label": "Classe CSS personalizzata",
          "tab": "advanced",
          "order": 13,
          "help": "Una o più classi separate da spazio: solo lettere, numeri, trattino, underscore."
        },
        "customElementId": {
          "label": "ID elemento personalizzato",
          "tab": "advanced",
          "order": 14,
          "help": "Solo lettere, numeri, trattino, underscore — nessuno spazio."
        }
      }
    }
  }
] as const;
