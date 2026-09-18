import { BlockDefinition } from '../block-definition.types';
import { migrateButtonV1ToV2 } from '../migrations/migrate-button-v1-to-v2';

/**
 * `button` `v: 2` (ADR-81 § "Decisione" punto 1/2): `href: url` →
 * `link: link` (ancora obbligatoria, stesso principio di `href` v1), più la
 * stessa tabella `color`/`typography`/`margin`/`hideOn` di `heading`/
 * `richText`. Le quattro prop "fallback" `styleBackgroundColor`/`styleColor`/
 * `backgroundColor`/`color` sono rimosse (stesso motivo di `richText`,
 * `migrate-button-v1-to-v2.ts`). `label` invariata. Foglia.
 */
export const buttonBlock: BlockDefinition = {
  type: 'button',
  v: 2,
  props: {
    label: {
      kind: 'plainText',
      required: true,
      maxLength: 80,
    },
    link: {
      kind: 'link',
      required: true,
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
    margin: {
      kind: 'spacing',
      required: false,
      target: 'margin',
      units: ['px', '%', 'em', 'rem'],
      min: 0,
      max: 500,
      responsive: true,
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
  migrations: [migrateButtonV1ToV2],
  enabled: true,
  meta: {
    label: 'Pulsante',
    category: 'azione',
    icon: 'hand-click',
    props: {
      label: { label: 'Etichetta', order: 1 },
      link: { label: 'Link', order: 2 },
      styleSpaceBefore: { label: 'Spazio prima', tab: 'style', order: 3 },
      styleSpaceAfter: { label: 'Spazio dopo', tab: 'style', order: 4 },
      color: { label: 'Colore testo', tab: 'style', order: 5 },
      typography: { label: 'Tipografia', tab: 'style', order: 6 },
      styleLayer: { label: 'Livello di sovrapposizione', tab: 'advanced', order: 9 },
      hideOn: { label: 'Nascondi su breakpoint', tab: 'advanced', order: 10 },
      margin: { label: 'Margine', tab: 'style', order: 15 },
      customCssClass: {
        label: 'Classe CSS personalizzata',
        tab: 'advanced',
        order: 13,
        help: 'Una o più classi separate da spazio: solo lettere, numeri, trattino, underscore.',
      },
      customElementId: {
        label: 'ID elemento personalizzato',
        tab: 'advanced',
        order: 14,
        help: 'Solo lettere, numeri, trattino, underscore — nessuno spazio.',
      },
    },
  },
};
