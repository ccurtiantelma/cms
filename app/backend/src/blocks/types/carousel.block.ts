import { BlockDefinition } from '../block-definition.types';

/**
 * `carousel` — diciassettesimo tipo del registro (ADR-57 § Decisione punto
 * 1/2): contenitore dedicato, ammette solo `carouselSlide` come figlio
 * diretto. Ammesso a `ROOT_ALLOWED` e a `section.children.allow`
 * (ADR-57 § 3), stesso trattamento di `accordion`/`tabs`/`modalTrigger`.
 *
 * `autoplay` (booleano, default `false`) e `transition`
 * (`'manual-scroll'|'fade-loop'|'slide-loop'`, default `'manual-scroll'`):
 * `manual-scroll` è `scroll-snap` + ancore `#slide-N` con drag nativo,
 * nessuna animazione; `fade-loop`/`slide-loop` sono `@keyframes` opzionali,
 * durata fissa uguale per slide, unica pausa `:hover`/`:focus-within`.
 * `autoplay:true` con `transition:'manual-scroll'` è un **no-op silenzioso
 * del renderer**, non un errore di validazione — stessa natura di
 * precedenza a valle già accettata per `url`/`pageGuid` in `navMenuItem`
 * (ADR-52 § 2, richiamata da ADR-57 § 4/§ "Alternative scartate"): nessuna
 * regola di validazione cross-prop introdotta qui.
 */
export const carouselBlock: BlockDefinition = {
  type: 'carousel',
  v: 1,
  props: {
    autoplay: {
      kind: 'boolean',
      required: false,
      default: false,
    },
    transition: {
      kind: 'enum',
      required: false,
      values: ['manual-scroll', 'fade-loop', 'slide-loop'],
      default: 'manual-scroll',
    },
  },
  children: { allow: ['carouselSlide'] },
  migrations: [],
  enabled: true,
  meta: {
    label: 'Carousel',
    category: 'interattivo',
    icon: 'carousel-horizontal',
    props: {
      autoplay: {
        label: 'Avvio automatico',
        order: 1,
        help: "Nessun effetto se la transizione è impostata su 'Scorrimento manuale' (no-op silenzioso, ADR-57 § 4).",
      },
      transition: { label: 'Transizione', order: 2 },
    },
  },
};
