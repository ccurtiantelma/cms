import { BlockDefinition } from '../block-definition.types';
import { migrateRichTextV1ToV2 } from '../migrations/migrate-rich-text-v1-to-v2';

/**
 * `richText` `v: 2` (ADR-81 § "Decisione" punto 1/2): stessa tabella di
 * `heading` (`color`, `typography`, `margin`, `hideOn`). Le quattro prop
 * "fallback" `styleBackgroundColor`/`styleColor`/`backgroundColor`/`color`
 * (kind `color`, mai menzionate da alcuna ADR firmata) sono rimosse in
 * questo bump: scelta di design di questo Sub-Task, segnalata nel resoconto
 * finale (`migrate-rich-text-v1-to-v2.ts` per i dettagli). `html` invariato.
 * Foglia (`children.allow: []`).
 */
export const richTextBlock: BlockDefinition = {
  type: 'richText',
  v: 2,
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
  migrations: [migrateRichTextV1ToV2],
  enabled: true,
  meta: {
    label: 'Testo',
    category: 'testo',
    icon: 'align-left',
    props: {
      html: { label: 'Contenuto', order: 1 },
      styleSpaceBefore: { label: 'Spazio prima', tab: 'style', order: 2 },
      styleSpaceAfter: { label: 'Spazio dopo', tab: 'style', order: 3 },
      color: { label: 'Colore testo', tab: 'style', order: 4 },
      typography: { label: 'Tipografia', tab: 'style', order: 5 },
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
      margin: { label: 'Margine', tab: 'style', order: 19 },
    },
  },
};
