import { toCss } from '../../../../src/blocks/compiler';
import {
  ToCssContext,
  ResolvedBreakpoint,
} from '../../../../src/blocks/compiler/css-declaration.types';
import { BackgroundPropSpec } from '../../../../src/blocks/prop-spec.types';

/**
 * Suite dedicata ad ADR-96 § "Conformità" punto 2: `backgroundToDeclarations()`
 * + `case 'background'` nel dispatcher `to-css.ts`, scope `type: 'none' |
 * 'color' | 'gradient'`. Matrice richiesta dall'ADR: `none`, `color` letterale,
 * `color` `{ref}`, `gradient` linear, `gradient` radial, stato `hover`,
 * breakpoint `tablet`.
 */

function bp(name: ResolvedBreakpoint['name'], mediaQuery?: string): ResolvedBreakpoint {
  return mediaQuery === undefined ? { name } : { name, mediaQuery };
}
function ctxDefault(blockId = 'b1'): ToCssContext {
  return { blockId, activeBreakpoints: [bp('default')] };
}

describe('toCss() — kind "background"', () => {
  // `plainSpec` non è `stateful`: il valore passato a `toCss()` è direttamente
  // il "valore nudo" (nessun involucro `{ normal: ... }`) — `normalizeStateEnvelope`
  // lo avvolge da sé nel ramo `normal` (`to-css.ts`).
  const plainSpec: BackgroundPropSpec = { kind: 'background', required: false };
  const statefulSpec: BackgroundPropSpec = { kind: 'background', required: false, stateful: true };

  it("type: 'none' non emette alcuna dichiarazione", () => {
    const blocks = toCss('background', plainSpec, { type: 'none' }, ctxDefault());
    expect(blocks).toEqual([]);
  });

  it("type: 'color' con valore letterale emette background-color con l'hex così com'è", () => {
    const blocks = toCss(
      'background',
      plainSpec,
      { type: 'color', color: '#1b5fa8' },
      ctxDefault(),
    );
    expect(blocks).toEqual([
      {
        selector: '[data-block="b1"]',
        mediaQuery: undefined,
        declarations: [{ property: 'background-color', value: '#1b5fa8' }],
      },
    ]);
  });

  it("type: 'color' con {ref} emette background-color come var(--gk-color-<id>)", () => {
    const blocks = toCss(
      'background',
      plainSpec,
      { type: 'color', color: { ref: 'primary' } },
      ctxDefault(),
    );
    expect(blocks[0].declarations).toEqual([
      { property: 'background-color', value: 'var(--gk-color-primary)' },
    ]);
  });

  it("type: 'gradient' linear emette background-image con linear-gradient", () => {
    const blocks = toCss(
      'background',
      plainSpec,
      {
        type: 'gradient',
        gradient: {
          type: 'linear',
          angle: 45,
          stops: [
            { color: '#ffffff', at: 0 },
            { color: { ref: 'accent' }, at: 100 },
          ],
        },
      },
      ctxDefault(),
    );
    expect(blocks[0].declarations).toEqual([
      {
        property: 'background-image',
        value: 'linear-gradient(45deg, #ffffff 0%, var(--gk-color-accent) 100%)',
      },
    ]);
  });

  it("type: 'gradient' radial emette background-image con radial-gradient", () => {
    const blocks = toCss(
      'background',
      plainSpec,
      {
        type: 'gradient',
        gradient: {
          type: 'radial',
          position: 'center center',
          stops: [
            { color: '#000000', at: 0 },
            { color: '#ffffff', at: 100 },
          ],
        },
      },
      ctxDefault(),
    );
    expect(blocks[0].declarations).toEqual([
      {
        property: 'background-image',
        value: 'radial-gradient(at center center, #000000 0%, #ffffff 100%)',
      },
    ]);
  });

  it('stato hover: emette un blocco separato con selettore :hover', () => {
    const blocks = toCss(
      'background',
      statefulSpec,
      {
        normal: { type: 'color', color: { ref: 'primary' } },
        hover: { type: 'color', color: '#1b5fa8' },
      },
      ctxDefault('b3'),
    );
    expect(blocks).toEqual([
      {
        selector: '[data-block="b3"]',
        mediaQuery: undefined,
        declarations: [{ property: 'background-color', value: 'var(--gk-color-primary)' }],
      },
      {
        selector: '[data-block="b3"]:hover',
        mediaQuery: undefined,
        declarations: [{ property: 'background-color', value: '#1b5fa8' }],
      },
    ]);
  });

  it('breakpoint tablet (responsive): emette un blocco separato con la media query del breakpoint attivo', () => {
    // `BackgroundPropSpec` non dichiara ancora `responsive` (fuori scope
    // ADR-96, che copre solo `stateful`): il dispatcher lo legge comunque
    // dinamicamente (`'responsive' in spec`, `to-css.ts`), da cui il cast qui.
    const responsiveSpec = {
      kind: 'background',
      required: false,
      responsive: true,
    } as BackgroundPropSpec;
    const blocks = toCss(
      'background',
      responsiveSpec,
      {
        default: { type: 'color', color: '#1b5fa8' },
        tablet: { type: 'color', color: '#ffffff' },
      },
      {
        blockId: 'b4',
        activeBreakpoints: [bp('default'), bp('tablet', '(max-width: 1024px)')],
      },
    );
    expect(blocks).toEqual([
      {
        selector: '[data-block="b4"]',
        mediaQuery: undefined,
        declarations: [{ property: 'background-color', value: '#1b5fa8' }],
      },
      {
        selector: '[data-block="b4"]',
        mediaQuery: '(max-width: 1024px)',
        declarations: [{ property: 'background-color', value: '#ffffff' }],
      },
    ]);
  });

  it("type: 'image'/'video'/'slideshow' non emettono alcuna dichiarazione (fuori scope ADR-96, nessuna eccezione)", () => {
    expect(toCss('background', plainSpec, { type: 'image' }, ctxDefault())).toEqual([]);
    expect(toCss('background', plainSpec, { type: 'video' }, ctxDefault())).toEqual([]);
    expect(toCss('background', plainSpec, { type: 'slideshow' }, ctxDefault())).toEqual([]);
  });
});
