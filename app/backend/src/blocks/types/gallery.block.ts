import { BlockDefinition } from '../block-definition.types';

/**
 * `gallery` — ventesimo tipo del registro (`PLAN-parita-elementor-pro.md` §
 * R4 "Widget base CSS-only": «`gallery` (grid/masonry CSS, lightbox R5)»).
 * `children.allow: ['image']`, **nessun tipo-figlio dedicato** (a differenza
 * di `carousel`/`carouselSlide`, ADR-57 § 2): una voce di galleria non ha
 * chrome propria oltre l'immagine stessa (nessuna didascalia/azione di
 * seconda classe da ospitare), quindi non serve un contenitore intermedio —
 * `image` è già un figlio del registro con le proprie prop (`mediaRef`,
 * `alt`, …).
 *
 * `layout` riusa **identico** `kind: 'layout'` di `container` v2 (ADR-82 §
 * "Decisione" punto 1, `docs/SPEC-propkind-v2.md` § 4.1) per colonne
 * (`gridTemplateColumns`) e spaziatura (`gap.x`/`gap.y`): nessun campo
 * `columns` separato, stessa semantica di griglia CSS già validata per
 * `container`. `galleryMode` è l'algoritmo di disposizione *sopra* quella
 * griglia di base (`grid` = celle uniformi, `masonry`/`metro` = varianti di
 * disposizione a runtime) — un asse ortogonale a `layout`, non un suo
 * sostituto.
 *
 * `lightbox` (booleano) è **CSS-only in questo round**: persistito, non
 * ancora renderizzato — il runtime JS che lo onora è R5 (`PLAN-parita-
 * elementor-pro.md` § R4/R5), non ancora esistente. Nessun rendering
 * pubblico è responsabilità di questo modulo backend (l'API restituisce
 * dati, mai HTML).
 */
export const galleryBlock: BlockDefinition = {
  type: 'gallery',
  v: 1,
  props: {
    layout: {
      kind: 'layout',
      required: false,
      responsive: true,
    },
    galleryMode: {
      kind: 'enum',
      required: false,
      values: ['grid', 'masonry', 'metro'],
      default: 'grid',
    },
    lightbox: {
      kind: 'boolean',
      required: false,
      default: false,
    },
    hideOn: {
      kind: 'hideOn',
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
  children: { allow: ['image'] },
  migrations: [],
  enabled: true,
  meta: {
    label: 'Galleria',
    category: 'media',
    icon: 'layout-grid',
    props: {
      layout: { label: 'Layout (colonne/spaziatura)', tab: 'style', order: 1 },
      galleryMode: {
        label: 'Modalità',
        tab: 'style',
        order: 2,
        help: 'Algoritmo di disposizione sopra la griglia base: grid (celle uniformi), masonry, metro.',
      },
      lightbox: {
        label: 'Lightbox',
        tab: 'advanced',
        order: 3,
        help: 'Solo persistito in questo round: nessun runtime JS lo onora ancora (R5, PLAN-parita-elementor-pro.md § R4/R5).',
      },
      hideOn: { label: 'Nascondi su breakpoint', tab: 'advanced', order: 4 },
      customCssClass: {
        label: 'Classe CSS personalizzata',
        tab: 'advanced',
        order: 5,
        help: 'Una o più classi separate da spazio: solo lettere, numeri, trattino, underscore.',
      },
      customElementId: {
        label: 'ID elemento personalizzato',
        tab: 'advanced',
        order: 6,
        help: 'Solo lettere, numeri, trattino, underscore — nessuno spazio.',
      },
    },
  },
};
