/**
 * Unit test della guardia sulla navigazione con lavoro non salvato (PLAN-F04-editor-visivo.md
 * T2, round F04b — voce TODO 3.11, implementata senza alcun test).
 *
 * Copertura scelta secondo il limite dichiarato nel commento d'intestazione del file
 * sorgente: la guardia copre due strade d'uscita, `beforeunload` e il click su un
 * `<a href>` interno intercettato in fase di cattura. Il tasto Indietro del browser non è
 * coperto (limite dichiarato, non un gap da testare).
 *
 * **`beforeunload` in jsdom**: jsdom non mostra mai il dialogo nativo di conferma — nessun
 * ambiente Jest/Vitest può testarlo, è una funzionalità del browser reale, fuori dal
 * perimetro testabile anche con Playwright (i motori headless lo sopprimono di proposito
 * per non bloccare l'automazione). Ciò che **è** testabile e vale la pena testare è la
 * logica dell'handler stesso: se, quando `enabled` è `true`, chiama `preventDefault()` e
 * imposta `returnValue` (i due segnali che dicono al browser reale "chiedi conferma"), e se
 * non lo fa quando `enabled` è `false`. È quello che i test qui sotto verificano dispatchando
 * un evento `beforeunload` reale su `window` — non un test placeholder sulla sola
 * registrazione del listener, ma sul comportamento del suo handler.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import { renderHook, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { useUnsavedChangesGuard } from './useUnsavedChangesGuard';

/** Ultima location vista da un componente montato sotto `MemoryRouter`, per verificare `leaveAnyway`. */
function locationProbe(sink: { pathname: string; search: string }) {
  return function LocationProbe(): null {
    const location = useLocation();
    sink.pathname = location.pathname;
    sink.search = location.search;
    return null;
  };
}

/** Wrapper `MemoryRouter` che espone la location corrente in `sink`, come farebbe l'app reale. */
function makeWrapper(sink: { pathname: string; search: string }) {
  const Probe = locationProbe(sink);
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <MemoryRouter initialEntries={['/pages/aaaa1111aaaa1111']}>
        <Probe />
        <Routes>
          <Route path="*" element={<>{children}</>} />
        </Routes>
      </MemoryRouter>
    );
  };
}

/** Simula il click primario, senza modificatori, su un ancora già montata nel DOM. */
function clickAnchor(anchor: HTMLAnchorElement): MouseEvent {
  const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
  anchor.dispatchEvent(event);
  return event;
}

/** Monta un'ancora `href` nel `document.body` reale (il listener della guardia è su `document`). */
function mountAnchor(href: string, options: { target?: string; download?: boolean } = {}): HTMLAnchorElement {
  const anchor = document.createElement('a');
  anchor.href = href;
  if (options.target) anchor.target = options.target;
  if (options.download) anchor.setAttribute('download', '');
  document.body.appendChild(anchor);
  return anchor;
}

beforeEach(() => {
  document.body.innerHTML = '';
  // La guardia legge `window.location`, non lo stato del router (vive fuori da un data
  // router, vedi il commento del sorgente): in produzione coincidono perché l'app monta
  // `BrowserRouter`. `MemoryRouter`, usato qui per intercettare `leaveAnyway`/`stay` senza
  // toccare la history reale del browser di test, non sincronizza `window.location` da
  // solo — lo si allinea con `pushState`, lo stesso meccanismo con cui lo fa React Router.
  window.history.pushState({}, '', '/pages/aaaa1111aaaa1111');
});

