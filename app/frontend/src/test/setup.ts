/**
 * Setup globale dei test (Vitest + Testing Library).
 * Estende `expect` con i matcher jest-dom, pulisce il DOM dopo ogni test e
 * fornisce i polyfill jsdom richiesti dai componenti Mantine (matchMedia,
 * ResizeObserver, scrollIntoView).
 */
import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// Vedi `env.FRONTEND_ROOT` in vitest.config.ts: rende i test indipendenti dalla cwd di lancio.
if (process.env.FRONTEND_ROOT && process.cwd() !== process.env.FRONTEND_ROOT) {
  process.chdir(process.env.FRONTEND_ROOT);
}

afterEach(() => {
  cleanup();
});

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }),
});

class ResizeObserverMock {
  private readonly callback: ResizeObserverCallback;
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }
  observe(target: Element): void {
    // jsdom non fa layout: riporto una dimensione fittizia così i componenti
    // che gateano il render sulla misura (es. ScrollArea Mantine) si attivano.
    this.callback(
      [{ target, contentRect: { width: 1024, height: 768 } } as ResizeObserverEntry],
      this as unknown as ResizeObserver,
    );
  }
  unobserve(): void {}
  disconnect(): void {}
}
window.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;

window.HTMLElement.prototype.scrollIntoView = vi.fn();
