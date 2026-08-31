/**
 * Test dedicato di `InlineFloatingToolbar.tsx` (gap #1/#2/#3 — Sottolineato, Barrato,
 * Allineamento giustificato): a differenza degli altri test di questo modulo, che passano
 * da `EditorBlockWrapper.test.tsx`, qui il componente è montato direttamente. La sua unica
 * condizione di rendering reale (`if (!anchorRect) return null`) dipende da una selezione
 * di testo non collassata dentro il `target` risolto da `getTarget` — jsdom supporta
 * Range/Selection quanto basta per fabbricarne una a mano (stessa tecnica già usata da
 * `applyFormattingCommand`, `EditorBlockWrapper.tsx`), senza dover passare dalla chrome
 * intera del wrapper solo per esercitare questi pulsanti. Questo test ha anche fatto
 * emergere (e verifica ora in negativo, indirettamente, tramite il rendering sincrono
 * riuscito) un bug preesistente indipendente da questo task: il vecchio guard era
 * `if (!style) return null`, che impediva al componente di montarsi la prima volta in
 * assoluto (stallo circolare fra il montaggio del `<div>` e il calcolo di `style` — vedi
 * il commento sopra `if (!anchorRect) return null` in `InlineFloatingToolbar.tsx`).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithProviders } from '../../../../test/utils';

const { default: InlineFloatingToolbar } = await import('../InlineFloatingToolbar');

/**
 * `contentEditable` reale nel DOM (non renderizzato da React: il componente sotto test lo
 * risolve tramite `getTarget`, esattamente come `EditorBlockWrapper.tsx` fa con
 * `querySelector`), con una selezione già impostata su tutto il contenuto —
 * `isSelectionInside` nel componente verifica che l'`anchorNode` della selezione sia
 * dentro (o sia) il target, condizione soddisfatta da `range.selectNodeContents(el)`.
 */
function mountEditableWithSelection(html: string): HTMLDivElement {
  const el = document.createElement('div');
  el.contentEditable = 'true';
  el.innerHTML = html;
  document.body.appendChild(el);

  const range = document.createRange();
  range.selectNodeContents(el);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);

  return el;
}

/** DOMRect vuoto: sufficiente per far entrare `computeAnchorRect` nel ramo di fallback (bounding box del blocco intero), unico che jsdom può soddisfare. */
const emptyRect: DOMRect = {
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  width: 0,
  height: 0,
  x: 0,
  y: 0,
  toJSON: () => ({}),
};

describe('InlineFloatingToolbar — Sottolineato/Barrato/Allineamento giustificato (gap #1-3)', () => {
  let target: HTMLDivElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    target = mountEditableWithSelection('<p>Testo selezionato</p>');
    // jsdom non implementa `execCommand`/`queryCommandState` (vedi lo stesso mock in
    // `EditorBlockWrapper.test.tsx`, describe "InlineFormattingToolbar") né
    // `Range.prototype.getBoundingClientRect` (usato da `computeAnchorRect`), che qui
    // conta solo per far scattare il ramo di fallback (bounding box del blocco intero).
    document.execCommand = vi.fn().mockReturnValue(true);
    document.queryCommandState = vi.fn().mockReturnValue(false);
    // Solo `getBoundingClientRect` è letto da `computeAnchorRect`/dal calcolo di
    // posizionamento: jsdom non la implementa su `Range` (a differenza di `Element`, dove
    // il default a zero è già nativo).
    Range.prototype.getBoundingClientRect = vi.fn(() => emptyRect);
  });

  it('espone "Sottolineato": esegue `underline` e propaga l\'HTML risultante', () => {
    const onApplied = vi.fn();
    renderWithProviders(<InlineFloatingToolbar getTarget={() => target} onApplied={onApplied} />);

    fireEvent.click(screen.getByRole('button', { name: 'Sottolineato' }));

    expect(document.execCommand).toHaveBeenCalledWith('underline', false, undefined);
    expect(onApplied).toHaveBeenCalledWith(target.innerHTML);
  });

  it('espone "Barrato": esegue `strikeThrough`', () => {
    renderWithProviders(<InlineFloatingToolbar getTarget={() => target} onApplied={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Barrato' }));

    expect(document.execCommand).toHaveBeenCalledWith('strikeThrough', false, undefined);
  });

  it('espone "Allinea giustificato": esegue `justifyFull`', () => {
    renderWithProviders(<InlineFloatingToolbar getTarget={() => target} onApplied={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Allinea giustificato' }));

    expect(document.execCommand).toHaveBeenCalledWith('justifyFull', false, undefined);
  });

  it('riflette lo stato attivo di Sottolineato/Barrato da `queryCommandState`', () => {
    document.queryCommandState = vi.fn((command: string) => command === 'underline');

    renderWithProviders(<InlineFloatingToolbar getTarget={() => target} onApplied={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Sottolineato' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Barrato' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('un click su un bottone della barra impedisce al mousedown di rubare il focus (preserva la selezione)', () => {
    renderWithProviders(<InlineFloatingToolbar getTarget={() => target} onApplied={vi.fn()} />);

    const toolbar = screen.getByRole('toolbar', { name: 'Formattazione testo' });
    const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    const prevented = !toolbar.dispatchEvent(event);

    expect(prevented).toBe(true);
  });
});
