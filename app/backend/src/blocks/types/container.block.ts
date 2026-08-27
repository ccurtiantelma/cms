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
 * (ADR-39 § 2, "Alternative scartate").
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
      customCssClass: {
        label: 'Classe CSS personalizzata',
        tab: 'advanced',
        order: 7,
        help: 'Una o più classi separate da spazio: solo lettere, numeri, trattino, underscore.',
      },
      customElementId: {
        label: 'ID elemento personalizzato',
        tab: 'advanced',
        order: 8,
        help: 'Solo lettere, numeri, trattino, underscore — nessuno spazio.',
      },
    },
  },
};
