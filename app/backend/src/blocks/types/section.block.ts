import { BlockDefinition } from '../block-definition.types';

/**
 * `section` — l'unico contenitore del primo rilascio (ADR-21 § 5,
 * SPEC-F02-blocchi.md § 3.2). Nessuna prop dichiarata: qualunque prop
 * inviata produce `BLOCK_PROP_NOT_DECLARED`. Non contiene se stessa — la
 * profondità è 1 per costruzione nel primo rilascio.
 */
export const sectionBlock: BlockDefinition = {
  type: 'section',
  v: 1,
  props: {
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
    stylePadding: {
      kind: 'enum',
      required: false,
      responsive: true,
      values: ['none', 'sm', 'md', 'lg'],
      default: { default: 'none' },
    },
    styleBackground: {
      kind: 'enum',
      required: false,
      responsive: true,
      values: ['none', 'subtle', 'accent', 'inverse'],
      default: { default: 'none' },
    },
  },
  children: { allow: ['heading', 'richText', 'image', 'button'] },
  migrations: [],
  enabled: true,
  meta: {
    label: 'Sezione',
    category: 'layout',
    icon: 'layout-board',
    props: {
      styleSpaceBefore: { label: 'Spazio prima', tab: 'style', order: 1 },
      styleSpaceAfter: { label: 'Spazio dopo', tab: 'style', order: 2 },
      stylePadding: { label: 'Spaziatura interna', tab: 'style', order: 3 },
      styleBackground: { label: 'Sfondo', tab: 'style', order: 4 },
    },
  },
};
