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
    styleLayer: {
      kind: 'enum',
      required: false,
      values: ['base', 'raised', 'overlay', 'top'],
      default: 'base',
    },
    styleHideDesktop: {
      kind: 'boolean',
      required: false,
      default: false,
    },
    styleHideTablet: {
      kind: 'boolean',
      required: false,
      default: false,
    },
    styleHideMobile: {
      kind: 'boolean',
      required: false,
      default: false,
    },
    styleBorder: {
      kind: 'border',
      required: false,
    },
    styleShadow: {
      kind: 'shadow',
      required: false,
    },
    customCssClass: {
      kind: 'cssClassName',
      required: false,
    },
    customElementId: {
      kind: 'htmlId',
      required: false,
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
      styleLayer: { label: 'Livello di sovrapposizione', tab: 'advanced', order: 5 },
      styleHideDesktop: { label: 'Nascondi su Desktop', tab: 'advanced', order: 6 },
      styleHideTablet: { label: 'Nascondi su Tablet', tab: 'advanced', order: 7 },
      styleHideMobile: { label: 'Nascondi su Mobile', tab: 'advanced', order: 8 },
      styleBorder: { label: 'Bordo', tab: 'style', order: 9 },
      styleShadow: { label: 'Ombra', tab: 'style', order: 10 },
      customCssClass: {
        label: 'Classe CSS personalizzata',
        tab: 'advanced',
        order: 11,
        help: 'Una o più classi separate da spazio: solo lettere, numeri, trattino, underscore.',
      },
      customElementId: {
        label: 'ID elemento personalizzato',
        tab: 'advanced',
        order: 12,
        help: 'Solo lettere, numeri, trattino, underscore — nessuno spazio.',
      },
    },
  },
};
