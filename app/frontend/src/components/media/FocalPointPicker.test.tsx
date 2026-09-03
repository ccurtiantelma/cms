/**
 * Component test di `FocalPointPicker` (ADR-49 § M4): il punto che conta è il calcolo delle
 * coordinate percentuali dal gesto del mouse, non il rendering — verificato mockando
 * `getBoundingClientRect` della surface a un rettangolo noto, stesso principio già in uso in
 * `ContainerResizeHandle.test.tsx` (jsdom non implementa layout).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '../../test/utils';
import FocalPointPicker from './FocalPointPicker';

/** Rettangolo fisso della surface: 200×100 a partire da (0,0), per una matematica leggibile. */
const RECT_WIDTH = 200;
const RECT_HEIGHT = 100;
let originalGetRect: typeof HTMLElement.prototype.getBoundingClientRect;

/** jsdom non implementa `PointerEvent`: senza polyfill `clientX/clientY` non arriverebbero. */
class MockPointerEvent extends MouseEvent {
  readonly pointerId: number;
  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init);
    this.pointerId = init.pointerId ?? 0;
  }
}

beforeEach(() => {
  window.PointerEvent = MockPointerEvent as unknown as typeof PointerEvent;
  originalGetRect = HTMLElement.prototype.getBoundingClientRect;
  HTMLElement.prototype.getBoundingClientRect = function mockRect(): DOMRect {
    return {
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: RECT_WIDTH,
      bottom: RECT_HEIGHT,
      width: RECT_WIDTH,
      height: RECT_HEIGHT,
      toJSON: () => ({}),
    } as DOMRect;
  };
  HTMLElement.prototype.setPointerCapture = vi.fn();
  HTMLElement.prototype.hasPointerCapture = vi.fn().mockReturnValue(true);
  HTMLElement.prototype.releasePointerCapture = vi.fn();
});

afterEach(() => {
  HTMLElement.prototype.getBoundingClientRect = originalGetRect;
});

function surface(): HTMLElement {
  return screen.getByTestId('focal-point-surface');
}

describe('FocalPointPicker — rendering', () => {
  it('senza focalX/focalY dichiarati mostra il mirino al centro (default 50/50)', () => {
    renderWithProviders(
      <FocalPointPicker imageUrl="http://example.test/img.png" onChange={vi.fn()} />,
    );

    const crosshair = screen.getByTestId('focal-point-crosshair');
    expect(crosshair).toHaveStyle({ left: '50%', top: '50%' });
    expect(screen.getByText('Punto focale: 50% / 50%')).toBeInTheDocument();
  });

  it('con focalX/focalY espliciti posiziona il mirino di conseguenza', () => {
    renderWithProviders(
      <FocalPointPicker
        imageUrl="http://example.test/img.png"
        focalX={20}
        focalY={80}
        onChange={vi.fn()}
      />,
    );

    const crosshair = screen.getByTestId('focal-point-crosshair');
    expect(crosshair).toHaveStyle({ left: '20%', top: '80%' });
    expect(screen.getByText('Punto focale: 20% / 80%')).toBeInTheDocument();
  });
});

describe('FocalPointPicker — calcolo delle coordinate al click (ADR-49 § M4)', () => {
  it('un click al centro esatto della surface (200×100) calcola 50%/50%', () => {
    const onChange = vi.fn();
    renderWithProviders(
      <FocalPointPicker imageUrl="http://example.test/img.png" onChange={onChange} />,
    );

    fireEvent.pointerDown(surface(), { pointerId: 1, clientX: 100, clientY: 50 });

    expect(onChange).toHaveBeenCalledWith(50, 50);
  });

  it("un click nell'angolo in alto a sinistra calcola 0%/0%", () => {
    const onChange = vi.fn();
    renderWithProviders(
      <FocalPointPicker imageUrl="http://example.test/img.png" onChange={onChange} />,
    );

    fireEvent.pointerDown(surface(), { pointerId: 1, clientX: 0, clientY: 0 });

    expect(onChange).toHaveBeenCalledWith(0, 0);
  });

  it("un click a un quarto della larghezza e a metà dell'altezza calcola 25%/50%", () => {
    const onChange = vi.fn();
    renderWithProviders(
      <FocalPointPicker imageUrl="http://example.test/img.png" onChange={onChange} />,
    );

    fireEvent.pointerDown(surface(), { pointerId: 1, clientX: 50, clientY: 50 });

    expect(onChange).toHaveBeenCalledWith(25, 50);
  });

  it('un click fuori dai bordi (oltre destra/sotto) resta clampato a 100%/100%, mai un valore fuori range', () => {
    const onChange = vi.fn();
    renderWithProviders(
      <FocalPointPicker imageUrl="http://example.test/img.png" onChange={onChange} />,
    );

    fireEvent.pointerDown(surface(), {
      pointerId: 1,
      clientX: RECT_WIDTH * 3,
      clientY: RECT_HEIGHT * 3,
    });

    expect(onChange).toHaveBeenCalledWith(100, 100);
  });

  it('un click prima del bordo sinistro/superiore (coordinate negative) resta clampato a 0%/0%', () => {
    const onChange = vi.fn();
    renderWithProviders(
      <FocalPointPicker imageUrl="http://example.test/img.png" onChange={onChange} />,
    );

    fireEvent.pointerDown(surface(), { pointerId: 1, clientX: -50, clientY: -50 });

    expect(onChange).toHaveBeenCalledWith(0, 0);
  });

  it('il trascinamento (pointermove dopo pointerdown) ricalcola le coordinate ad ogni passo', () => {
    const onChange = vi.fn();
    renderWithProviders(
      <FocalPointPicker imageUrl="http://example.test/img.png" onChange={onChange} />,
    );

    fireEvent.pointerDown(surface(), { pointerId: 1, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(surface(), { pointerId: 1, clientX: RECT_WIDTH, clientY: RECT_HEIGHT });

    expect(onChange).toHaveBeenLastCalledWith(100, 100);
  });

  it('un pointermove senza un pointerdown precedente non calcola nulla (nessun trascinamento in corso)', () => {
    const onChange = vi.fn();
    renderWithProviders(
      <FocalPointPicker imageUrl="http://example.test/img.png" onChange={onChange} />,
    );

    fireEvent.pointerMove(surface(), { pointerId: 1, clientX: 100, clientY: 50 });

    expect(onChange).not.toHaveBeenCalled();
  });

  it('dopo un pointerup un nuovo pointermove non calcola più nulla (il trascinamento è terminato)', () => {
    const onChange = vi.fn();
    renderWithProviders(
      <FocalPointPicker imageUrl="http://example.test/img.png" onChange={onChange} />,
    );

    fireEvent.pointerDown(surface(), { pointerId: 1, clientX: 0, clientY: 0 });
    fireEvent.pointerUp(surface(), { pointerId: 1, clientX: 0, clientY: 0 });
    onChange.mockClear();
    fireEvent.pointerMove(surface(), { pointerId: 1, clientX: 100, clientY: 50 });

    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('FocalPointPicker — reset', () => {
  it('il pulsante "Reset a Centro (50/50)" richiama onChange(50, 50)', () => {
    const onChange = vi.fn();
    renderWithProviders(
      <FocalPointPicker
        imageUrl="http://example.test/img.png"
        focalX={10}
        focalY={90}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Reset a Centro (50/50)' }));

    expect(onChange).toHaveBeenCalledWith(50, 50);
  });
});
