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
  kind: 'richText' | 'plainText' | 'number' | 'boolean' | 'enum' | 'url' | 'mediaRef';
  required: boolean;
  default?: unknown;
  maxLength?: number;
  values?: readonly string[];
  profile?: 'inline' | 'basic';
  nonEmpty?: boolean;
  /** `true` = il valore è `{ default, tablet?, mobile? }`, non uno scalare (ADR-29 § 2/§ 3). */
  responsive?: boolean;
}

/** Metadati d'editor di una singola prop (ADR-30 § 1), opachi alla validazione. */
export interface BlockEditorPropMeta {
  label: string;
  tab?: 'content' | 'style';
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
        }
      }
    }
  }
] as const;
