import { BlockDefinition } from '../block-definition.types';
import { migrateHeadingV1ToV2 } from '../migrations/migrate-heading-v1-to-v2';

/**
 * `heading` `v: 2` (ADR-81 § "Decisione" punto 1/2, round R1 "parità
 * Elementor Pro"): `styleTextColor`(+`Custom`) → `color: colorRef`,
 * `styleFontSize`(+`Custom`)/`styleFontWeight`/`styleFontFamily` →
 * `typography: typography`, `styleMarginTop/Right/Bottom/Left` →
 * `margin: spacing`, `styleHideDesktop/Tablet/Mobile` → `hideOn`. Le prop v1
 * sostituite spariscono dallo schema (ADR-81 § "Decisione" punto 3): un
 * valore v1 letto passa sempre da `migrateHeadingV1ToV2` prima di raggiungere
 * questo schema (`migrations: [migrateHeadingV1ToV2]`). `level`/`text`
 * invariati. Foglia (`children.allow: []`).
 */
export const headingBlock: BlockDefinition = {
  type: 'heading',
  v: 2,
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
    color: {
      kind: 'colorRef',
      required: false,
      responsive: true,
      stateful: true,
      cssProperty: 'color',
    },
    typography: {
      kind: 'typography',
      required: false,
      responsive: true,
      stateful: true,
    },
    styleLayer: {
      kind: 'enum',
      required: false,
      values: ['base', 'raised', 'overlay', 'top'],
      default: 'base',
    },
    hideOn: {
      kind: 'hideOn',
      required: false,
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
    styleTextAlign: {
      kind: 'enum',
      required: false,
      values: ['left', 'center', 'right', 'justify'],
    },
    margin: {
      kind: 'spacing',
      required: false,
      target: 'margin',
      units: ['px', '%', 'em', 'rem'],
      min: 0,
      max: 500,
      responsive: true,
    },
  },
  children: { allow: [] },
  migrations: [migrateHeadingV1ToV2],
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
      color: { label: 'Colore testo', tab: 'style', order: 5 },
      typography: { label: 'Tipografia', tab: 'style', order: 6 },
      styleLayer: { label: 'Livello di sovrapposizione', tab: 'advanced', order: 9 },
      hideOn: { label: 'Nascondi su breakpoint', tab: 'advanced', order: 10 },
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
      styleTextAlign: {
        label: 'Allineamento testo',
        tab: 'style',
        order: 19,
      },
      margin: { label: 'Margine', tab: 'style', order: 20 },
    },
  },
};
