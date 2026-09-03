/**
 * ADR-52: `navMenuItem`, foglia del contenitore `navMenu`. Copre risoluzione dell'URL
 * (`url` esplicito, `pageGuid` client-side via `usePublicPageUrl`, `resolvedUrl` esplicito
 * del percorso SSR pubblico), target/rel, editing in-place, e sicurezza (XSS su `label`).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderToStaticMarkup } from 'react-dom/server';
import type { PageRecord } from '../../../types/pages.types';
import NavMenuItemBlock from './NavMenuItemBlock';

const fetchPage = vi.fn();

vi.mock('../../../services/pages.service', () => ({
  fetchPage: (...args: unknown[]) => fetchPage(...args),
}));

function page(overrides: Partial<PageRecord> = {}): PageRecord {
  return {
    guid: 'a1b2c3d4e5f6a7b8',
    title: 'Chi siamo',
    slug: 'chi-siamo',
    locale: 'it-IT',
    parentGuid: null,
    translationGroupId: 'group0000000001',
    status: 'published',
    publishedAt: '2026-08-25T10:00:00.000Z',
    scheduledAt: null,
    draftContent: { version: 1, blocks: [] },
    draftSeo: {},
    version: 1,
    createdAt: '2026-08-25T10:00:00.000Z',
    updatedAt: '2026-08-25T10:00:00.000Z',
    ...overrides,
  } as PageRecord;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('NavMenuItemBlock — risoluzione URL (Canvas editor, client-side)', () => {
  it('con `url` esplicito usa quell href e non richiede alcuna risoluzione', () => {
    render(<NavMenuItemBlock label="Home" url="/" />);

    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/');
    expect(fetchPage).not.toHaveBeenCalled();
  });

  it('con `pageGuid` risolve dinamicamente l\'URL pubblico corrente tramite usePublicPageUrl', async () => {
    fetchPage.mockResolvedValue(page({ guid: 'a1b2c3d4e5f6a7b8', slug: 'chi-siamo' }));

    render(<NavMenuItemBlock label="Chi siamo" pageGuid="a1b2c3d4e5f6a7b8" />);

    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'Chi siamo' })).toHaveAttribute(
        'href',
        expect.stringContaining('/chi-siamo'),
      );
    });
    expect(fetchPage).toHaveBeenCalledWith('a1b2c3d4e5f6a7b8');
  });

  it('`url` vince su `pageGuid` quando entrambi sono presenti, senza tentare alcuna risoluzione', () => {
    render(<NavMenuItemBlock label="Esterno" url="https://example.com" pageGuid="a1b2c3d4e5f6a7b8" />);

    expect(screen.getByRole('link', { name: 'Esterno' })).toHaveAttribute(
      'href',
      'https://example.com',
    );
    expect(fetchPage).not.toHaveBeenCalled();
  });

  it('pagina non pubblicata: nessun href, l\'etichetta resta visibile senza link navigabile', async () => {
    fetchPage.mockResolvedValue(page({ status: 'draft' }));

    render(<NavMenuItemBlock label="Bozza" pageGuid="a1b2c3d4e5f6a7b8" />);

    await waitFor(() => expect(fetchPage).toHaveBeenCalled());
    expect(screen.queryByRole('link', { name: 'Bozza' })).not.toBeInTheDocument();
    expect(screen.getByText('Bozza')).toBeInTheDocument();
  });

  it('target _blank aggiunge rel="noopener noreferrer"; _self (default) non aggiunge rel', () => {
    render(
      <>
        <NavMenuItemBlock label="Nuova scheda" url="/x" target="_blank" />
        <NavMenuItemBlock label="Stessa scheda" url="/y" />
      </>,
    );

    const blank = screen.getByRole('link', { name: 'Nuova scheda' });
    expect(blank).toHaveAttribute('target', '_blank');
    expect(blank).toHaveAttribute('rel', 'noopener noreferrer');

    const self = screen.getByRole('link', { name: 'Stessa scheda' });
    expect(self).not.toHaveAttribute('target');
    expect(self).not.toHaveAttribute('rel');
  });
});

describe('NavMenuItemBlock — editing in-place', () => {
  it('con `editable` il click su una voce non naviga (preventDefault)', async () => {
    render(<NavMenuItemBlock label="Home" url="/" editable />);

    const user = userEvent.setup();
    const link = screen.getByRole('link', { name: 'Home' });
    const clickEvent = await new Promise<MouseEvent>((resolve) => {
      link.addEventListener('click', (event) => resolve(event as MouseEvent), { once: true });
      void user.click(link);
    });

    expect(clickEvent.defaultPrevented).toBe(true);
  });
});

describe('NavMenuItemBlock — `resolvedUrl` esplicito (percorso SSR pubblico, ADR-52)', () => {
  it('`resolvedUrl` stringa usa quel valore come href, senza chiamare `usePublicPageUrl`/`fetchPage`', () => {
    render(
      <NavMenuItemBlock label="Chi siamo" pageGuid="a1b2c3d4e5f6a7b8" resolvedUrl="/chi-siamo" />,
    );

    expect(screen.getByRole('link', { name: 'Chi siamo' })).toHaveAttribute('href', '/chi-siamo');
    expect(fetchPage).not.toHaveBeenCalled();
  });

  it('`resolvedUrl: null` (pageGuid non risolvibile lato SSR) produce uno `span` senza href, senza chiamare `fetchPage`', () => {
    render(<NavMenuItemBlock label="Bozza" pageGuid="a1b2c3d4e5f6a7b8" resolvedUrl={null} />);

    expect(screen.queryByRole('link', { name: 'Bozza' })).not.toBeInTheDocument();
    expect(screen.getByText('Bozza')).toBeInTheDocument();
    expect(fetchPage).not.toHaveBeenCalled();
  });
});

describe('NavMenuItemBlock — sicurezza SSR (sito pubblico condiviso, ADR-22)', () => {
  it('renderToStaticMarkup non lancia e produce il link con url esplicito', () => {
    const html = renderToStaticMarkup(<NavMenuItemBlock label="Home" url="/" />);

    expect(html).toContain('<a');
    expect(html).toContain('href="/"');
  });

  it('escapa `label` (plainText) nell\'HTML prodotto, mai iniettato come markup', () => {
    const html = renderToStaticMarkup(
      <NavMenuItemBlock label="<script>alert(1)</script>" url="/" />,
    );

    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('nessun href plausibile (nessun `url`, nessun `pageGuid`): `<span>` con la label, mai un `<a href="">`', () => {
    const html = renderToStaticMarkup(<NavMenuItemBlock label="Senza link" />);

    expect(html).not.toContain('<a ');
    expect(html).toContain('Senza link');
  });
});
