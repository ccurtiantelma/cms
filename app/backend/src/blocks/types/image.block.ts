import { BlockDefinition } from '../block-definition.types';

/**
 * `image` — immagine (SPEC-F02-blocchi.md § 3.5). `mediaRef` valida solo la
 * forma del `guid` (16 hex): nessuna verifica di esistenza, la risoluzione è
 * di F09. `alt` è l'unica prop dei cinque tipi con vincolo di non-vuoto
 * (NFR § Accessibilità). Foglia.
 *
 * `styleSizePreset`/`styleWidth`/`styleHeight`/`styleObjectFit`/`styleAlign`
 * (ADR-58): cinque prop opzionali e additive, nessun bump di `v` (stesso
 * principio di ADR-47). `styleSizePreset` riusa i quattro nomi di
 * `MediaTransformPreset` (`app/backend/src/files/dto/media-transform.dto.ts`,
 * ADR-49) più `full` (originale non trasformato, comportamento attuale
 * invariato, default) e `custom` (larghezza/altezza libere sotto). Nessun
 * `kind` nuovo: tutte e cinque riusano `enum`/`unitValue` già chiusi da
 * ADR-21/ADR-38. Nessuna logica cross-prop qui — il validator non ha
 * condizionali fra prop, la convenzione "`styleWidth`/`styleHeight` solo con
 * `styleSizePreset='custom'`" è responsabilità dell'editor.
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
    },
  },
};
