/**
 * ADR-52: `navMenu` è composizione a children (non più `items: array`) — questi test
 * coprono solo il contenitore (toggle mobile checkbox-hack, montaggio dei figli). La
 * risoluzione URL/XSS/target/editable delle singole voci è coperta in
 * `NavMenuItemBlock.test.tsx`.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderToStaticMarkup } from 'react-dom/server';
import NavMenuBlock from './NavMenuBlock';
import NavMenuItemBlock from './NavMenuItemBlock';

/**
 * Lettura diretta da filesystem, non `import … from './NavMenuBlock.module.css?raw'`: sotto
 * Vitest (`vitest.config.ts`, `test.css: false`) qualunque import che termina in
 * `.module.css` risolve al Proxy di classi hashate a prescindere dalla query string — lo
 * stesso limite documentato in `style-tokens.test.ts`, non aggirabile con `?raw`.
 * `process.cwd()`, non `import.meta.url`: sotto `environment: 'jsdom'` quest'ultimo risolve
 * a un'origine fittizia del browser (`http://…`), non a un percorso `file://` reale.
 */
const navMenuCss = readFileSync(
  resolve(process.cwd(), 'src/components/blocks/blocks/NavMenuBlock.module.css'),
  'utf-8',
);

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

/**
 * Regressione "hamburger visibile anche su desktop": la causa reale non era l'assenza di un
 * breakpoint `@media`, ma `container-type: inline-size` applicato a un `<nav>` che nel layout
 * reale (`antelma-global-sections.seed.ts`, riga header) è un figlio flex a dimensionamento
 * shrink-to-fit — la size containment gli impedisce di usare il proprio contenuto per
 * calcolare la propria larghezza, che collassa vicino a zero e fa scattare sempre la query
 * mobile. Asserzioni sul CSS sorgente via import `?raw` (`test.css: false`, stesso limite
 * documentato in `Section.test.tsx`/`Container.test.tsx`): l'HTML reso non porta le regole.
 */
describe('NavMenuBlock — dimensionamento del container query (regressione desktop)', () => {
  it('.nav ha una base di dimensionamento definita (flex: 1 1 0%), non shrink-to-fit', () => {
    expect(navMenuCss).toMatch(/\.nav\s*{[^}]*flex:\s*1 1 0%;/s);
    expect(navMenuCss).toMatch(/\.nav\s*{[^}]*min-width:\s*0;/s);
  });

  it('resta un container query (ADR-52): niente breakpoint @media per l’hamburger', () => {
    expect(navMenuCss).toContain('container-type: inline-size');
    expect(navMenuCss).toContain('@container (max-width: 768px)');
    expect(navMenuCss).not.toMatch(/@media[^{]*\bmin-width:\s*1024px/);
    expect(navMenuCss).not.toMatch(/@media[^{]*\bmax-width:\s*1023px/);
  });
});
