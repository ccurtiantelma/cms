/**
 * Unit test di `generateCanvasCss.ts` (Runtime Style Bridge, round R2 "parità Elementor Pro"):
 * usa i descrittori reali di `BLOCK_TYPES` (`button`/`container`/`heading`, `types/blocks.types.ts`,
 * ground truth generata dal registro backend) — nessun mock del registro, stesso principio già
 * in uso da `container-resize.utils.test.ts`/`ResizeHandle.test.tsx` per gli stessi motivi
 * (verificare contro la forma reale, non un doppio artificiale che potrebbe divergere).
 */
import { describe, expect, it } from 'vitest';
import {
  generateCanvasCss,
  type CanvasCssNode,
  type ResolvedBreakpoint,
} from './generateCanvasCss';

/** I tre breakpoint di default di ADR-76 § "Decisione" punto 1 (`tablet`/`mobile` attivi). */
const DEFAULT_ACTIVE: ResolvedBreakpoint[] = [
  { name: 'default' },
  { name: 'tablet', mediaQuery: '(max-width: 1024px)' },
  { name: 'mobile', mediaQuery: '(max-width: 767px)' },
];

function leaf(id: string, type: string, props: Record<string, unknown> = {}): CanvasCssNode {
  return { id, type, props, children: [] };
}

