/**
 * `carouselSlide` (ADR-57 § 2): foglia del contenitore `carousel`. Suite dedicata al
 * componente isolato — la propagazione di `transition`/`index`/`count` dall'intero gruppo di
 * fratelli è coperta in `CarouselBlock.test.tsx` (dispatch di `BlockRenderer`).
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import CarouselSlideBlock, { LOOP_SEGMENT_SECONDS } from './CarouselSlideBlock';

describe('CarouselSlideBlock', () => {
  it("id dell'ancora è `slide-{slideId}`, navigabile via `#slide-{id}`", () => {
    const { container } = render(
      <CarouselSlideBlock slideId="abc123" transition="manual-scroll" index={0} count={1}>
        Contenuto
      </CarouselSlideBlock>,
    );

    expect(container.querySelector('#slide-abc123')).toBeInTheDocument();
  });

  it("transition:'manual-scroll' → nessuno stile inline di animazione", () => {
    const { container } = render(
      <CarouselSlideBlock slideId="s-1" transition="manual-scroll" index={0} count={3}>
        Contenuto
      </CarouselSlideBlock>,
    );

    const slide = container.querySelector('#slide-s-1') as HTMLElement;
    expect(slide.getAttribute('style')).toBeNull();
  });

  it("transition:'fade-loop' → durata proporzionale al numero di slide, ritardo negativo proporzionale all'indice", () => {
    const { container } = render(
      <CarouselSlideBlock slideId="s-2" transition="fade-loop" index={2} count={4}>
        Contenuto
      </CarouselSlideBlock>,
    );

    const slide = container.querySelector('#slide-s-2') as HTMLElement;
    expect(slide.style.animationDuration).toBe(`${4 * LOOP_SEGMENT_SECONDS}s`);
    expect(slide.style.animationDelay).toBe(`${-(2 * LOOP_SEGMENT_SECONDS)}s`);
  });

  it("transition:'slide-loop' → stessa logica di durata/ritardo di 'fade-loop'", () => {
    const { container } = render(
      <CarouselSlideBlock slideId="s-3" transition="slide-loop" index={1} count={2}>
        Contenuto
      </CarouselSlideBlock>,
    );

    const slide = container.querySelector('#slide-s-3') as HTMLElement;
    expect(slide.style.animationDuration).toBe(`${2 * LOOP_SEGMENT_SECONDS}s`);
    expect(slide.style.animationDelay).toBe(`${-(1 * LOOP_SEGMENT_SECONDS)}s`);
  });
});
