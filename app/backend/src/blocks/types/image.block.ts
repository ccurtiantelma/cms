import { BlockDefinition } from '../block-definition.types';
import { migrateImageV1ToV2 } from '../migrations/migrate-image-v1-to-v2';

/**
 * `image` `v: 2` (ADR-81 § "Decisione" punto 1/2): `styleMarginTop/Right/
 * Bottom/Left` → `margin: spacing`, `styleHideDesktop/Tablet/Mobile` →
 * `hideOn`. `image` non ha mai dichiarato `styleTextColor`/`styleFontSize`/
 * `Weight`/`Family` (tabella di ADR-81 § "Decisione" punto 2 non la elenca
 * per quella riga): nessun `color`/`typography` qui. `mediaRef`/`alt`/
 * `styleSizePreset`/`styleWidth`/`styleHeight`/`styleObjectFit`/`styleAlign`
 * (ADR-58) invariati. Foglia (`children.allow: []`).
 */
export const imageBlock: BlockDefinition = {
  type: 'image',
  v: 2,
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
    styleSizePreset: {
      kind: 'enum',
      required: false,
      values: ['thumbnail', 'card', 'hero', 'og', 'full', 'custom'],
      default: 'full',
    },
    styleWidth: {
      kind: 'unitValue',
      required: false,
      units: ['px', '%', 'vw'],
      min: 0,
      max: 3840,
    },
    styleHeight: {
      kind: 'unitValue',
      required: false,
      units: ['px', '%', 'vh'],
      min: 0,
      max: 2160,
    },
    styleObjectFit: {
      kind: 'enum',
      required: false,
      values: ['cover', 'contain', 'fill', 'none'],
      default: 'cover',
    },
    styleAlign: {
      kind: 'enum',
      required: false,
      values: ['left', 'center', 'right'],
      default: 'left',
    },
    customCssClass: {
      kind: 'cssClassName',
      required: false,
    },
    customElementId: {
      kind: 'htmlId',
      required: false,
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
  migrations: [migrateImageV1ToV2],
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
      hideOn: { label: 'Nascondi su breakpoint', tab: 'advanced', order: 6 },
      styleBorder: { label: 'Bordo', tab: 'style', order: 9 },
      styleShadow: { label: 'Ombra', tab: 'style', order: 10 },
      styleSizePreset: { label: 'Formato predefinito', tab: 'style', order: 11 },
      styleWidth: { label: 'Larghezza personalizzata', tab: 'style', order: 12 },
      styleHeight: { label: 'Altezza personalizzata', tab: 'style', order: 13 },
      styleObjectFit: { label: 'Adattamento immagine', tab: 'style', order: 14 },
      styleAlign: { label: 'Allineamento', tab: 'style', order: 15 },
      customCssClass: {
        label: 'Classe CSS personalizzata',
        tab: 'advanced',
        order: 16,
        help: 'Una o più classi separate da spazio: solo lettere, numeri, trattino, underscore.',
      },
      customElementId: {
        label: 'ID elemento personalizzato',
        tab: 'advanced',
        order: 17,
        help: 'Solo lettere, numeri, trattino, underscore — nessuno spazio.',
      },
      margin: { label: 'Margine', tab: 'style', order: 18 },
    },
  },
};
