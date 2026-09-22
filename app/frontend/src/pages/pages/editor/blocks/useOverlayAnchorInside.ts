import { useLayoutEffect, useState, type RefObject } from 'react';

/**
 * Anti-clipping della toolbar di selezione (ancorata sopra il bordo superiore del blocco):
 * `true` quando quel bordo è troppo vicino al confine scrollabile del canvas
 * (`[data-canvas-scroll-area]`, `FullScreenEditorLayout.tsx`) perché la toolbar ci stia sopra
 * senza essere tagliata da `overflow-y: auto` — tipicamente il primo blocco della pagina. In
 * quel caso la toolbar si riancora **dentro** il margine superiore del blocco. Ricalcolato
 * solo mentre il blocco è selezionato: alla selezione, allo scroll e al resize della finestra.
 */
export function useOverlayAnchorInside(
  wrapperRef: RefObject<HTMLDivElement | null>,
  isSelected: boolean,
): boolean {
  const [anchoredInside, setAnchoredInside] = useState(false);

  useLayoutEffect(() => {
    if (!isSelected) return undefined;
    const wrapperEl = wrapperRef.current;
    const scrollAreaEl = wrapperEl?.closest<HTMLElement>('[data-canvas-scroll-area]') ?? null;
    if (!wrapperEl || !scrollAreaEl) return undefined;

    // ~20px = altezza di `.overlay` (`BlockHoverOverlay.module.css`) più margine di sicurezza.
    const ANTI_CLIP_THRESHOLD_PX = 24;

    function recompute(): void {
      const distance =
        wrapperEl!.getBoundingClientRect().top - scrollAreaEl!.getBoundingClientRect().top;
      setAnchoredInside(distance < ANTI_CLIP_THRESHOLD_PX);
    }

    recompute();
    scrollAreaEl.addEventListener('scroll', recompute, { passive: true });
    window.addEventListener('resize', recompute);
    return () => {
      scrollAreaEl.removeEventListener('scroll', recompute);
      window.removeEventListener('resize', recompute);
    };
  }, [wrapperRef, isSelected]);

  return anchoredInside;
}
