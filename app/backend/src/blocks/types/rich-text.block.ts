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
    styleFontFamily: {
      kind: 'enum',
      required: false,
      responsive: true,
      values: ['default', 'inter', 'roboto', 'playfair', 'montserrat', 'monospace'],
      default: { default: 'default' },
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
    styleTextColorCustom: {
      kind: 'color',
      required: false,
    },
    styleFontSizeCustom: {
      kind: 'unitValue',
      required: false,
      units: ['px', '%', 'em', 'rem'],
      min: 1,
      max: 200,
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
      styleFontFamily: { label: 'Famiglia Font', tab: 'style', order: 8 },
      styleLayer: { label: 'Livello di sovrapposizione', tab: 'advanced', order: 9 },
      styleHideDesktop: { label: 'Nascondi su Desktop', tab: 'advanced', order: 10 },
      styleHideTablet: { label: 'Nascondi su Tablet', tab: 'advanced', order: 11 },
      styleHideMobile: { label: 'Nascondi su Mobile', tab: 'advanced', order: 12 },
      styleTextColorCustom: {
        label: 'Colore testo personalizzato',
        tab: 'style',
        order: 13,
        help: 'Colore libero (esadecimale). Ha priorità su "Colore testo" se impostato.',
      },
      styleFontSizeCustom: {
        label: 'Dimensione testo personalizzata',
        tab: 'style',
        order: 14,
        help: 'Valore libero con unità. Ha priorità su "Dimensione testo" se impostato.',
      },
      styleBorder: { label: 'Bordo', tab: 'style', order: 15 },
      styleShadow: { label: 'Ombra', tab: 'style', order: 16 },
      customCssClass: {
        label: 'Classe CSS personalizzata',
        tab: 'advanced',
        order: 17,
        help: 'Una o più classi separate da spazio: solo lettere, numeri, trattino, underscore.',
      },
      customElementId: {
        label: 'ID elemento personalizzato',
        tab: 'advanced',
        order: 18,
        help: 'Solo lettere, numeri, trattino, underscore — nessuno spazio.',
      },
    },
  },
};
