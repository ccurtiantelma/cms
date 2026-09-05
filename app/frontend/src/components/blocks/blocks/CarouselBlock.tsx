/**
 * Blocco `carousel` (ADR-57 § 2): contenitore CSS-only, `children.allow: ['carouselSlide']`,
 * prop `autoplay`/`transition` (registro). Wrapper puro — la classe di transizione effettiva
 * (mai la sola prop `transition` grezza, vedi {@link resolveCarouselTransition}) è calcolata
 * da `BlockRenderer.tsx` (case `'carousel'`) e passata sia qui sia a ciascun
 * `CarouselSlideBlock` figlio, mai ricalcolata due volte.
 *
 * `manual-scroll` (default, ADR-57 § 4): `scroll-snap-type` + scorrimento nativo (drag/swipe/
 * rotellina), ogni slide con un'ancora `#slide-{id}` (`CarouselSlideBlock.tsx`) — nessun
 * markup aggiuntivo qui, la navigabilità via ancora è già completa a livello di singola
 * slide. `fade-loop`/`slide-loop`: le slide si impilano (`position: relative` su questo
 * contenitore, `position: absolute` sulle slide, CarouselSlideBlock.module.css) e il loop è
 * un `@keyframes` con pausa unica su `:hover`/`:focus-within` (selettore in
 * `CarouselSlideBlock.module.css`, guidato dall'attributo `data-transition` di questo
 * elemento). Zero JavaScript, zero stato React. Nessuna dipendenza Mantine (CLAUDE.md §
 * confine Mantine/blocchi).
 */
import type { ReactNode } from 'react';
import styles from './CarouselBlock.module.css';

/**
 * Transizione effettiva del carousel (ADR-57 § 4): **non** la prop grezza `transition` del
 * registro — `autoplay:false` riporta sempre a `'manual-scroll'` a prescindere da
 * `transition`, e `autoplay:true` con `transition:'manual-scroll'` resta `'manual-scroll'`
 * (no-op silenzioso esplicito dell'ADR). Sola `autoplay:true` **e** `transition` su un valore
 * di loop attiva davvero l'animazione — interpretazione dichiarata qui perché il testo
 * dell'ADR non specifica letteralmente il comportamento di `transition:'fade-loop'` con
 * `autoplay:false`: si è scelto di trattare `autoplay` come interruttore generale
 * dell'animazione e `transition` come "stile" applicato solo quando l'interruttore è acceso,
 * cosi nessuna delle due prop resta senza effetto proprio in nessuna combinazione.
 */
export type CarouselEffectiveTransition = 'manual-scroll' | 'fade-loop' | 'slide-loop';

/** Vedi il commento di {@link CarouselEffectiveTransition}. Unico punto di calcolo, riusato da `BlockRenderer.tsx`. */
export function resolveCarouselTransition(autoplay: unknown, transition: unknown): CarouselEffectiveTransition {
  if (autoplay !== true) return 'manual-scroll';
  return transition === 'fade-loop' || transition === 'slide-loop' ? transition : 'manual-scroll';
}

interface CarouselBlockProps {
  transition: CarouselEffectiveTransition;
  children?: ReactNode;
}

export default function CarouselBlock({ transition, children }: CarouselBlockProps) {
  const className = [
    styles.carousel,
    transition === 'fade-loop' ? styles.fadeLoop : '',
    transition === 'slide-loop' ? styles.slideLoop : '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <div className={className} data-transition={transition}>
      {children}
    </div>
  );
}
