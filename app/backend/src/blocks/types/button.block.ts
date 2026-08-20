import { BlockDefinition } from '../block-definition.types';

/**
 * `button` — pulsante/link (SPEC-F02-blocchi.md § 3.6). `href` ammette solo
 * `http`/`https`/`mailto`/root-relative (una sola barra iniziale); nessuna
 * prop di rendering (`variant`, `size`, `icon`). Foglia.
 */
export const buttonBlock: BlockDefinition = {
  type: 'button',
  v: 1,
  props: {
    label: {
      kind: 'plainText',
      required: true,
      maxLength: 80,
    },
    href: {
      kind: 'url',
      required: true,
      maxLength: 2048,
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
    label: 'Pulsante',
    category: 'azione',
    icon: 'hand-click',
    props: {
      label: { label: 'Etichetta', order: 1 },
      href: { label: 'Link', order: 2 },
      styleSpaceBefore: { label: 'Spazio prima', tab: 'style', order: 3 },
      styleSpaceAfter: { label: 'Spazio dopo', tab: 'style', order: 4 },
      styleTextColor: { label: 'Colore testo', tab: 'style', order: 5 },
      styleFontSize: { label: 'Dimensione testo', tab: 'style', order: 6 },
      styleFontWeight: { label: 'Spessore testo', tab: 'style', order: 7 },
    },
  },
};
