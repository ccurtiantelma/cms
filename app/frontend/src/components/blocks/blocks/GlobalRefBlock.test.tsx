/**
 * `globalRef` (ADR-55): nodo puntatore, render minimale, nessuna dipendenza Mantine (CLAUDE.md
 * § confine Mantine/blocchi — "i componenti dei blocchi non importano Mantine"). Verificato
 * sia leggendo il sorgente (nessuna stringa `@mantine`), sia renderizzando senza alcun
 * `MantineProvider` a monte (un componente che dipendesse da un contesto Mantine assente
 * lancerebbe in fase di render). `BlockRenderer.tsx` (dispatcher `case 'globalRef'`) è
 * coperto in coppia: nessuna risoluzione della Sezione referenziata avviene qui né lì — è
 * responsabilità del job di export lato server (ADR-55 § 1).
 */
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import GlobalRefBlock from './GlobalRefBlock';
import BlockRenderer from '../BlockRenderer';
import type { RenderableBlockNode } from '../types';

const SOURCE_PATH = path.resolve(
  process.cwd(),
  'src/components/blocks/blocks/GlobalRefBlock.tsx',
);

describe('GlobalRefBlock — nessuna dipendenza Mantine (CLAUDE.md, confine Mantine/blocchi)', () => {
  it('il sorgente non importa alcun pacchetto @mantine/*', () => {
    const source = readFileSync(SOURCE_PATH, 'utf-8');
    expect(source).not.toMatch(/@mantine\//);
  });

  it('renderizza senza MantineProvider a monte (render diretto, nessun wrapper) e non lancia', () => {
    expect(() =>
      render(<GlobalRefBlock globalSectionGuid="0123456789abcdef" />),
    ).not.toThrow();
    expect(
      screen.getByText('Sezione Globale collegata — il contenuto reale viene risolto in pubblicazione.'),
    ).toBeInTheDocument();
  });

  it('espone il guid referenziato come data-attribute, per debug/E2E, senza risolverlo', () => {
    render(<GlobalRefBlock globalSectionGuid="0123456789abcdef" />);
    const placeholder = screen.getByText(
      'Sezione Globale collegata — il contenuto reale viene risolto in pubblicazione.',
    ).parentElement;
    expect(placeholder).toHaveAttribute('data-global-section-guid', '0123456789abcdef');
  });

  it('renderToStaticMarkup (percorso SSR condiviso, ADR-22) non lancia', () => {
    expect(() =>
      renderToStaticMarkup(<GlobalRefBlock globalSectionGuid="0123456789abcdef" />),
    ).not.toThrow();
  });
});

describe('BlockRenderer — dispatch del case "globalRef" (ADR-55)', () => {
  function globalRefNode(guid: string): RenderableBlockNode {
    return {
      id: 'gr-1',
      type: 'globalRef',
      props: { globalSectionGuid: guid },
      children: [],
    };
  }

  it('un nodo globalRef nell\'albero renderizza GlobalRefBlock (nessun figlio da ricorrere, foglia)', () => {
    render(<BlockRenderer node={globalRefNode('0123456789abcdef')} />);

    expect(
      screen.getByText('Sezione Globale collegata — il contenuto reale viene risolto in pubblicazione.'),
    ).toBeInTheDocument();
  });

  it('globalSectionGuid non stringa (props malformate, non dovrebbe capitare: server già validato) non lancia, guid vuoto', () => {
    const malformed: RenderableBlockNode = {
      id: 'gr-2',
      type: 'globalRef',
      props: { globalSectionGuid: 42 },
      children: [],
    };
    expect(() => render(<BlockRenderer node={malformed} />)).not.toThrow();
  });
});
