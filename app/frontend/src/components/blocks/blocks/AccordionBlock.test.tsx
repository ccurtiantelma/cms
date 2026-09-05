/**
 * `accordion` (ADR-57 § 2/§ 4): CSS-only, `<details>/<summary>` nativi. Copertura minima di
 * PLAN-widget-interattivi-enterprise.md T6: `exclusive:true` produce lo stesso attributo
 * `name` su ogni `accordionItem` figlio, `exclusive:false` nessun `name`. Verificato sia
 * renderizzando il componente direttamente sia attraverso il dispatch di `BlockRenderer.tsx`
 * (case `'accordion'`), che è l'unico punto che calcola `groupName` — stesso principio delle
 * suite `GlobalRefBlock.test.tsx`/`NavMenuBlock.test.tsx`.
 */
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import AccordionBlock from './AccordionBlock';
import AccordionItemBlock from './AccordionItemBlock';
import BlockRenderer from '../BlockRenderer';
import type { RenderableBlockNode } from '../types';

const SOURCE_PATHS = [
  path.resolve(process.cwd(), 'src/components/blocks/blocks/AccordionBlock.tsx'),
  path.resolve(process.cwd(), 'src/components/blocks/blocks/AccordionItemBlock.tsx'),
];

describe('AccordionBlock/AccordionItemBlock — CSS-only, zero JavaScript (ADR-57 § 4)', () => {
  it('nessuna dipendenza Mantine, nessun handler React, nessuno stato React nel sorgente', () => {
    for (const sourcePath of SOURCE_PATHS) {
      const source = readFileSync(sourcePath, 'utf-8');
      expect(source).not.toMatch(/@mantine\//);
      expect(source).not.toMatch(/onClick/);
      expect(source).not.toMatch(/useState/);
      expect(source).not.toMatch(/useEffect/);
    }
  });

  it('renderizza senza MantineProvider e senza lanciare', () => {
    expect(() =>
      render(
        <AccordionBlock>
          <AccordionItemBlock title="Voce 1">Contenuto 1</AccordionItemBlock>
        </AccordionBlock>,
      ),
    ).not.toThrow();
    expect(screen.getByText('Voce 1')).toBeInTheDocument();
  });

  it('renderToStaticMarkup (percorso SSR condiviso, ADR-22) non lancia', () => {
    expect(() =>
      renderToStaticMarkup(
        <AccordionBlock>
          <AccordionItemBlock title="Voce 1">Contenuto 1</AccordionItemBlock>
        </AccordionBlock>,
      ),
    ).not.toThrow();
  });
});

describe('BlockRenderer — dispatch del case "accordion" (ADR-57 § 2/§ 4)', () => {
  function accordionNode(exclusive: boolean): RenderableBlockNode {
    return {
      id: 'acc-1',
      type: 'accordion',
      props: { exclusive },
      children: [
        { id: 'item-1', type: 'accordionItem', props: { title: 'Prima voce' }, children: [] },
        { id: 'item-2', type: 'accordionItem', props: { title: 'Seconda voce' }, children: [] },
      ],
    };
  }

  it('exclusive:true → tutti gli accordionItem figli condividono lo stesso attributo `name`', () => {
    render(<BlockRenderer node={accordionNode(true)} />);

    const details = screen.getAllByText(/voce$/i).map((summary) => summary.closest('details'));
    expect(details).toHaveLength(2);
    const names = details.map((element) => element?.getAttribute('name'));
    expect(names[0]).toBeTruthy();
    expect(names[0]).toBe(names[1]);
    // Univoco per istanza di accordion (derivato dall'id del nodo, ADR-57 § 4): mai un
    // valore fisso, altrimenti due accordion diversi sulla stessa pagina si renderebbero
    // reciprocamente esclusivi.
    expect(names[0]).toContain('acc-1');
  });

  it('exclusive:false → nessun attributo `name` su alcun accordionItem figlio', () => {
    render(<BlockRenderer node={accordionNode(false)} />);

    const details = screen.getAllByText(/voce$/i).map((summary) => summary.closest('details'));
    for (const element of details) {
      expect(element).not.toHaveAttribute('name');
    }
  });

  it('un accordionItem raggiunto fuori da un accordion padre (contenuto malformato/legacy) non lancia e non ha `name`', () => {
    const standalone: RenderableBlockNode = {
      id: 'orphan-item',
      type: 'accordionItem',
      props: { title: 'Voce orfana' },
      children: [],
    };
    expect(() => render(<BlockRenderer node={standalone} />)).not.toThrow();
    expect(screen.getByText('Voce orfana').closest('details')).not.toHaveAttribute('name');
  });
});
