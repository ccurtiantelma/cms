import { describe, expect, it } from 'vitest';
import { DEFAULT_THEME_CONFIG, THEME_FONT_FAMILIES } from '../theme';
import { generateThemeCss } from './theme-css.utils';

/** Estrae le dichiarazioni del primo blocco emesso sul selettore dato. */
function declarationsOf(css: string, selector: string): string[] {
  const block = css.slice(css.indexOf(`${selector} {`));
  return block.slice(0, block.indexOf('\n}')).split('\n').slice(1);
}

describe('generateThemeCss', () => {
  it('emette la superficie --theme-* sul selettore richiesto', () => {
    const config = structuredClone(DEFAULT_THEME_CONFIG);
    config.colors.primary = '#123456';
    config.colors.danger = '#654321';
    config.scale = 1.1;

    const css = generateThemeCss(config, { selector: ':root' });
    const declarations = declarationsOf(css, ':root');

    expect(declarations).toContain('  --theme-primary: #123456;');
    expect(declarations).toContain('  --theme-danger: #654321;');
    expect(declarations).toContain('  --theme-scale: 1.1;');
    expect(declarations).toContain(
      `  --theme-font-family: ${THEME_FONT_FAMILIES[config.typography.fontFamily].stack};`,
    );
    expect(declarations).toContain(
      `  --theme-spacing-md: ${config.spacing.md}${config.spacingUnit};`,
    );
    expect(declarations).toContain(
      `  --theme-radius-md: ${config.radiusScale.md}${config.radiusScaleUnit};`,
    );
  });

  it('sovrascrive i token --cms-* dei blocchi coi valori del tema', () => {
    const config = structuredClone(DEFAULT_THEME_CONFIG);
    config.colors.primary = '#0055ff';
    config.colors.accent = '#ff0066';
    config.light.textPrimary = '#111111';
    config.light.textSecondary = '#777777';

    const declarations = declarationsOf(generateThemeCss(config, { selector: ':root' }), ':root');

    // È il ponte che rende visibile una modifica del tema sul contenuto salvato.
    expect(declarations).toContain('  --cms-button-bg: #0055ff;');
    expect(declarations).toContain('  --cms-text-color-accent: #ff0066;');
    expect(declarations).toContain('  --cms-text-color-default: #111111;');
    expect(declarations).toContain('  --cms-text-color-muted: #777777;');
    expect(declarations).toContain(`  --cms-space-lg: ${config.spacing.lg}${config.spacingUnit};`);
  });

  it('dipinge la superficie e i titoli, con i titoli a specificità zero', () => {
    const css = generateThemeCss(DEFAULT_THEME_CONFIG, { selector: ':root' });

    expect(css).toContain('  background-color: var(--theme-page-bg);');
    expect(css).toContain('  color: var(--theme-text-primary);');
    // `:where()` azzera la specificità: una scelta esplicita sul blocco vince sempre.
    expect(css).toContain(':where(:root) h1 {');
    expect(css).toContain('  font-size: var(--theme-h1-size);');
    expect(css).toContain('  color: var(--theme-heading-h1);');
  });

  it("con scheme 'auto' emette i token dark sotto prefers-color-scheme", () => {
    const config = structuredClone(DEFAULT_THEME_CONFIG);
    config.dark.pageBg = '#010203';

    const css = generateThemeCss(config, { selector: ':root', scheme: 'auto' });

    expect(css).toContain('@media (prefers-color-scheme: dark) {');
    expect(css).toContain('  --theme-page-bg: #010203;');
  });

  it("con scheme 'light' non emette alcuna media query", () => {
    const css = generateThemeCss(DEFAULT_THEME_CONFIG, {
      selector: '.canvas',
      scheme: 'light',
    });

    expect(css).not.toContain('@media');
    expect(css).toContain('.canvas {');
    expect(css).toContain(':where(.canvas) h6 {');
  });

  it('con scheme dark usa i token dark come base', () => {
    const config = structuredClone(DEFAULT_THEME_CONFIG);
    config.dark.textPrimary = '#fefefe';

    const declarations = declarationsOf(
      generateThemeCss(config, { selector: '.preview', scheme: 'dark' }),
      '.preview',
    );

    expect(declarations).toContain('  --theme-text-primary: #fefefe;');
    expect(declarations).toContain('  --cms-text-color-default: #fefefe;');
  });

  it('scarta i valori fuori contratto invece di emetterli verbatim', () => {
    // Il DTO è validato server-side, ma questo output finisce in un `<style>`:
    // un valore manomesso deve ricadere sul default, mai raggiungere il CSS.
    const config = structuredClone(DEFAULT_THEME_CONFIG) as unknown as Record<string, unknown>;
    (config.colors as Record<string, unknown>).primary = 'red; } body { display: none';
    (config as { spacingUnit: string }).spacingUnit = 'expression(alert(1))';

    const css = generateThemeCss(config as unknown as typeof DEFAULT_THEME_CONFIG, {
      selector: ':root',
    });

    expect(css).not.toContain('display: none');
    expect(css).not.toContain('expression');
    expect(css).toContain('  --theme-primary: #000000;');
  });

  it('non muta la configurazione sorgente', () => {
    const config = structuredClone(DEFAULT_THEME_CONFIG);
    const before = JSON.stringify(config);

    generateThemeCss(config, { selector: ':root' });

    expect(JSON.stringify(config)).toBe(before);
  });
});
