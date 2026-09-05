import { BlockDefinition } from '../block-definition.types';

/**
 * `carouselSlide` — diciottesimo tipo del registro (ADR-57 § Decisione
 * punto 1/2): una singola slide dentro un `carousel`. Non in `ROOT_ALLOWED`
 * (stesso trattamento di `navMenuItem`/`accordionItem`/`tabPanel`): una
 * slide isolata senza il proprio `carousel` non ha senso CSS-only (nessun
 * contenitore `scroll-snap`/ancore `#slide-N` che la ospiti).
 *
 * Nessuna prop propria: immagine/didascalia sono `children` (un `image` + un
 * `richText`), non prop dedicate — decisione esplicita di ADR-57 § 2 contro
 * un contenuto di seconda classe. `children.allow` limitato per v1 a
 * `['heading','richText','image','button','container']`, stesso principio
 * di `accordionItem`/`tabPanel` (ADR-57 § 2): mai un altro widget
 * interattivo di questo gruppo annidato.
 */
export const carouselSlideBlock: BlockDefinition = {
  type: 'carouselSlide',
  v: 1,
  props: {},
  children: { allow: ['heading', 'richText', 'image', 'button', 'container'] },
  migrations: [],
  enabled: true,
  meta: {
    label: 'Slide carousel',
    category: 'interattivo',
    icon: 'photo',
  },
};
