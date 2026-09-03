/**
 * ADR-52: `navMenu` è composizione a children (non più `items: array`) — questi test
 * coprono solo il contenitore (toggle mobile checkbox-hack, montaggio dei figli). La
 * risoluzione URL/XSS/target/editable delle singole voci è coperta in
 * `NavMenuItemBlock.test.tsx`.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderToStaticMarkup } from 'react-dom/server';
import NavMenuBlock from './NavMenuBlock';
import NavMenuItemBlock from './NavMenuItemBlock';

describe('NavMenuBlock — composizione a children (ADR-52)', () => {
  it('renderizza i figli `navMenuItem` dentro la propria `<ul>`', () => {
    render(
      <NavMenuBlock>
        <NavMenuItemBlock label="Home" url="/" />
        <NavMenuItemBlock label="Chi siamo" url="/chi-siamo" />
      </NavMenuBlock>,
    );

    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'Chi siamo' })).toHaveAttribute('href', '/chi-siamo');
  });

  it('senza figli renderizza comunque `<nav>`/`<ul>` vuoti, senza errori', () => {
    render(<NavMenuBlock />);
    expect(screen.getByRole('navigation', { name: 'Menu di navigazione' })).toBeInTheDocument();
  });
});

describe('NavMenuBlock — toggle mobile (checkbox hack, nessun JavaScript)', () => {
  it('il checkbox di stato parte deselezionato e si attiva cliccando il pulsante hamburger', async () => {
    render(
      <NavMenuBlock>
        <NavMenuItemBlock label="Home" url="/" />
      </NavMenuBlock>,
    );

    const toggle = screen.getByRole('checkbox', { name: 'Apri il menu' });
    expect(toggle).not.toBeChecked();

    const user = userEvent.setup();
    await user.click(screen.getByLabelText('Apri il menu'));

    expect(toggle).toBeChecked();
  });
});

describe('NavMenuBlock — sicurezza SSR (sito pubblico condiviso, ADR-22)', () => {
  it('renderToStaticMarkup non lancia e produce i link dei figli', () => {
    const html = renderToStaticMarkup(
      <NavMenuBlock>
        <NavMenuItemBlock label="Home" url="/" />
      </NavMenuBlock>,
    );

    expect(html).toContain('<nav');
    expect(html).toContain('<a');
    expect(html).toContain('href="/"');
  });
});
