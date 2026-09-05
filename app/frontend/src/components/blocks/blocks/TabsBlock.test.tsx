/**
 * `tabs` (ADR-57 § 2/§ 4): CSS-only, radio-hack (`<input type="radio">` nascosti + `<label>` +
 * selettore `:checked ~`). Copertura minima di PLAN-widget-interattivi-enterprise.md T6: il
 * `name` del gruppo radio è univoco per istanza di `tabs`, il primo `tabPanel` è `checked` di
 * default. Verificato attraverso il dispatch di `BlockRenderer.tsx` (case `'tabs'`), l'unico
 * punto che calcola `groupName`/`defaultChecked` per l'intero gruppo di fratelli.
 */
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import TabsBlock from './TabsBlock';
import TabPanelBlock from './TabPanelBlock';
import BlockRenderer from '../BlockRenderer';
import type { RenderableBlockNode } from '../types';

const SOURCE_PATHS = [
  path.resolve(process.cwd(), 'src/components/blocks/blocks/TabsBlock.tsx'),
  path.resolve(process.cwd(), 'src/components/blocks/blocks/TabPanelBlock.tsx'),
];

describe('TabsBlock/TabPanelBlock — CSS-only, zero JavaScript (ADR-57 § 4)', () => {
  it('nessuna dipendenza Mantine, nessun handler React, nessuno stato React nel sorgente', () => {
    for (const sourcePath of SOURCE_PATHS) {
      const source = readFileSync(sourcePath, 'utf-8');
      expect(source).not.toMatch(/@mantine\//);
      expect(source).not.toMatch(/onClick/);
      expect(source).not.toMatch(/useState/);
      expect(source).not.toMatch(/useEffect/);
    }
  });

  it('renderToStaticMarkup (percorso SSR condiviso, ADR-22) non lancia', () => {
    expect(() =>
      renderToStaticMarkup(
        <TabsBlock>
          <TabPanelBlock label="Tab 1" groupName="grp" defaultChecked>
            Contenuto 1
          </TabPanelBlock>
        </TabsBlock>,
      ),
    ).not.toThrow();
  });
});

describe('BlockRenderer — dispatch del case "tabs" (ADR-57 § 2/§ 4)', () => {
  function tabsNode(id: string): RenderableBlockNode {
    return {
      id,
      type: 'tabs',
      props: {},
      children: [
        { id: 'panel-1', type: 'tabPanel', props: { label: 'Panoramica' }, children: [] },
        { id: 'panel-2', type: 'tabPanel', props: { label: 'Dettagli' }, children: [] },
      ],
    };
  }

  it('tutti i radio dello stesso gruppo condividono un `name` univoco per istanza di tabs', () => {
    render(<BlockRenderer node={tabsNode('tabs-a')} />);

    const overview = screen.getByLabelText('Panoramica') as HTMLInputElement;
    const details = screen.getByLabelText('Dettagli') as HTMLInputElement;
    expect(overview.name).toBe(details.name);
    expect(overview.name).toContain('tabs-a');
  });

  it('istanze diverse di tabs sulla stessa pagina hanno `name` di gruppo diversi', () => {
    const { unmount } = render(<BlockRenderer node={tabsNode('tabs-a')} />);
    const nameA = (screen.getByLabelText('Panoramica') as HTMLInputElement).name;
    unmount();

    render(<BlockRenderer node={tabsNode('tabs-b')} />);
    const nameB = (screen.getByLabelText('Panoramica') as HTMLInputElement).name;

    expect(nameA).not.toBe(nameB);
  });

  it('il primo tabPanel è `checked` di default, gli altri no', () => {
    render(<BlockRenderer node={tabsNode('tabs-a')} />);

    expect(screen.getByLabelText('Panoramica')).toBeChecked();
    expect(screen.getByLabelText('Dettagli')).not.toBeChecked();
  });

  it('un tabPanel raggiunto fuori da un tabs padre (contenuto malformato/legacy) non lancia ed è reso aperto', () => {
    const standalone: RenderableBlockNode = {
      id: 'orphan-panel',
      type: 'tabPanel',
      props: { label: 'Pannello orfano' },
      children: [],
    };
    expect(() => render(<BlockRenderer node={standalone} />)).not.toThrow();
    expect(screen.getByLabelText('Pannello orfano')).toBeChecked();
  });
});
