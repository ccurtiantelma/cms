import { BlockDefinition } from '../block-definition.types';

/**
 * `image` — immagine (SPEC-F02-blocchi.md § 3.5). `mediaRef` valida solo la
 * forma del `guid` (16 hex): nessuna verifica di esistenza, la risoluzione è
 * di F09. `alt` è l'unica prop dei cinque tipi con vincolo di non-vuoto
 * (NFR § Accessibilità). Foglia.
 */
export const imageBlock: BlockDefinition = {
  type: 'image',
  v: 1,
  props: {
    mediaRef: {
      kind: 'mediaRef',
      required: true,
    },
    alt: {
      kind: 'plainText',
      required: true,
      nonEmpty: true,
      maxLength: 300,
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
  },
  children: { allow: [] },
  migrations: [],
  enabled: true,
  meta: {
    label: 'Immagine',
    category: 'media',
    icon: 'photo',
    props: {
      mediaRef: { label: 'File', order: 1 },
      alt: { label: 'Testo alternativo', order: 2 },
      styleSpaceBefore: { label: 'Spazio prima', tab: 'style', order: 3 },
      styleSpaceAfter: { label: 'Spazio dopo', tab: 'style', order: 4 },
    },
  },
};
