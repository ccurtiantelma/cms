/**
 * Slide di carousel (`carouselSlide`, ADR-57 § 2): fuori `ROOT_ALLOWED`. Nessuna prop propria
 * dichiarata dal registro (immagine/didascalia sono `children`, non prop dedicate).
 *
 * `id="slide-{slideId}"` (ADR-57 § 4, "ancore #slide-N"): àncora HTML nativa, navigabile da
 * qualunque link `href="#slide-{id}"` interno o esterno alla pagina — nessun markup di
 * navigazione (frecce/dots) generato qui: la sola ancora già soddisfa "manual-scroll" per
 * `transition:'manual-scroll'` (scorrimento nativo + deep link).
 *
 * `transition` (calcolata da `BlockRenderer.tsx`, vedi {@link resolveCarouselTransition} in
 * `CarouselBlock.tsx`) governa solo l'animazione di loop: `fade-loop`/`slide-loop`
 * impilano le slide (`position: absolute`) e applicano un `@keyframes` con durata fissa per
 * slide (`LOOP_SEGMENT_SECONDS`) e ritardo negativo proporzionale a `index`, cosi il ciclo
 * appare già in corso dal primo render invece che partire "vuoto" fino al turno della prima
 * slide. `manual-scroll` non applica alcuna classe di animazione: `autoplay:true` con questa
 * transizione resta un no-op silenzioso (ADR-57 § 4), verificato in `CarouselBlock.test.tsx`/
 * `CarouselSlideBlock.test.tsx`.
 *
 * Zero JavaScript, zero stato React. Nessuna dipendenza Mantine (CLAUDE.md § confine
 * Mantine/blocchi).
 */
import type { CSSProperties, ReactNode } from 'react';
import styles from './CarouselSlideBlock.module.css';
import type { CarouselEffectiveTransition } from './CarouselBlock';

/** Durata fissa (ADR-57 § 4, "durata fissa uguale per slide") di ciascun segmento del ciclo di loop, in secondi. */
export const LOOP_SEGMENT_SECONDS = 4;

interface CarouselSlideBlockProps {
  slideId: string;
  transition: CarouselEffectiveTransition;
  /** Posizione fra le slide fratelle (0-based): determina il ritardo di fase dell'animazione di loop. */
  index: number;
  /** Numero totale di slide fratelle: determina la durata totale del ciclo. */
  count: number;
  children?: ReactNode;
}

export default function CarouselSlideBlock({
  slideId,
  transition,
  index,
  count,
  children,
}: CarouselSlideBlockProps) {
  const isLooping = transition === 'fade-loop' || transition === 'slide-loop';
  const className = [
    styles.slide,
    transition === 'fade-loop' ? styles.fade : '',
    transition === 'slide-loop' ? styles.slideLoop : '',
  ]
    .filter(Boolean)
    .join(' ');
  const style: CSSProperties | undefined =
    isLooping && count > 0
      ? {
          animationDuration: `${count * LOOP_SEGMENT_SECONDS}s`,
          animationDelay: `${-(index * LOOP_SEGMENT_SECONDS)}s`,
        }
      : undefined;

  return (
    <div id={`slide-${slideId}`} className={className} style={style}>
      {children}
    </div>
  );
}
