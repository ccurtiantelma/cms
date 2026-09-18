import { compileGlobalKitCss } from '../../../src/settings/global-kit-css.compiler';
import { DEFAULT_GLOBAL_KIT } from '../../../src/settings/settings.service';
import { GlobalKitDto } from '../../../src/settings/dto/global-kit.dto';

/**
 * Suite dedicata al Sub-Task S1.3 (`docs/ai/specs/SPEC-GLOBAL-KIT.md` § 3):
 * `compileGlobalKitCss()` è una funzione pura, nessun I/O — copre l'algoritmo
 * di compilazione punti 1-5 (root vars, regole di tema, `@font-face`).
 */
describe('compileGlobalKitCss() (SPEC-GLOBAL-KIT.md § 3)', () => {
  it('emette un blocco :root con --gk-color-<id> per ogni colore, system e custom nello stesso ciclo', () => {
    const kit: GlobalKitDto = {
      ...DEFAULT_GLOBAL_KIT,
      colors: [
        ...DEFAULT_GLOBAL_KIT.colors,
        { id: '0123456789abcdef', label: 'Custom', value: '#ff00ff', system: false },
      ],
    };
    const css = compileGlobalKitCss(kit);
    expect(css).toContain(':root {');
    expect(css).toContain('--gk-color-primary: #1971c2;');
    expect(css).toContain('--gk-color-0123456789abcdef: #ff00ff;');
  });

  it('emette --gk-font-<id>-family/size per ogni font in fonts[]', () => {
    const css = compileGlobalKitCss(DEFAULT_GLOBAL_KIT);
    expect(css).toContain('--gk-font-primary-family: "inter";');
    expect(css).toContain('--gk-font-primary-size: 16px;');
  });

  it("un colorRef { ref } dentro themeStyle emette var(--gk-color-<id>), mai l'hex copiato", () => {
    const kit: GlobalKitDto = {
      ...DEFAULT_GLOBAL_KIT,
      themeStyle: {
        body: {
          typography: {},
          color: { ref: 'text' },
          background: '#ffffff',
        },
      },
    };
    const css = compileGlobalKitCss(kit);
    expect(css).toContain('body {');
    expect(css).toContain('color: var(--gk-color-text);');
    // Il letterale hex diretto resta un valore letterale (non è un gk var, superset ammesso).
    expect(css).toContain('background-color: #ffffff;');
  });

  it('themeStyle.link emette una regola "a" (normal) e una "a:hover" separata (ADR-75)', () => {
    const kit: GlobalKitDto = {
      ...DEFAULT_GLOBAL_KIT,
      themeStyle: {
        link: { color: { normal: { ref: 'primary' }, hover: { ref: 'accent' } } },
      },
    };
    const css = compileGlobalKitCss(kit);
    expect(css).toContain('a {\n  color: var(--gk-color-primary);\n}');
    expect(css).toContain('a:hover {\n  color: var(--gk-color-accent);\n}');
  });

  it('themeStyle non dichiarato (kit di default) produce comunque un CSS valido, senza righe vuote per gli elementi assenti', () => {
    const css = compileGlobalKitCss(DEFAULT_GLOBAL_KIT);
    expect(css).not.toContain('h1 {');
    expect(css).not.toContain('button, .cms-button {');
  });

  it('layout.defaultContainerPadding emette le 4 variabili --gk-layout-container-padding-*', () => {
    const css = compileGlobalKitCss(DEFAULT_GLOBAL_KIT);
    expect(css).toContain('--gk-layout-container-padding-top: 0px;');
    expect(css).toContain('--gk-layout-container-padding-right: 0px;');
    expect(css).toContain('--gk-layout-container-padding-bottom: 0px;');
    expect(css).toContain('--gk-layout-container-padding-left: 0px;');
  });

  it('lightbox.bgColor/uiColor letterali emettono --gk-lightbox-bg/--gk-lightbox-ui', () => {
    const css = compileGlobalKitCss(DEFAULT_GLOBAL_KIT);
    expect(css).toContain('--gk-lightbox-bg: #000000;');
    expect(css).toContain('--gk-lightbox-ui: #ffffff;');
  });

  it('customFonts[] emette un blocco @font-face per peso dichiarato, stesso ordine di weights/files', () => {
    const kit: GlobalKitDto = {
      ...DEFAULT_GLOBAL_KIT,
      customFonts: [
        {
          id: 'abcdefabcdefabcd',
          family: 'Acme',
          weights: ['400', '700'],
          files: [{ woff2: '1111111111111111' }, { woff2: '2222222222222222' }],
        },
      ],
    };
    const css = compileGlobalKitCss(kit);
    expect(css).toContain('font-family: "Acme";\n  font-weight: 400;');
    expect(css).toContain("src: url('/assets/media/1111111111111111.woff2') format('woff2');");
    expect(css).toContain('font-family: "Acme";\n  font-weight: 700;');
    expect(css).toContain("src: url('/assets/media/2222222222222222.woff2') format('woff2');");
  });

  it('nessuna emissione per customCode/customIcons (§ 3 punto 5)', () => {
    const kit: GlobalKitDto = {
      ...DEFAULT_GLOBAL_KIT,
      customCode: [
        {
          id: '3333333333333333',
          location: 'head',
          priority: 0,
          code: '<script>alert(1)</script>',
          conditions: {},
        },
      ],
      customIcons: [{ id: '4444444444444444', svgMediaRef: '5555555555555555', label: 'Icona' }],
    };
    const css = compileGlobalKitCss(kit);
    expect(css).not.toContain('alert(1)');
    expect(css).not.toContain('5555555555555555');
  });

  it('themeStyle.button emette background/color stateful (normal su "button, .cms-button", hover su la variante :hover)', () => {
    const kit: GlobalKitDto = {
      ...DEFAULT_GLOBAL_KIT,
      themeStyle: {
        button: {
          typography: {},
          background: { normal: { ref: 'primary' }, hover: { ref: 'accent' } },
          color: { normal: '#ffffff' },
          border: { width: 1, style: 'solid', color: { ref: 'primary' } },
          radius: { tl: 4, tr: 4, br: 4, bl: 4, unit: 'px', linked: true },
        },
      },
    };
    const css = compileGlobalKitCss(kit);
    expect(css).toContain('button, .cms-button {');
    expect(css).toContain('background-color: var(--gk-color-primary);');
    expect(css).toContain('color: #ffffff;');
    expect(css).toContain('border-radius: 4px 4px 4px 4px;');
    expect(css).toContain('button:hover, .cms-button:hover {');
    expect(css).toContain('background-color: var(--gk-color-accent);');
  });
});
