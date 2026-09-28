import { BlockDefinition } from '../block-definition.types';
import { migrateContainerV1ToV2 } from '../migrations/migrate-container-v1-to-v2';

/**
 * `container` v2 — contenitore unificato Grid/Flex (ADR-82 § "Decisione"
 * punto 1, `docs/SPEC-propkind-v2.md` § 4.1): sostituisce integralmente il
 * ruolo di `section` come contenitore principale di pagina (ADR-82 §
 * "Contesto"). `container` v1 (`display: 'flex'` soltanto, nessuna prop di
 * stile) resta uno scalino della catena di migrazione
 * (`migrateContainerV1ToV2`, `blocks/migrations/migrate-container-v1-to-v2.ts`),
 * permanente per ADR-21 § 3.5 — non riscritto qui, solo superato da `v: 2`.
 *
 * Tutte le prop sono opzionali (nessun requisito le rende obbligatorie,
 * stesso principio di `container` v1): `children.allow: '*'` invariato,
 * nesting libero incluso `container` dentro `container` (ADR-82 § "Decisione"
 * punto 1, ultimo bullet).
 */
export const containerBlock: BlockDefinition = {
  type: 'container',
  v: 2,
  props: {
    tag: {
      kind: 'enum',
      required: false,
      values: ['div', 'section', 'header', 'footer', 'article', 'aside', 'nav', 'main'],
      default: 'div',
    },
    layout: {
      kind: 'layout',
      required: false,
      responsive: true,
    },
    contentWidth: {
      kind: 'enum',
      required: false,
      values: ['boxed', 'full'],
      default: 'boxed',
    },
    boxedWidth: {
      kind: 'unitValue',
      required: false,
      // Parità Elementor Pro (richiesta esplicita utente 2026-09-23, screenshot del menu
      // unità): `vw` è il quinto relativo a una larghezza — `vh` resta specifico di
      // `minHeight` sotto, non ha senso su una larghezza. `unitValueToCss` (frontend
      // `Container.tsx`/backend `value-to-declarations.ts`) è generico su `${value}${unit}`,
      // nessuna whitelist di rendering da aggiornare per aggiungere unità qui.
      units: ['px', '%', 'em', 'rem', 'vw'],
      min: 0,
      max: 4000,
    },
    // Larghezza del contenitore stesso nel genitore (Elementor "Width", ADR-100 punto 2):
    // colonne 33/67 ecc. dei preset di struttura e maniglia di resize. Responsive: sul mobile
    // i preset scrivono `100%` per impilare le colonne.
    width: {
      kind: 'unitValue',
      required: false,
      responsive: true,
      units: ['px', '%', 'vw'],
      min: 0,
      max: 4000,
    },
    minHeight: {
      kind: 'unitValue',
      required: false,
      // Parità Elementor Pro, stesso principio di `boxedWidth` sopra ma `vh` (relativo
      // all'altezza) al posto di `vw`.
      units: ['px', '%', 'em', 'rem', 'vh'],
      min: 0,
      max: 2000,
    },
    overflow: {
      kind: 'enum',
      required: false,
      values: ['visible', 'hidden', 'auto'],
      default: 'visible',
    },
    background: {
      kind: 'background',
      required: false,
      stateful: true,
    },
    border: {
      kind: 'border',
      required: false,
      stateful: true,
    },
    radius: {
      kind: 'radius',
      required: false,
    },
    shadow: {
      kind: 'shadow',
      required: false,
      stateful: true,
    },
    padding: {
      kind: 'spacing',
      required: false,
      target: 'padding',
      units: ['px', '%', 'em', 'rem'],
      min: 0,
      max: 500,
      responsive: true,
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
    position: {
      kind: 'position',
      required: false,
      responsive: true,
    },
    transform: {
      kind: 'transform',
      required: false,
      stateful: true,
      responsive: true,
    },
    opacity: {
      kind: 'number',
      required: false,
      min: 0,
      max: 1,
    },
    filter: {
      kind: 'filter',
      required: false,
      stateful: true,
      responsive: true,
    },
    link: {
      kind: 'link',
      required: false,
    },
    animation: {
      kind: 'animation',
      required: false,
    },
    motion: {
      kind: 'motion',
      required: false,
    },
    shapeDividerTop: {
      kind: 'shapeDivider',
      required: false,
    },
    shapeDividerBottom: {
      kind: 'shapeDivider',
      required: false,
    },
    htmlId: {
      kind: 'htmlId',
      required: false,
    },
    cssClass: {
      kind: 'cssClassName',
      required: false,
    },
    attributes: {
      kind: 'attributes',
      required: false,
    },
    css: {
      kind: 'css',
      required: false,
      maxLength: 5000,
    },
    hideOn: {
      kind: 'hideOn',
      required: false,
    },
  },
  children: { allow: '*' },
  migrations: [migrateContainerV1ToV2],
  enabled: true,
  meta: {
    label: 'Contenitore',
    category: 'layout',
    icon: 'box-align-top',
    props: {
      tag: { label: 'Tag HTML', tab: 'advanced', order: 1 },
      layout: { label: 'Layout (Flex/Grid)', tab: 'style', order: 2 },
      contentWidth: { label: 'Larghezza contenuto', tab: 'style', order: 3 },
      boxedWidth: { label: 'Larghezza massima', tab: 'style', order: 4 },
      width: { label: 'Larghezza', tab: 'style', order: 5 },
      minHeight: { label: 'Altezza minima', tab: 'style', order: 6 },
      overflow: { label: 'Overflow', tab: 'style', order: 7 },
      background: { label: 'Sfondo', tab: 'style', order: 8 },
      border: { label: 'Bordo', tab: 'style', order: 9 },
      radius: { label: 'Raggio angoli', tab: 'style', order: 10 },
      shadow: { label: 'Ombra', tab: 'style', order: 11 },
      padding: { label: 'Padding', tab: 'style', order: 12 },
      margin: { label: 'Margine', tab: 'style', order: 13 },
      position: { label: 'Posizionamento', tab: 'advanced', order: 14 },
      transform: { label: 'Trasformazione', tab: 'advanced', order: 15 },
      opacity: { label: 'Opacità', tab: 'style', order: 16 },
      filter: { label: 'Filtro', tab: 'style', order: 17 },
      link: { label: 'Link', tab: 'content', order: 18 },
      animation: { label: 'Animazione', tab: 'advanced', order: 19 },
      motion: { label: 'Effetti di scorrimento', tab: 'advanced', order: 20 },
      shapeDividerTop: { label: 'Divisore forma (superiore)', tab: 'style', order: 21 },
      shapeDividerBottom: { label: 'Divisore forma (inferiore)', tab: 'style', order: 22 },
      htmlId: {
        label: 'ID elemento personalizzato',
        tab: 'advanced',
        order: 23,
        help: 'Solo lettere, numeri, trattino, underscore — nessuno spazio.',
      },
      cssClass: {
        label: 'Classe CSS personalizzata',
        tab: 'advanced',
        order: 24,
        help: 'Una o più classi separate da spazio: solo lettere, numeri, trattino, underscore.',
      },
      attributes: { label: 'Attributi HTML personalizzati', tab: 'advanced', order: 25 },
      css: {
        label: 'CSS personalizzato',
        tab: 'advanced',
        order: 26,
        help: 'Sanitizzazione avanzata rimandata ad ADR-78 (non ancora firmata).',
      },
      hideOn: { label: 'Nascondi su breakpoint', tab: 'advanced', order: 27 },
    },
  },
};
