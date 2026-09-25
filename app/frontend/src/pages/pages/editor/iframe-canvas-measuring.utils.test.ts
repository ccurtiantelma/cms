import { describe, expect, it } from 'vitest';
import {
  frameScaleOf,
  isPaletteOrigin,
  rectIntoIframeSpace,
  rectIntoParentSpace,
} from './iframe-canvas-measuring.utils';

function domRect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON: () => ({}),
  };
}

describe('frameScaleOf', () => {
  it('è il rapporto fra larghezza a schermo e di layout', () => {
    expect(frameScaleOf(500, 1000)).toBe(0.5);
  });

  it('ricade su 1 se una delle due misure manca', () => {
    expect(frameScaleOf(0, 1000)).toBe(1);
    expect(frameScaleOf(500, 0)).toBe(1);
  });
});

describe('traduzione cross-frame dei rettangoli', () => {
  const frame = { left: 300, top: 52 };

  it('senza scala è una semplice traslazione', () => {
    const rect = rectIntoParentSpace(domRect(10, 20, 100, 40), frame, 1);
    expect(rect).toMatchObject({
      left: 310,
      top: 72,
      width: 100,
      height: 40,
      right: 410,
      bottom: 112,
    });
  });

  it('con scala 0.5 scala posizione e dimensioni', () => {
    const rect = rectIntoParentSpace(domRect(100, 200, 100, 40), frame, 0.5);
    expect(rect).toMatchObject({ left: 350, top: 152, width: 50, height: 20 });
  });

  it('è l’inversa di rectIntoIframeSpace', () => {
    const original = domRect(120, 80, 60, 30);
    const inParent = rectIntoParentSpace(original, frame, 0.75);
    const back = rectIntoIframeSpace(
      domRect(inParent.left, inParent.top, inParent.width, inParent.height),
      frame,
      0.75,
    );
    expect(back.left).toBeCloseTo(120);
    expect(back.top).toBeCloseTo(80);
    expect(back.width).toBeCloseTo(60);
    expect(back.height).toBeCloseTo(30);
  });
});

describe('isPaletteOrigin', () => {
  it('riconosce il prefisso sintetico della palette', () => {
    expect(isPaletteOrigin('new-block:heading')).toBe(true);
    expect(isPaletteOrigin('b-1')).toBe(false);
  });
});