describe('useUnsavedChangesGuard — click su navigazione interna', () => {
  it('enabled=true: intercetta il click su un link interno e lo trattiene come pendingPath', () => {
    const sink = { pathname: '', search: '' };
    const { result } = renderHook(() => useUnsavedChangesGuard(true), {
      wrapper: makeWrapper(sink),
    });

    const anchor = mountAnchor('/pages');
    let event!: MouseEvent;
    act(() => {
      event = clickAnchor(anchor);
    });

    expect(event.defaultPrevented).toBe(true);
    expect(result.current.pendingPath).toBe('/pages');
  });

  it('enabled=false: non registra alcun intercetto, il click prosegue senza essere trattenuto', () => {
    const sink = { pathname: '', search: '' };
    const { result } = renderHook(() => useUnsavedChangesGuard(false), {
      wrapper: makeWrapper(sink),
    });

    const anchor = mountAnchor('/pages');
    let event!: MouseEvent;
    act(() => {
      event = clickAnchor(anchor);
    });

    expect(event.defaultPrevented).toBe(false);
    expect(result.current.pendingPath).toBeNull();
  });

  it('click con Ctrl (apri in nuova scheda): non è una navigazione che lascia la pagina, non si intercetta', () => {
    const sink = { pathname: '', search: '' };
    const { result } = renderHook(() => useUnsavedChangesGuard(true), {
      wrapper: makeWrapper(sink),
    });

    const anchor = mountAnchor('/pages');
    act(() => {
      anchor.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ctrlKey: true }),
      );
    });

    expect(result.current.pendingPath).toBeNull();
  });

  it('link con target diverso da _self: non si intercetta', () => {
    const sink = { pathname: '', search: '' };
    const { result } = renderHook(() => useUnsavedChangesGuard(true), {
      wrapper: makeWrapper(sink),
    });

    const anchor = mountAnchor('/pages', { target: '_blank' });
    act(() => {
      clickAnchor(anchor);
    });

    expect(result.current.pendingPath).toBeNull();
  });

  it('link download: non si intercetta', () => {
    const sink = { pathname: '', search: '' };
    const { result } = renderHook(() => useUnsavedChangesGuard(true), {
      wrapper: makeWrapper(sink),
    });

    const anchor = mountAnchor('/pages/export.csv', { download: true });
    act(() => {
      clickAnchor(anchor);
    });

    expect(result.current.pendingPath).toBeNull();
  });

  it('link verso la stessa pagina (stesso pathname): non si esce dall’editor, non si intercetta', () => {
    const sink = { pathname: '', search: '' };
    const { result } = renderHook(() => useUnsavedChangesGuard(true), {
      wrapper: makeWrapper(sink),
    });

    const anchor = mountAnchor('/pages/aaaa1111aaaa1111?tab=seo');
    act(() => {
      clickAnchor(anchor);
    });

    expect(result.current.pendingPath).toBeNull();
  });

  it('leaveAnyway naviga verso il percorso trattenuto e libera pendingPath', () => {
    const sink = { pathname: '', search: '' };
    const { result } = renderHook(() => useUnsavedChangesGuard(true), {
      wrapper: makeWrapper(sink),
    });

    const anchor = mountAnchor('/pages');
    act(() => {
      clickAnchor(anchor);
    });
    expect(result.current.pendingPath).toBe('/pages');

    act(() => result.current.leaveAnyway());

    expect(result.current.pendingPath).toBeNull();
    expect(sink.pathname).toBe('/pages');
  });

  it('stay annulla la navigazione trattenuta senza spostare la location', () => {
    const sink = { pathname: '', search: '' };
    const { result } = renderHook(() => useUnsavedChangesGuard(true), {
      wrapper: makeWrapper(sink),
    });

    const anchor = mountAnchor('/pages');
    act(() => {
      clickAnchor(anchor);
    });

    act(() => result.current.stay());

    expect(result.current.pendingPath).toBeNull();
    expect(sink.pathname).toBe('/pages/aaaa1111aaaa1111');
  });
});

describe('useUnsavedChangesGuard — beforeunload', () => {
  it('enabled=true: il dispatch di beforeunload viene intercettato (preventDefault + returnValue)', () => {
    const sink = { pathname: '', search: '' };
    renderHook(() => useUnsavedChangesGuard(true), { wrapper: makeWrapper(sink) });

    const event = new Event('beforeunload', { cancelable: true }) as BeforeUnloadEvent;
    act(() => {
      window.dispatchEvent(event);
    });

    // `returnValue` è un attributo IDL booleano (legacy DOM): assegnare `''` (falsy) è
    // l'idioma con cui `handleBeforeUnload` chiede conferma, ma il getter dopo
    // `preventDefault()` risponde `false`, non la stringa assegnata — è così anche nei
    // browser reali, non un'imprecisione di jsdom.
    expect(event.defaultPrevented).toBe(true);
    expect(event.returnValue).toBe(false);
  });

  it('enabled=false: nessun intercetto su beforeunload', () => {
    const sink = { pathname: '', search: '' };
    renderHook(() => useUnsavedChangesGuard(false), { wrapper: makeWrapper(sink) });

    const event = new Event('beforeunload', { cancelable: true }) as BeforeUnloadEvent;
    act(() => {
      window.dispatchEvent(event);
    });

    expect(event.defaultPrevented).toBe(false);
  });

  it('il toggle di enabled rimuove il listener precedente: dopo il passaggio a false non intercetta più', () => {
    const sink = { pathname: '', search: '' };
    const { rerender } = renderHook(({ enabled }) => useUnsavedChangesGuard(enabled), {
      wrapper: makeWrapper(sink),
      initialProps: { enabled: true },
    });

    rerender({ enabled: false });

    const event = new Event('beforeunload', { cancelable: true }) as BeforeUnloadEvent;
    act(() => {
      window.dispatchEvent(event);
    });

    expect(event.defaultPrevented).toBe(false);
  });
});

describe('useUnsavedChangesGuard — nessun costo quando disattivata', () => {
  it('enabled=false: non registra alcun listener di click né di beforeunload', () => {
    const addSpy = vi.spyOn(document, 'addEventListener');
    const windowAddSpy = vi.spyOn(window, 'addEventListener');
    const sink = { pathname: '', search: '' };

    renderHook(() => useUnsavedChangesGuard(false), { wrapper: makeWrapper(sink) });

    expect(addSpy).not.toHaveBeenCalledWith('click', expect.any(Function), true);
    expect(windowAddSpy).not.toHaveBeenCalledWith('beforeunload', expect.any(Function));

    addSpy.mockRestore();
    windowAddSpy.mockRestore();
  });
});
