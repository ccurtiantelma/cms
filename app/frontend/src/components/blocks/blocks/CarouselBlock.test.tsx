/**
 * `carousel` (ADR-57 § 2/§ 4): CSS-only, `manual-scroll` (scroll-snap + ancore `#slide-N`)
 * di default, `fade-loop`/`slide-loop` opzionali via `@keyframes`. Copertura minima di
 * PLAN-widget-interattivi-enterprise.md T6: `transition:'manual-scroll'` non emette classi di
 * animazione anche con `autoplay:true` (no-op silenzioso, mai un errore). Verificato sia su
 * `resolveCarouselTransition` (funzione pura) sia sul dispatch di `BlockRenderer.tsx` (case
 * `'carousel'`).
 */
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import CarouselBlock, { resolveCarouselTransition } from './CarouselBlock';
import CarouselSlideBlock from './CarouselSlideBlock';
import BlockRenderer from '../BlockRenderer';
import type { RenderableBlockNode } from '../types';

const SOURCE_PATHS = [
  path.resolve(process.cwd(), 'src/components/blocks/blocks/CarouselBlock.tsx'),
  path.resolve(process.cwd(), 'src/components/blocks/blocks/CarouselSlideBlock.tsx'),
];

describe('CarouselBlock/CarouselSlideBlock — CSS-only, zero JavaScript (ADR-57 § 4)', () => {
  it('nessuna dipendenza Mantine, nessun handler React, nessuno stato React nel sorgente', () => {
    for (const sourcePath of SOURCE_PATHS) {
      const source = readFileSync(sourcePath, 'utf-8');
      expect(source).not.toMatch(/@mantine\//);
      expect(source).not.toMatch(/onClick/);
      expect(source).not.toMatch(/useState/);
      expect(source).not.toMatch(/useEffect/);
    }
  });

  it('renderToStaticMarkup (percorso SSR condiviso, ADR-22) non lancia', () => {
    expect(() =>
      renderToStaticMarkup(
        <CarouselBlock transition="manual-scroll">
          <CarouselSlideBlock slideId="s-1" transition="manual-scroll" index={0} count={1}>
            Slide 1
          </CarouselSlideBlock>
        </CarouselBlock>,
      ),
    ).not.toThrow();
  });
});

describe('resolveCarouselTransition — no-op silenzioso di autoplay+manual-scroll (ADR-57 § 4)', () => {
  it("autoplay:false → sempre 'manual-scroll', qualunque sia transition", () => {
    expect(resolveCarouselTransition(false, 'fade-loop')).toBe('manual-scroll');
    expect(resolveCarouselTransition(false, 'slide-loop')).toBe('manual-scroll');
    expect(resolveCarouselTransition(false, 'manual-scroll')).toBe('manual-scroll');
  });

  it("autoplay:true con transition:'manual-scroll' → resta 'manual-scroll' (no-op, non un errore)", () => {
    expect(resolveCarouselTransition(true, 'manual-scroll')).toBe('manual-scroll');
  });

  it("autoplay:true con transition:'fade-loop'/'slide-loop' → l'animazione richiesta è attiva", () => {
    expect(resolveCarouselTransition(true, 'fade-loop')).toBe('fade-loop');
    expect(resolveCarouselTransition(true, 'slide-loop')).toBe('slide-loop');
  });

  it('un valore di transition non riconosciuto ricade su manual-scroll, mai un crash', () => {
    expect(resolveCarouselTransition(true, 'qualcosa-di-invalido')).toBe('manual-scroll');
  });
});

describe('BlockRenderer — dispatch del case "carousel" (ADR-57 § 2/§ 4)', () => {
  function carouselNode(props: Record<string, unknown>): RenderableBlockNode {
    return {
      id: 'car-1',
      type: 'carousel',
      props,
      children: [
        { id: 'slide-1', type: 'carouselSlide', props: {}, children: [] },
        { id: 'slide-2', type: 'carouselSlide', props: {}, children: [] },
      ],
    };
  }

  it("transition:'manual-scroll' con autoplay:true non emette alcuna classe di animazione (no-op verificato)", () => {
    const { container } = render(
      <BlockRenderer node={carouselNode({ autoplay: true, transition: 'manual-scroll' })} />,
    );

    const root = container.querySelector('[data-transition]');
    expect(root).toHaveAttribute('data-transition', 'manual-scroll');
    // Nessuna classe generata da `CarouselBlock`/`CarouselSlideBlock` per fade/slide loop:
    // il markup contiene solo le classi CSS Modules base (hash incluso), verificabile
    // guardando che nessuna slide riceva uno stile inline di animazione (solo `fade-loop`/
    // `slide-loop` lo applicano, vedi test sotto).
    for (const slide of container.querySelectorAll('[id^="slide-"]')) {
      expect((slide as HTMLElement).style.animationDuration).toBe('');
      expect((slide as HTMLElement).style.animationDelay).toBe('');
    }
  });

  it("transition:'fade-loop' con autoplay:true applica un ritardo di animazione diverso per slide", () => {
    const { container } = render(
      <BlockRenderer node={carouselNode({ autoplay: true, transition: 'fade-loop' })} />,
    );

    const root = container.querySelector('[data-transition]');
    expect(root).toHaveAttribute('data-transition', 'fade-loop');
    const slides = Array.from(container.querySelectorAll('[id^="slide-"]')) as HTMLElement[];
    expect(slides).toHaveLength(2);
    expect(slides[0].style.animationDuration).not.toBe('');
    expect(slides[0].style.animationDelay).not.toBe(slides[1].style.animationDelay);
  });

  it('ogni slide porta un\'ancora `id="slide-{id del nodo}"`, navigabile via `#`', () => {
    render(<BlockRenderer node={carouselNode({})} />);

    expect(document.getElementById('slide-slide-1')).toBeInTheDocument();
    expect(document.getElementById('slide-slide-2')).toBeInTheDocument();
  });
});
