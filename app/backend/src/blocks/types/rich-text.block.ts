import { BlockDefinition } from '../block-definition.types';

/**
 * `richText` — frammento di testo formattato (SPEC-F02-blocchi.md § 3.4).
 * `html` usa il profilo `basic` (ADR-20/ADR-21 § 4); la sanitizzazione vera
 * e propria è T3, fuori scope qui. Stringa vuota ammessa. Foglia.
 */
export const richTextBlock: BlockDefinition = {
  type: 'richText',
  v: 1,
  props: {
    html: {
      kind: 'richText',
      profile: 'basic',
      required: true,
      maxLength: 20000,
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
    label: 'Testo',
    category: 'testo',
    icon: 'align-left',
    props: {
      html: { label: 'Contenuto', order: 1 },
      styleSpaceBefore: { label: 'Spazio prima', tab: 'style', order: 2 },
      styleSpaceAfter: { label: 'Spazio dopo', tab: 'style', order: 3 },
      styleTextColor: { label: 'Colore testo', tab: 'style', order: 4 },
      styleFontSize: { label: 'Dimensione testo', tab: 'style', order: 5 },
      styleFontWeight: { label: 'Spessore testo', tab: 'style', order: 6 },
    },
  },
};
