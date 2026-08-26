/**
 * Unit test minimo della clipboard di stile del menu contestuale (`EditorBlockWrapper.tsx`,
 * "Copia Stile"/"Incolla Stile"). Copre solo la logica nuova introdotta con questo store:
 * l'estrazione delle prop `style*` e la sostituzione (non l'unione) del contenuto copiato.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { extractStyleProps, useStyleClipboardStore } from './useStyleClipboardStore';

describe('extractStyleProps', () => {
  it('tiene solo le prop il cui nome inizia per "style"', () => {
    const props = {
      text: 'Ciao',
      styleTextColor: { default: 'muted' },
      styleFontSize: { default: 'md' },
      level: 'h2',
    };
    expect(extractStyleProps(props)).toEqual({
      styleTextColor: { default: 'muted' },
      styleFontSize: { default: 'md' },
    });
  });

  it('ritorna un oggetto vuoto se il nodo non ha prop di stile', () => {
    expect(extractStyleProps({ text: 'Ciao', level: 'h2' })).toEqual({});
  });
});

describe('useStyleClipboardStore', () => {
  beforeEach(() => {
    useStyleClipboardStore.setState({ copiedProps: null });
  });

  it('parte vuoto', () => {
    expect(useStyleClipboardStore.getState().copiedProps).toBeNull();
  });

  it('copyStyle sostituisce il contenuto della clipboard (mai un merge con quello precedente)', () => {
    useStyleClipboardStore.getState().copyStyle({ styleSpaceBefore: { default: 'sm' } });
    useStyleClipboardStore.getState().copyStyle({ styleBackground: { default: 'accent' } });
    expect(useStyleClipboardStore.getState().copiedProps).toEqual({
      styleBackground: { default: 'accent' },
    });
  });
});
