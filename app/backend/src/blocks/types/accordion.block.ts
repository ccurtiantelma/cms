import { BlockDefinition } from '../block-definition.types';

/**
 * `accordion` — tredicesimo tipo del registro (ADR-57 § Decisione punto 1/2):
 * contenitore dedicato, ammette solo `accordionItem` come figlio diretto,
 * stessa composizione a `children` (non a prop-array) già usata da
 * `navMenu`/`navMenuItem` (ADR-52 § 1) e `form`/`form-field` (ADR-46 § 1).
 * Ammesso a `ROOT_ALLOWED` e a `section.children.allow` (ADR-57 § 3): può
 * comporre direttamente una Pagina o una Sezione (stesso trattamento di
 * `navMenu`/`tabs`/`carousel`/`modalTrigger`).
 *
 * `exclusive` (booleano, default `false`): quando `true` il renderer
 * CSS-only applica un attributo `name` condiviso a tutti gli `accordionItem`
 * figli (`<details name>` nativo), così solo un pannello resta aperto alla
 * volta — degrado esplicito ad apertura multipla sui browser senza supporto
 * (ADR-57 § 4). Nessuna verifica cross-nodo qui: il registro dichiara solo
 * la prop, la semantica `name` condiviso è responsabilità del renderer
 * (`app/public-site`), non della validazione (ADR-57 § Conseguenze).
 */
export const accordionBlock: BlockDefinition = {
  type: 'accordion',
  v: 1,
  props: {
    exclusive: {
      kind: 'boolean',
      required: false,
      default: false,
    },
  },
  children: { allow: ['accordionItem'] },
  migrations: [],
  enabled: true,
  meta: {
    label: 'Accordion',
    category: 'interattivo',
    icon: 'list-details',
    props: {
      exclusive: {
        label: 'Apertura esclusiva',
        order: 1,
        help: 'Se attivo, aprire una voce chiude automaticamente le altre (comportamento CSS-only, degrada su browser molto datati).',
      },
    },
  },
};