describe('generateCanvasCss', () => {
  describe('stato hover su breakpoint tablet (ADR-75 + ADR-76)', () => {
    it('button.color: normal/default + hover/default + hover/tablet producono tre regole, ordine stato→breakpoint', () => {
      const tree: CanvasCssNode[] = [
        leaf('btn1', 'button', {
          label: 'Vai',
          color: {
            normal: { default: '#111111' },
            hover: { default: '#ffffff', tablet: '#eeeeee' },
          },
        }),
      ];

      const css = generateCanvasCss(tree, DEFAULT_ACTIVE);

      expect(css).toContain('[data-canvas-style-id="btn1"] { color: #111111; }');
      expect(css).toContain('[data-canvas-style-id="btn1"]:hover { color: #ffffff; }');
      expect(css).toContain(
        '@media (max-width: 1024px) { [data-canvas-style-id="btn1"]:hover { color: #eeeeee; } }',
      );
      // Ordine: normal prima di hover (§ 10 punto 2), non l'ordine di inserimento dell'oggetto.
      const normalIndex = css.indexOf('[data-canvas-style-id="btn1"] { color: #111111; }');
      const hoverIndex = css.indexOf('[data-canvas-style-id="btn1"]:hover');
      expect(normalIndex).toBeGreaterThanOrEqual(0);
      expect(hoverIndex).toBeGreaterThan(normalIndex);
    });

    it('un breakpoint noto ma non attivo per il sito non produce alcuna regola (ADR-76 § "Decisione" punto 4)', () => {
      const tree: CanvasCssNode[] = [
        leaf('btn2', 'button', {
          color: { normal: { default: '#111111', laptop: '#222222' } },
        }),
      ];
      // `laptop` non è fra gli attivi di DEFAULT_ACTIVE.
      const css = generateCanvasCss(tree, DEFAULT_ACTIVE);

      expect(css).toContain('#111111');
      expect(css).not.toContain('#222222');
      expect(css).not.toContain('laptop');
    });
  });

  describe('cascata breakpoint (ADR-29/ADR-76)', () => {
    it('spacing responsive su tre breakpoint attivi produce tre regole distinte', () => {
      const tree: CanvasCssNode[] = [
        leaf('cnt1', 'container', {
          padding: {
            default: { top: 32, right: 32, bottom: 32, left: 32, unit: 'px', linked: true },
            tablet: { top: 16, right: 16, bottom: 16, left: 16, unit: 'px', linked: true },
            mobile: { top: 8, right: 8, bottom: 8, left: 8, unit: 'px', linked: true },
          },
        }),
      ];

      const css = generateCanvasCss(tree, DEFAULT_ACTIVE);

      expect(css).toContain(
        '[data-canvas-style-id="cnt1"] { padding-top: 32px; padding-right: 32px; padding-bottom: 32px; padding-left: 32px; }',
      );
      expect(css).toContain('@media (max-width: 1024px)');
      expect(css).toContain('padding-top: 16px');
      expect(css).toContain('@media (max-width: 767px)');
      expect(css).toContain('padding-top: 8px');
    });

    it('margin (stesso kind spacing, target diverso) emette margin-*, mai padding-*', () => {
      const tree: CanvasCssNode[] = [
        leaf('btn3', 'button', {
          margin: { default: { top: 4, right: 0, bottom: 4, left: 0, unit: 'px', linked: false } },
        }),
      ];

      const css = generateCanvasCss(tree, DEFAULT_ACTIVE);

      expect(css).toContain('margin-top: 4px');
      expect(css).not.toContain('padding-top');
    });
  });

  describe('kind fuori scope: ignorato silenziosamente (debito ADR-82 § "Conseguenze")', () => {
    it('container.background (kind: background, non implementato) non produce alcuna dichiarazione, il resto sì', () => {
      const tree: CanvasCssNode[] = [
        leaf('cnt2', 'container', {
          background: { type: 'color', color: '#000000' },
          radius: { tl: 8, tr: 8, br: 8, bl: 8, unit: 'px' },
        }),
      ];

      expect(() => generateCanvasCss(tree, DEFAULT_ACTIVE)).not.toThrow();
      const css = generateCanvasCss(tree, DEFAULT_ACTIVE);

      expect(css).not.toContain('#000000');
      expect(css).not.toContain('background');
      expect(css).toContain('border-radius: 8px 8px 8px 8px;');
    });

    it('un tipo di nodo sconosciuto non fa crashare la generazione (tolleranza di rendering)', () => {
      const tree: CanvasCssNode[] = [leaf('x1', 'tipo-inesistente', { color: '#fff' })];

      expect(() => generateCanvasCss(tree, DEFAULT_ACTIVE)).not.toThrow();
      expect(generateCanvasCss(tree, DEFAULT_ACTIVE)).toBe('');
    });
  });

  describe('selettore e media query', () => {
    it('breakpoint "default": nessuna media query (valore scalare "malformato" su una prop stateful, tollerato come ramo `normal` — stessa difesa del compilatore backend, `to-css.ts`)', () => {
      const tree: CanvasCssNode[] = [leaf('h1', 'heading', { color: '#123456' })];
      const css = generateCanvasCss(tree, DEFAULT_ACTIVE);

      expect(css).toBe('[data-canvas-style-id="h1"] { color: #123456; }');
    });

    it("colorRef con { ref } emette la custom property Global Kit, mai l'id letterale come colore", () => {
      // `heading.color` è `stateful: true` (ADR-75): il valore nudo va nell'envelope `normal`.
      const tree: CanvasCssNode[] = [
        leaf('h2', 'heading', { color: { normal: { default: { ref: 'primary' } } } }),
      ];
      const css = generateCanvasCss(tree, DEFAULT_ACTIVE);

      expect(css).toContain('color: var(--gk-color-primary);');
    });
  });

  describe('typography: responsive per campo (SPEC-PROPKIND-V2-DETAILS.md § 3 punto 3)', () => {
    it('fontSize responsive + fontWeight scalare: due breakpoint diversi solo su fontSize', () => {
      // `heading.typography` è `stateful: true` (ADR-75): il valore nudo va nell'envelope `normal`;
      // dentro `normal`, `responsive` opera per campo (§ 3 punto 3), non sull'intero oggetto.
      const tree: CanvasCssNode[] = [
        leaf('h3', 'heading', {
          typography: {
            normal: {
              fontSize: { default: { value: 32, unit: 'px' }, mobile: { value: 22, unit: 'px' } },
              fontWeight: '700',
            },
          },
        }),
      ];

      const css = generateCanvasCss(tree, DEFAULT_ACTIVE);

      expect(css).toContain('[data-canvas-style-id="h3"] { font-size: 32px; font-weight: 700; }');
      expect(css).toContain(
        '@media (max-width: 767px) { [data-canvas-style-id="h3"] { font-size: 22px; } }',
      );
    });

    it('fontFamily { ref } dentro typography risolve alla stessa custom property di un fontRef di primo livello', () => {
      const tree: CanvasCssNode[] = [
        leaf('h4', 'heading', {
          typography: { normal: { fontFamily: { ref: 'secondary' } } },
        }),
      ];

      const css = generateCanvasCss(tree, DEFAULT_ACTIVE);
      expect(css).toContain('font-family: var(--gk-font-secondary-family);');
    });
  });

  describe('layout (container v2, ADR-82): Flexbox e Grid 12 colonne', () => {
    it('display assente → ricade su "flex", emette le proprietà flex', () => {
      const tree: CanvasCssNode[] = [
        leaf('cnt3', 'container', { layout: { direction: 'column', justify: 'center' } }),
      ];
      const css = generateCanvasCss(tree, DEFAULT_ACTIVE);

      expect(css).toContain('display: flex');
      expect(css).toContain('flex-direction: column');
      expect(css).toContain('justify-content: center');
      expect(css).not.toContain('grid-template-columns');
    });

    it('display: "grid" con preset repeat 12 colonne → grid-template-columns: repeat(12, 1fr), mai le proprietà flex', () => {
      const tree: CanvasCssNode[] = [
        leaf('cnt4', 'container', {
          layout: { display: 'grid', gridTemplateColumns: { preset: 'repeat', count: 12 } },
        }),
      ];
      const css = generateCanvasCss(tree, DEFAULT_ACTIVE);

      expect(css).toContain('display: grid');
      expect(css).toContain('grid-template-columns: repeat(12, 1fr)');
      expect(css).not.toContain('flex-direction');
    });

    it('layout è responsive sull\'intero oggetto (ADR-82 § "Decisione" punto 1): due breakpoint, due regole', () => {
      const tree: CanvasCssNode[] = [
        leaf('cnt5', 'container', {
          layout: {
            default: { display: 'grid', gridTemplateColumns: { preset: 'repeat', count: 12 } },
            mobile: { display: 'flex', direction: 'column' },
          },
        }),
      ];
      const css = generateCanvasCss(tree, DEFAULT_ACTIVE);

      expect(css).toContain(
        '[data-canvas-style-id="cnt5"] { display: grid; grid-template-columns: repeat(12, 1fr); }',
      );
      expect(css).toContain(
        '@media (max-width: 767px) { [data-canvas-style-id="cnt5"] { display: flex; flex-direction: column; } }',
      );
    });

    it('gap emette sempre column-gap/row-gap, indipendentemente dal display', () => {
      const tree: CanvasCssNode[] = [
        leaf('cnt6', 'container', {
          layout: { gap: { x: { value: 16, unit: 'px' }, y: { value: 8, unit: 'px' } } },
        }),
      ];
      const css = generateCanvasCss(tree, DEFAULT_ACTIVE);

      expect(css).toContain('column-gap: 16px');
      expect(css).toContain('row-gap: 8px');
    });
  });

  describe("ordine di emissione: profondità dell'albero, genitore prima dei figli", () => {
    it('un container con un button figlio emette prima le regole del genitore, poi quelle del figlio', () => {
      const tree: CanvasCssNode[] = [
        {
          id: 'parent',
          type: 'container',
          props: { radius: { tl: 4, tr: 4, br: 4, bl: 4, unit: 'px' } },
          children: [leaf('child', 'button', { color: '#010101' })],
        },
      ];
      const css = generateCanvasCss(tree, DEFAULT_ACTIVE);

      const parentIndex = css.indexOf('data-canvas-style-id="parent"');
      const childIndex = css.indexOf('data-canvas-style-id="child"');
      expect(parentIndex).toBeGreaterThanOrEqual(0);
      expect(childIndex).toBeGreaterThan(parentIndex);
    });
  });

  it('valore assente per una prop dichiarata: nessuna regola emessa, nessun errore', () => {
    const tree: CanvasCssNode[] = [leaf('h5', 'heading', {})];
    expect(() => generateCanvasCss(tree, DEFAULT_ACTIVE)).not.toThrow();
    expect(generateCanvasCss(tree, DEFAULT_ACTIVE)).toBe('');
  });

  it('albero vuoto → stringa vuota', () => {
    expect(generateCanvasCss([], DEFAULT_ACTIVE)).toBe('');
  });
});
