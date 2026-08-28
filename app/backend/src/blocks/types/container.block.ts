import { BlockDefinition } from '../block-definition.types';

/**
 * `container` — sesto tipo del registro (ADR-39, approvata 2026-08-27):
 * contenitore generico a layout flex, nesting ricorsivo (`children.allow:
 * '*'`, incluso container-in-container). `display` accetta solo `'flex'` in
 * questo round — nessun `'grid'` (ADR-39 § 2 punto 1, emendamento in sede di
 * approvazione): senza `gridTemplateColumns`/`gridTemplateRows` un valore
 * `grid` produrrebbe solo una griglia auto-flow a una colonna implicita, non
 * un layout Grid reale. Nessuna prop di stile (`styleBorder`/`styleShadow`/
 * `styleSpaceBefore`/`styleSpaceAfter`) in questo round — layout puro
 * (ADR-39 § 2, "Alternative scartate"). Spaziatura per lato (padding/margin)
 * aggiunta da ADR-41, il "secondo step" che ADR-39 § 2 aveva rimandato
 * esplicitamente — stessa forma di `section` (ADR-33 § 4).
 */
export const containerBlock: BlockDefinition = {
  type: 'container',
  v: 1,
  props: {
    display: {
      kind: 'enum',
      required: false,
      values: ['flex'],
      default: 'flex',
    },
    flexDirection: {
      kind: 'enum',
      required: false,
      responsive: true,
      values: ['row', 'row-reverse', 'column', 'column-reverse'],
      default: { default: 'row' },
    },
    justifyContent: {
      kind: 'enum',
      required: false,
      responsive: true,
      values: ['flex-start', 'flex-end', 'center', 'space-between', 'space-around', 'space-evenly'],
      default: { default: 'flex-start' },
    },
    alignItems: {
      kind: 'enum',
      required: false,
      responsive: true,
      values: ['stretch', 'flex-start', 'center', 'flex-end'],
      default: { default: 'stretch' },
    },
    wrap: {
      kind: 'enum',
      required: false,
      responsive: true,
      values: ['nowrap', 'wrap'],
      default: { default: 'nowrap' },
    },
    gap: {
      kind: 'enum',
      required: false,
      responsive: true,
      values: ['none', 'sm', 'md', 'lg'],
      default: { default: 'none' },
    },
    styleFlexBasis: {
      kind: 'unitValue',
      required: false,
      units: ['%'],
      min: 0,
      max: 100,
    },
    styleBackgroundColor: { kind: 'color', required: false },
    styleColor: { kind: 'color', required: false },
    backgroundColor: { kind: 'color', required: false },
    color: { kind: 'color', required: false },
    stylePaddingTop: {
      kind: 'enum',
      required: false,
      responsive: true,
      values: ['0', '4', '8', '12', '16', '24', '32', '48', '64', '96'],
      default: { default: '0' },
    },
    stylePaddingRight: {
      kind: 'enum',
      required: false,
      responsive: true,
      values: ['0', '4', '8', '12', '16', '24', '32', '48', '64', '96'],
      default: { default: '0' },
    },
    stylePaddingBottom: {
      kind: 'enum',
      required: false,
      responsive: true,
      values: ['0', '4', '8', '12', '16', '24', '32', '48', '64', '96'],
      default: { default: '0' },
    },
    stylePaddingLeft: {
      kind: 'enum',
      required: false,
      responsive: true,
      values: ['0', '4', '8', '12', '16', '24', '32', '48', '64', '96'],
      default: { default: '0' },
    },
    styleMarginTop: {
      kind: 'enum',
      required: false,
      responsive: true,
      values: ['0', '4', '8', '12', '16', '24', '32', '48', '64', '96'],
      default: { default: '0' },
    },
    styleMarginRight: {
      kind: 'enum',
      required: false,
      responsive: true,
      values: ['0', '4', '8', '12', '16', '24', '32', '48', '64', '96'],
      default: { default: '0' },
    },
    styleMarginBottom: {
      kind: 'enum',
      required: false,
      responsive: true,
      values: ['0', '4', '8', '12', '16', '24', '32', '48', '64', '96'],
      default: { default: '0' },
    },
    styleMarginLeft: {
      kind: 'enum',
      required: false,
      responsive: true,
      values: ['0', '4', '8', '12', '16', '24', '32', '48', '64', '96'],
      default: { default: '0' },
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
  children: { allow: '*' },
  migrations: [],
  enabled: true,
  meta: {
    label: 'Contenitore',
    category: 'layout',
    icon: 'box-align-top',
    props: {
      display: { label: 'Layout', tab: 'style', order: 1 },
      flexDirection: { label: 'Direzione', tab: 'style', order: 2 },
      justifyContent: { label: 'Allineamento orizzontale', tab: 'style', order: 3 },
      alignItems: { label: 'Allineamento verticale', tab: 'style', order: 4 },
      wrap: { label: 'A capo', tab: 'style', order: 5 },
      gap: { label: 'Spaziatura', tab: 'style', order: 6 },
      styleFlexBasis: { label: 'Larghezza', tab: 'style', order: 7 },
      styleBackgroundColor: { label: 'Colore di sfondo', tab: 'style', order: 12 },
      styleColor: { label: 'Colore testo', tab: 'style', order: 13 },
      backgroundColor: { label: 'Colore di sfondo (fallback)', tab: 'style', order: 14 },
      color: { label: 'Colore testo (fallback)', tab: 'style', order: 15 },
      stylePaddingTop: { label: 'Padding superiore', tab: 'style', order: 8 },
      stylePaddingRight: { label: 'Padding destro', tab: 'style', order: 9 },
      stylePaddingBottom: { label: 'Padding inferiore', tab: 'style', order: 10 },
      stylePaddingLeft: { label: 'Padding sinistro', tab: 'style', order: 11 },
      styleMarginTop: { label: 'Margine superiore', tab: 'style', order: 12 },
      styleMarginRight: { label: 'Margine destro', tab: 'style', order: 13 },
      styleMarginBottom: { label: 'Margine inferiore', tab: 'style', order: 14 },
      styleMarginLeft: { label: 'Margine sinistro', tab: 'style', order: 15 },
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
