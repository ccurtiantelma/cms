import { describe, expect, it } from 'vitest';
import { EDGE_THRESHOLD_PX, MAX_SCROLL_SPEED_PX, edgeScrollDelta } from './useEditorAutoScroll';

describe('edgeScrollDelta', () => {
  const top = 100;
  const bottom = 700;

  it('non scrolla lontano dai bordi', () => {
    expect(edgeScrollDelta(400, top, bottom)).toBe(0);
    expect(edgeScrollDelta(top + EDGE_THRESHOLD_PX, top, bottom)).toBe(0);
  });

  it('scrolla verso l’alto (negativo) vicino al bordo superiore, più forte più ci si avvicina', () => {
    const far = edgeScrollDelta(top + 50, top, bottom);
    const near = edgeScrollDelta(top + 10, top, bottom);
    expect(far).toBeLessThan(0);
    expect(near).toBeLessThan(far);
  });

  it('scrolla verso il basso (positivo) vicino al bordo inferiore', () => {
    expect(edgeScrollDelta(bottom - 10, top, bottom)).toBeGreaterThan(0);
  });

  it('a filo del bordo e oltre resta alla velocità massima, senza superarla', () => {
    expect(edgeScrollDelta(top, top, bottom)).toBe(-MAX_SCROLL_SPEED_PX);
    expect(edgeScrollDelta(top - 40, top, bottom)).toBe(-MAX_SCROLL_SPEED_PX);
    expect(edgeScrollDelta(bottom + 40, top, bottom)).toBe(MAX_SCROLL_SPEED_PX);
  });

  it('non scrolla se il puntatore è molto lontano oltre il bordo', () => {
    expect(edgeScrollDelta(top - 500, top, bottom)).toBe(0);
    expect(edgeScrollDelta(bottom + 500, top, bottom)).toBe(0);
  });
});
