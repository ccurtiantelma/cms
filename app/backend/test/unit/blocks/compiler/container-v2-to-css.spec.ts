import { toCss, shapeDividerToCssBlock } from '../../../../src/blocks/compiler';
import {
  ToCssContext,
  ResolvedBreakpoint,
} from '../../../../src/blocks/compiler/css-declaration.types';
import { LayoutPropSpec } from '../../../../src/blocks/prop-spec.types';

/**
 * Suite dedicata al Task 6 del Sub-Task S1.4 ("Container v2 unificato &
 * migrazioni v1→v2", ADR-82 § "Conseguenze"): i due branch nuovi del
 * compilatore `toCss()` — `layout.display: 'grid'` (proprietà Grid invece di
 * Flexbox) e `shapeDividerTop`/`shapeDividerBottom` (elemento decorativo
 * `::before`/`::after` con SVG inline).
 */

function bp(name: ResolvedBreakpoint['name'], mediaQuery?: string): ResolvedBreakpoint {
  return mediaQuery === undefined ? { name } : { name, mediaQuery };
}
function ctxDefault(blockId = 'b1'): ToCssContext {
  return { blockId, activeBreakpoints: [bp('default')] };
}

describe('toCss() — kind "layout"', () => {
  const spec: LayoutPropSpec = { kind: 'layout', required: false, responsive: true };

  it('display assente ricade su "flex": emette display/flex-direction/flex-wrap/justify-content/align-items', () => {
    const blocks = toCss(
      'layout',
      spec,
      { default: { direction: 'column', wrap: 'wrap', justify: 'center', align: 'flex-end' } },
      ctxDefault(),
    );
    expect(blocks).toEqual([
      {
        selector: '[data-block="b1"]',
        mediaQuery: undefined,
        declarations: [
          { property: 'display', value: 'flex' },
          { property: 'flex-direction', value: 'column' },
          { property: 'flex-wrap', value: 'wrap' },
          { property: 'justify-content', value: 'center' },
          { property: 'align-items', value: 'flex-end' },
        ],
      },
    ]);
  });

  it('display:"grid" con gridTemplateColumns a preset repeat emette le proprietà Grid, non quelle Flexbox', () => {
    const blocks = toCss(
      'layout',
      spec,
      {
        default: {
          display: 'grid',
          gridTemplateColumns: { preset: 'repeat', count: 3 },
          autoFlow: 'row',
          justifyItems: 'center',
          alignItems: 'stretch',
          justify: 'center', // proprietà flex-only: deve essere ignorata quando display è grid
        },
      },
      ctxDefault(),
    );
    expect(blocks[0].declarations).toEqual([
      { property: 'display', value: 'grid' },
      { property: 'grid-template-columns', value: 'repeat(3, 1fr)' },
      { property: 'grid-auto-flow', value: 'row' },
      { property: 'justify-items', value: 'center' },
      { property: 'align-items', value: 'stretch' },
    ]);
  });

  it('gridTemplateColumns come array di GridTrackValue emette una stringa spazio-separata (fr/px/%/auto)', () => {
    const blocks = toCss(
      'layout',
      spec,
      {
        default: {
          display: 'grid',
          gridTemplateColumns: [
            { value: 1, unit: 'fr' },
            { value: 200, unit: 'px' },
            'auto',
            { value: 30, unit: '%' },
          ],
        },
      },
      ctxDefault(),
    );
    expect(blocks[0].declarations).toContainEqual({
      property: 'grid-template-columns',
      value: '1fr 200px auto 30%',
    });
  });

  it('gridTemplateRows è emesso indipendentemente da gridTemplateColumns', () => {
    const blocks = toCss(
      'layout',
      spec,
      { default: { display: 'grid', gridTemplateRows: { preset: 'repeat', count: 2 } } },
      ctxDefault(),
    );
    expect(blocks[0].declarations).toContainEqual({
      property: 'grid-template-rows',
      value: 'repeat(2, 1fr)',
    });
  });

  it('gap emette sempre column-gap/row-gap, sia in flex sia in grid', () => {
    const blocks = toCss(
      'layout',
      spec,
      { default: { gap: { x: { value: 8, unit: 'px' }, y: { value: 16, unit: 'px' } } } },
      ctxDefault(),
    );
    expect(blocks[0].declarations).toContainEqual({ property: 'column-gap', value: '8px' });
    expect(blocks[0].declarations).toContainEqual({ property: 'row-gap', value: '16px' });
  });

  it("responsive sull'intero oggetto: un breakpoint attivo con solo alcuni campi produce un blocco separato con solo quei campi", () => {
    const blocks = toCss(
      'layout',
      spec,
      { default: { display: 'flex', direction: 'row' }, mobile: { direction: 'column' } },
      { blockId: 'b2', activeBreakpoints: [bp('default'), bp('mobile', '(max-width: 767px)')] },
    );
    expect(blocks).toHaveLength(2);
    expect(blocks[1]).toEqual({
      selector: '[data-block="b2"]',
      mediaQuery: '(max-width: 767px)',
      declarations: [
        { property: 'display', value: 'flex' },
        { property: 'flex-direction', value: 'column' },
      ],
    });
  });
});

describe('shapeDividerToCssBlock()', () => {
  it('produce un blocco su ::before per l\'edge "top" con background-image SVG data-uri', () => {
    const blocks = shapeDividerToCssBlock('b1', 'top', {
      style: 'wave',
      color: '#ffffff',
      width: { value: 100, unit: '%' },
      height: { value: 80, unit: 'px' },
      flip: false,
      invert: false,
      aboveContent: false,
    });
    expect(blocks).toHaveLength(1);
    expect(blocks[0].selector).toBe('[data-block="b1"]::before');
    const props = blocks[0].declarations.map((d) => d.property);
    expect(props).toEqual(
      expect.arrayContaining([
        'content',
        'position',
        'top',
        'left',
        'width',
        'height',
        'background-image',
        'z-index',
      ]),
    );
    const bgImage = blocks[0].declarations.find((d) => d.property === 'background-image');
    expect(bgImage?.value).toContain('data:image/svg+xml');
    expect(bgImage?.value).toContain('%23ffffff'); // '#' url-encoded
  });

  it('edge "bottom" usa ::after e la dichiarazione "bottom"', () => {
    const blocks = shapeDividerToCssBlock('b1', 'bottom', {
      style: 'triangles',
      color: { ref: 'accent' },
      width: { value: 100, unit: '%' },
      height: { value: 50, unit: 'px' },
      flip: true,
      invert: true,
      aboveContent: true,
    });
    expect(blocks[0].selector).toBe('[data-block="b1"]::after');
    expect(blocks[0].declarations).toContainEqual({ property: 'bottom', value: '0' });
    expect(blocks[0].declarations).toContainEqual({
      property: 'transform',
      value: 'scaleX(-1) scaleY(-1)',
    });
    expect(blocks[0].declarations).toContainEqual({ property: 'z-index', value: '2' });
  });

  it('un valore malformato produce un array vuoto (difensivo, stesso principio degli altri generatori)', () => {
    expect(shapeDividerToCssBlock('b1', 'top', null)).toEqual([]);
    expect(shapeDividerToCssBlock('b1', 'top', 'not-an-object')).toEqual([]);
  });
});
