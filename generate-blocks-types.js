#!/usr/bin/env node
/**
 * generate-blocks-types.js
 * Trasforma app/backend/blocks-registry.json (prodotto da `npm run
 * blocks:export`, PLAN-F02 T6) in app/frontend/src/types/blocks.types.ts —
 * sul modello di `openapi:types` (openapi-typescript su docs/openapi.yaml),
 * senza dipendenze nuove: solo Node core (fs/path).
 *
 * Lanciare dalla root del repo con: npm run blocks:types
 * Richiede che `blocks-registry.json` sia già stato rigenerato (blocks:export).
 */

const fs = require('fs');
const path = require('path');

const ARTIFACT_PATH = path.resolve(__dirname, 'app/backend/blocks-registry.json');
const OUTPUT_PATH = path.resolve(__dirname, 'app/frontend/src/types/blocks.types.ts');

function main() {
  if (!fs.existsSync(ARTIFACT_PATH)) {
    console.error(
      `${ARTIFACT_PATH} non esiste. Esegui prima "npm run blocks:export".`,
    );
    process.exit(1);
  }

  const artifact = JSON.parse(fs.readFileSync(ARTIFACT_PATH, 'utf8'));
  const output = renderTypeScript(artifact);
  fs.writeFileSync(OUTPUT_PATH, output);
  console.log(`blocks.types.ts generato in: ${OUTPUT_PATH}`);
}

/** Serializza un valore JS come literal TypeScript (solo tipi presenti nell'artefatto: stringhe, numeri, booleani, array, oggetti). */
function literal(value, indent) {
  return JSON.stringify(value, null, 2).replace(/\n/g, `\n${indent}`);
}

function renderTypeScript(artifact) {
  const typesLiteral = literal(artifact.types, '');

  return `/**
 * File generato da 'npm run blocks:types' (blocks:export → blocks:types,
 * PLAN-F02-blocchi.md T6, SPEC-F02-blocchi.md § 5) a partire dal registro
 * dei blocchi del backend (\`app/backend/src/blocks/block-registry.ts\`).
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
  /** \`true\` = il valore è \`{ default, tablet?, mobile? }\`, non uno scalare (ADR-29 § 2/§ 3). */
  responsive?: boolean;
  /** Solo \`kind: 'unitValue'\` (ADR-38 § 2): elenco chiuso di unità ammesse per questa prop. */
  units?: readonly ('px' | '%' | 'em' | 'rem' | 'vw' | 'vh')[];
  /** Solo \`kind: 'unitValue'\`/\`'spacing'\`: intervallo numerico ammesso, dichiarato dalla prop. */
  min?: number;
  max?: number;
  /** Modificatore d'envelope stateful (ADR-75 § "Decisione" punto 1): \`{ normal, hover?, focus?, active? }\` invece di uno scalare. */
  stateful?: boolean;
  /** Solo \`kind: 'colorRef'\` (SPEC-PROPKIND-V2-DETAILS.md § 1): ammette \`#RRGGBBAA\` oltre a \`#RGB\`/\`#RRGGBB\`. */
  allowAlpha?: boolean;
  /** Solo \`kind: 'colorRef'\` (Addendum S1.2, SPEC-PROPKIND-V2-DETAILS.md): proprietà CSS di destinazione, letta da \`toCss()\`. */
  cssProperty?: 'color' | 'background-color' | 'border-color' | 'outline-color';
  /** Solo \`kind: 'spacing'\` (SPEC-PROPKIND-V2-DETAILS.md § 4 punto 1): \`min\` può essere negativo. */
  allowNegative?: boolean;
  /** Solo \`kind: 'spacing'\` (Addendum S1.2, SPEC-PROPKIND-V2-DETAILS.md): lato CSS di destinazione, letto da \`toCss()\`. */
  target?: 'padding' | 'margin';
}

/** Nomi di breakpoint ammessi per una prop \`responsive\` (ADR-76 § "Decisione" punto 1/2), dal più largo al più stretto. */
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
  /** \`'*'\` = qualunque tipo risolto dal registro, incluso se stesso (ADR-39 § 4). */
  childrenAllow: readonly string[] | '*';
  props: readonly BlockPropDescriptor[];
  meta?: BlockEditorMeta;
}

/** Versione corrente dell'envelope \`{ version, blocks }\` (ADR-21 § 1). */
export const ENVELOPE_VERSION = ${JSON.stringify(artifact.envelopeVersion)} as const;

/** Tipi ammessi come nodo di radice dell'albero (ADR-21 § 2). */
export const ROOT_ALLOWED = ${literal(artifact.rootAllowed, '')} as const;

/** Limiti dell'envelope (SPEC-F02-blocchi.md § 1): per avvisare prima del 400, non per applicarli. */
export const CONTENT_TREE_LIMITS = ${literal(artifact.limits, '')} as const;

/** I tipi di blocco registrati, nell'ordine dichiarato dal backend. */
export const BLOCK_TYPES: readonly BlockTypeDescriptor[] = ${typesLiteral} as const;
`;
}

main();
