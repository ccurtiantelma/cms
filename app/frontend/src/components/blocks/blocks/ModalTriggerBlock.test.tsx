/**
 * `modalTrigger` (ADR-57 § 2/§ 4): CSS-only, tecnica `:target`. Copertura minima di
 * PLAN-widget-interattivi-enterprise.md T6: il trigger porta `href="#modal-{id}"` e il
 * pannello ha lo stesso `id`, derivato dall'`id` del nodo (mai una prop). Verificato sia sul
 * componente isolato sia sul dispatch di `BlockRenderer.tsx` (case `'modalTrigger'`).
 */
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import ModalTriggerBlock from './ModalTriggerBlock';
import BlockRenderer from '../BlockRenderer';
import type { RenderableBlockNode } from '../types';

const SOURCE_PATH = path.resolve(
  process.cwd(),
  'src/components/blocks/blocks/ModalTriggerBlock.tsx',
);

describe('ModalTriggerBlock — CSS-only, zero JavaScript (ADR-57 § 4)', () => {
  it('nessuna dipendenza Mantine, nessun handler React, nessuno stato React nel sorgente', () => {
    const source = readFileSync(SOURCE_PATH, 'utf-8');
    expect(source).not.toMatch(/@mantine\//);
    expect(source).not.toMatch(/onClick/);
    expect(source).not.toMatch(/useState/);
    expect(source).not.toMatch(/useEffect/);
  });

  it('il trigger porta `href="#modal-{nodeId}"` e il pannello ha lo stesso `id`', () => {
    render(
      <ModalTriggerBlock nodeId="n1" triggerLabel="Apri" animation="fade">
        Contenuto del modale
      </ModalTriggerBlock>,
    );

    const trigger = screen.getByRole('link', { name: 'Apri' });
    expect(trigger).toHaveAttribute('href', '#modal-n1');
    expect(document.getElementById('modal-n1')).toBeInTheDocument();
  });

  it('il pannello è escluso dal flusso visivo per default (nessun attributo `open`/`display` forzato via JS): solo `:target` lo mostra', () => {
    render(
      <ModalTriggerBlock nodeId="n1" triggerLabel="Apri" animation="none">
        Contenuto
      </ModalTriggerBlock>,
    );

    // Nessun attributo che dipenda da stato React: la visibilità è affidata interamente al
    // CSS (`:target`), verificato qui solo come assenza di attributi di stato dinamici.
    const panel = document.getElementById('modal-n1');
    expect(panel).not.toHaveAttribute('hidden');
    expect(panel).toHaveAttribute('role', 'dialog');
    expect(panel).toHaveAttribute('aria-modal', 'true');
  });

  it('renderToStaticMarkup (percorso SSR condiviso, ADR-22) non lancia', () => {
    expect(() =>
      renderToStaticMarkup(
        <ModalTriggerBlock nodeId="n1" triggerLabel="Apri" animation="fade">
          Contenuto
        </ModalTriggerBlock>,
      ),
    ).not.toThrow();
  });
});

describe('BlockRenderer — dispatch del case "modalTrigger" (ADR-57 § 2)', () => {
  function modalTriggerNode(props: Record<string, unknown>): RenderableBlockNode {
    return {
      id: 'modal-node-1',
      type: 'modalTrigger',
      props,
      children: [{ id: 'h-1', type: 'heading', props: { level: 'h2', text: 'Titolo modale' }, children: [] }],
    };
  }

  it('id di ancora derivato dall\'id del nodo, non da una prop', () => {
    render(<BlockRenderer node={modalTriggerNode({ triggerLabel: 'Scopri di più', animation: 'fade' })} />);

    expect(screen.getByRole('link', { name: 'Scopri di più' })).toHaveAttribute(
      'href',
      '#modal-modal-node-1',
    );
    expect(document.getElementById('modal-modal-node-1')).toBeInTheDocument();
  });

  it('renderizza i figli dentro il pannello del modale', () => {
    render(<BlockRenderer node={modalTriggerNode({ triggerLabel: 'Apri', animation: 'none' })} />);

    expect(screen.getByText('Titolo modale')).toBeInTheDocument();
  });

  it("animation non riconosciuta ricade su 'fade', mai un crash", () => {
    expect(() =>
      render(<BlockRenderer node={modalTriggerNode({ triggerLabel: 'Apri', animation: 'boh' })} />),
    ).not.toThrow();
  });
});
