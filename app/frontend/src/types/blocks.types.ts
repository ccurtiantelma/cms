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
}

/** Metadati d'editor, opachi alla validazione (consumati solo dalla palette di F04). */
export interface BlockEditorMeta {
  label: string;
  icon?: string;
  category?: string;
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
    "props": [],
    "meta": {
      "label": "Sezione",
      "category": "layout"
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
      }
    ],
    "meta": {
      "label": "Titolo",
      "category": "testo"
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
      }
    ],
    "meta": {
      "label": "Testo",
      "category": "testo"
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
      }
    ],
    "meta": {
      "label": "Immagine",
      "category": "media"
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
      }
    ],
    "meta": {
      "label": "Pulsante",
      "category": "azione"
    }
  }
] as const;
