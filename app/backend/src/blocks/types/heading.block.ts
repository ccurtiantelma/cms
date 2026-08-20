import { BlockDefinition } from '../block-definition.types';

/**
 * `heading` — titolo (SPEC-F02-blocchi.md § 3.3). `level` esclude `h1`:
 * l'unico `h1` del documento appartiene al template del consumer HTML, mai
 * a un blocco. Foglia (`children.allow: []`).
 */
export const headingBlock: BlockDefinition = {
  type: 'heading',
  v: 1,
  props: {
    level: {
      kind: 'enum',
      required: true,
      values: ['h2', 'h3', 'h4', 'h5', 'h6'],
    },
    text: {
      kind: 'plainText',
      required: true,
      maxLength: 200,
    },
    styleSpaceBefore: {
      kind: 'enum',
      required: false,
      responsive: true,
      values: ['none', 'xs', 'sm', 'md', 'lg', 'xl'],
      default: { default: 'none' },
    },
    styleSpaceAfter: {
      kind: 'enum',
      required: false,
      responsive: true,
      values: ['none', 'xs', 'sm', 'md', 'lg', 'xl'],
      default: { default: 'none' },
    },
    styleTextColor: {
      kind: 'enum',
      required: false,
      responsive: true,
      values: ['default', 'muted', 'accent', 'inverse'],
      default: { default: 'default' },
    },
    styleFontSize: {
      kind: 'enum',
      required: false,
      responsive: true,
      values: ['sm', 'md', 'lg', 'xl'],
      default: { default: 'md' },
    },
    styleFontWeight: {
      kind: 'enum',
      required: false,
      responsive: true,
      values: ['regular', 'medium', 'bold'],
      default: { default: 'regular' },
    },
  },
  children: { allow: [] },
  migrations: [],
  enabled: true,
  meta: {
    label: 'Titolo',
    category: 'testo',
    icon: 'heading',
    props: {
      level: { label: 'Livello', order: 1 },
      text: { label: 'Testo', order: 2 },
      styleSpaceBefore: { label: 'Spazio prima', tab: 'style', order: 3 },
      styleSpaceAfter: { label: 'Spazio dopo', tab: 'style', order: 4 },
      styleTextColor: { label: 'Colore testo', tab: 'style', order: 5 },
      styleFontSize: { label: 'Dimensione testo', tab: 'style', order: 6 },
      styleFontWeight: { label: 'Spessore testo', tab: 'style', order: 7 },
    },
  },
};
