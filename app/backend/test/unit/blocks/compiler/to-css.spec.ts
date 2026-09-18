import { toCss } from '../../../../src/blocks/compiler';
import {
  CssDeclarationBlock,
  ResolvedBreakpoint,
  ToCssContext,
} from '../../../../src/blocks/compiler/css-declaration.types';
import {
  ColorPropSpec,
  ColorRefPropSpec,
  FilterPropSpec,
  FontRefPropSpec,
  GradientPropSpec,
  PositionPropSpec,
  PropSpec,
  RadiusPropSpec,
  SpacingPropSpec,
  TransformPropSpec,
  TypographyPropSpec,
} from '../../../../src/blocks/prop-spec.types';

/**
 * Suite dedicata al Sub-Task S1.2 ("Compilatore CSS server-side `toCss()`",
 * `docs/ai/specs/SPEC-PROPKIND-V2-DETAILS.md` § 10, ADR-74–ADR-77 round R0):
 * copre i nove `kind` PropKind v2 (`colorRef`, `fontRef`, `typography`,
 * `spacing`, `radius`, `gradient`, `position`, `transform`, `filter`), gli
 * esempi letterali del documento, il determinismo combinatorio stato×breakpoint
 * (ADR-75 § "Decisione" punto 2, ADR-76 § "Decisione" punto 1/3/4) e il
 * comportamento sui `kind` fuori scope. Non tocca `block-tree-validator.*`
 * (già coperto da `block-tree-validator.propkind-v2.spec.ts`).
 */

// ─── Helpers di test ────────────────────────────────────────────────────

/** Costruisce un `ResolvedBreakpoint` (ADR-76 § "Decisione" punto 1). */
function bp(name: ResolvedBreakpoint['name'], mediaQuery?: string): ResolvedBreakpoint {
  return mediaQuery === undefined ? { name } : { name, mediaQuery };
}

/** Soglie di default ADR-76 § "Decisione" punto 1, usate solo per costruire fixture di test. */
const MEDIA = {
  widescreen: '(min-width: 2400px)',
  laptop: '(max-width: 1366px)',
  tabletExtra: '(max-width: 1200px)',
  tablet: '(max-width: 1024px)',
  mobileExtra: '(max-width: 880px)',
  mobile: '(max-width: 767px)',
} as const;

/** Contesto di compilazione minimo: un solo breakpoint attivo, `default`. */
function ctxDefault(blockId = 'b1'): ToCssContext {
  return { blockId, activeBreakpoints: [bp('default')] };
}

/**
 * Serializzatore CSS locale al test, usato **solo** per confrontare byte-per-byte
 * con gli esempi letterali di `SPEC-PROPKIND-V2-DETAILS.md` § 10 — non è (e non
 * sostituisce) un renderer di produzione: `toCss()` restituisce sempre e solo
 * `CssDeclarationBlock[]` strutturati, mai testo CSS.
 */
function renderBlocksToCss(blocks: CssDeclarationBlock[]): string {
  return blocks
    .map((block) => {
      const declLine = block.declarations.map((d) => `${d.property}: ${d.value};`).join(' ');
      const rule = `${block.selector} { ${declLine} }`;
      return block.mediaQuery ? `@media ${block.mediaQuery} { ${rule} }` : rule;
    })
    .join('\n');
}

// ─── colorRef (SPEC-PROPKIND-V2-DETAILS.md § 1) ────────────────────────────

describe('toCss() — kind "colorRef"', () => {
  const specBg: ColorRefPropSpec = {
    kind: 'colorRef',
    required: false,
    cssProperty: 'background-color',
  };
  const specColor: ColorRefPropSpec = { kind: 'colorRef', required: false, cssProperty: 'color' };

  it('valore minimo: hex a 3 cifre emette una dichiarazione sulla proprietà dichiarata da spec.cssProperty', () => {
    const result = toCss('colorRef', specBg, '#fff', ctxDefault());
    expect(result).toEqual([
      {
        selector: '[data-block="b1"]',
        mediaQuery: undefined,
        declarations: [{ property: 'background-color', value: '#fff' }],
      },
    ]);
  });

  it('valore hex a 6 cifre è emesso letteralmente, invariato', () => {
    const result = toCss('colorRef', specBg, '#1b5fa8', ctxDefault());
    expect(result[0].declarations).toEqual([{ property: 'background-color', value: '#1b5fa8' }]);
  });

  it('{ ref } non emette mai il valore letterale: emette var(--gk-color-<id>)', () => {
    const result = toCss('colorRef', specBg, { ref: 'primary' }, ctxDefault());
    expect(result[0].declarations).toEqual([
      { property: 'background-color', value: 'var(--gk-color-primary)' },
    ]);
  });

  it('{ ref } verso un guid 16 hex (non un id system) emette comunque var(--gk-color-<id>)', () => {
    const result = toCss('colorRef', specBg, { ref: '0123456789abcdef' }, ctxDefault());
    expect(result[0].declarations).toEqual([
      { property: 'background-color', value: 'var(--gk-color-0123456789abcdef)' },
    ]);
  });

  it('spec.cssProperty determina la proprietà emessa: stesso valore, due cssProperty diverse → cambia solo la proprietà', () => {
    const value = { ref: 'accent' };
    const resultBg = toCss('colorRef', specBg, value, ctxDefault());
    const resultColor = toCss('colorRef', specColor, value, ctxDefault());
    expect(resultBg[0].declarations).toEqual([
      { property: 'background-color', value: 'var(--gk-color-accent)' },
    ]);
    expect(resultColor[0].declarations).toEqual([
      { property: 'color', value: 'var(--gk-color-accent)' },
    ]);
    // Stesso valore risolto, sola proprietà differente.
    expect(resultBg[0].declarations[0].value).toBe(resultColor[0].declarations[0].value);
    expect(resultBg[0].declarations[0].property).not.toBe(resultColor[0].declarations[0].property);
  });
});

// ─── fontRef (SPEC-PROPKIND-V2-DETAILS.md § 2) ─────────────────────────────

describe('toCss() — kind "fontRef"', () => {
  const spec: FontRefPropSpec = { kind: 'fontRef', required: false };

  it("valore minimo: { ref } emette var(--gk-font-<id>-family), mai l'id letterale", () => {
    const result = toCss('fontRef', spec, { ref: 'primary' }, ctxDefault());
    expect(result).toEqual([
      {
        selector: '[data-block="b1"]',
        mediaQuery: undefined,
        declarations: [{ property: 'font-family', value: 'var(--gk-font-primary-family)' }],
      },
    ]);
  });

  it('{ family (senza spazio), source: "system" } emette la family letterale, non racchiusa fra apici', () => {
    const result = toCss('fontRef', spec, { family: 'inter', source: 'system' }, ctxDefault());
    expect(result[0].declarations).toEqual([{ property: 'font-family', value: 'inter' }]);
  });

  it('{ family (con spazio), source: "google" } racchiude la family fra doppi apici', () => {
    const result = toCss('fontRef', spec, { family: 'Open Sans', source: 'google' }, ctxDefault());
    expect(result[0].declarations).toEqual([{ property: 'font-family', value: '"Open Sans"' }]);
  });
});

// ─── typography (SPEC-PROPKIND-V2-DETAILS.md § 3) ──────────────────────────

describe('toCss() — kind "typography"', () => {
  const spec: TypographyPropSpec = { kind: 'typography', required: false };
  const specResponsive: TypographyPropSpec = {
    kind: 'typography',
    required: false,
    responsive: true,
  };

  it('valore minimo {} (nessun campo) non produce alcun blocco', () => {
    const result = toCss('typography', spec, {}, ctxDefault());
    expect(result).toEqual([]);
  });

  it("valore con tutti e 9 i campi popolati emette una dichiarazione per campo, nell'ordine dell'interfaccia", () => {
    const value = {
      fontFamily: { family: 'Open Sans', source: 'google' },
      fontSize: { value: 32, unit: 'px' },
      fontWeight: '700',
      textTransform: 'uppercase',
      fontStyle: 'italic',
      textDecoration: 'underline',
      lineHeight: { value: 1.4, unit: 'em' },
      letterSpacing: { value: 2, unit: 'px' },
      wordSpacing: { value: 4, unit: 'px' },
    };
    const result = toCss('typography', spec, value, ctxDefault());
    expect(result).toEqual([
      {
        selector: '[data-block="b1"]',
        mediaQuery: undefined,
        declarations: [
          { property: 'font-family', value: '"Open Sans"' },
          { property: 'font-size', value: '32px' },
          { property: 'font-weight', value: '700' },
          { property: 'text-transform', value: 'uppercase' },
          { property: 'font-style', value: 'italic' },
          { property: 'text-decoration', value: 'underline' },
          { property: 'line-height', value: '1.4em' },
          { property: 'letter-spacing', value: '2px' },
          { property: 'word-spacing', value: '4px' },
        ],
      },
    ]);
  });

  it('responsive per campo: fontSize con envelope {default, mobile} produce due blocchi su breakpoint diversi; fontWeight (naked) resta solo su "default"', () => {
    const value = {
      fontSize: { default: { value: 32, unit: 'px' }, mobile: { value: 22, unit: 'px' } },
      fontWeight: '700',
    };
    const ctx: ToCssContext = {
      blockId: 'b7',
      activeBreakpoints: [bp('default'), bp('mobile', MEDIA.mobile)],
    };
    const result = toCss('typography', specResponsive, value, ctx);
    expect(result).toEqual([
      {
        selector: '[data-block="b7"]',
        mediaQuery: undefined,
        declarations: [
          { property: 'font-size', value: '32px' },
          { property: 'font-weight', value: '700' },
        ],
      },
      {
        selector: '[data-block="b7"]',
        mediaQuery: MEDIA.mobile,
        declarations: [{ property: 'font-size', value: '22px' }],
      },
    ]);
  });
});

// ─── spacing (SPEC-PROPKIND-V2-DETAILS.md § 4, Addendum S1.2) ─────────────

describe('toCss() — kind "spacing"', () => {
  const specPadding: SpacingPropSpec = {
    kind: 'spacing',
    required: false,
    units: ['px', '%'],
    min: 0,
    max: 96,
    target: 'padding',
  };
  const specMargin: SpacingPropSpec = { ...specPadding, target: 'margin' };

  it('valore minimo (tutti i lati a 0) emette le quattro dichiarazioni sul lato "padding"', () => {
    const value = { top: 0, right: 0, bottom: 0, left: 0, unit: 'px', linked: false };
    const result = toCss('spacing', specPadding, value, ctxDefault());
    expect(result).toEqual([
      {
        selector: '[data-block="b1"]',
        mediaQuery: undefined,
        declarations: [
          { property: 'padding-top', value: '0px' },
          { property: 'padding-right', value: '0px' },
          { property: 'padding-bottom', value: '0px' },
          { property: 'padding-left', value: '0px' },
        ],
      },
    ]);
  });

  it('valore con quattro lati diversi e unit "%" emette top,right,bottom,left nell\'ordine dichiarato', () => {
    const value = { top: 8, right: 16, bottom: 24, left: 32, unit: '%', linked: true };
    const result = toCss('spacing', specPadding, value, ctxDefault());
    expect(result[0].declarations).toEqual([
      { property: 'padding-top', value: '8%' },
      { property: 'padding-right', value: '16%' },
      { property: 'padding-bottom', value: '24%' },
      { property: 'padding-left', value: '32%' },
    ]);
  });

  it('spec.target determina il lato emesso: stesso valore, target "padding" vs "margin" → cambia solo il prefisso', () => {
    const value = { top: 8, right: 8, bottom: 8, left: 8, unit: 'px', linked: true };
    const resultPadding = toCss('spacing', specPadding, value, ctxDefault());
    const resultMargin = toCss('spacing', specMargin, value, ctxDefault());
    expect(resultPadding[0].declarations.map((d) => d.property)).toEqual([
      'padding-top',
      'padding-right',
      'padding-bottom',
      'padding-left',
    ]);
    expect(resultMargin[0].declarations.map((d) => d.property)).toEqual([
      'margin-top',
      'margin-right',
      'margin-bottom',
      'margin-left',
    ]);
    // Stessi valori numerici, solo il prefisso di proprietà cambia.
    expect(resultPadding[0].declarations.map((d) => d.value)).toEqual(
      resultMargin[0].declarations.map((d) => d.value),
    );
  });
});

// ─── radius (SPEC-PROPKIND-V2-DETAILS.md § 5) ──────────────────────────────

describe('toCss() — kind "radius"', () => {
  const spec: RadiusPropSpec = { kind: 'radius', required: false };

  it('valore minimo (tutti gli angoli a 0) emette lo shorthand border-radius a 4 zeri', () => {
    const value = { tl: 0, tr: 0, br: 0, bl: 0, unit: 'px' };
    const result = toCss('radius', spec, value, ctxDefault());
    expect(result).toEqual([
      {
        selector: '[data-block="b1"]',
        mediaQuery: undefined,
        declarations: [{ property: 'border-radius', value: '0px 0px 0px 0px' }],
      },
    ]);
  });

  it('valore con quattro angoli diversi e unit "%" emette lo shorthand nell\'ordine tl,tr,br,bl', () => {
    const value = { tl: 10, tr: 20, br: 30, bl: 40, unit: '%' };
    const result = toCss('radius', spec, value, ctxDefault());
    expect(result[0].declarations).toEqual([
      { property: 'border-radius', value: '10% 20% 30% 40%' },
    ]);
  });
});

// ─── gradient (SPEC-PROPKIND-V2-DETAILS.md § 6) ────────────────────────────

describe('toCss() — kind "gradient"', () => {
  const spec: GradientPropSpec = { kind: 'gradient', required: false };

  it('valore minimo: type "linear" senza "angle" applica il default 180deg (§ 6 punto 2)', () => {
    const value = {
      type: 'linear',
      stops: [
        { color: '#fff', at: 0 },
        { color: '#000', at: 100 },
      ],
    };
    const result = toCss('gradient', spec, value, ctxDefault());
    expect(result[0].declarations).toEqual([
      { property: 'background-image', value: 'linear-gradient(180deg, #fff 0%, #000 100%)' },
    ]);
  });

  it('valore con tutti i campi opzionali popolati (angle esplicito, stop { ref }) emette il gradiente completo', () => {
    const value = {
      type: 'linear',
      angle: 45,
      stops: [
        { color: { ref: 'accent' }, at: 0 },
        { color: '#000', at: 50 },
        { color: '#fff', at: 100 },
      ],
    };
    const result = toCss('gradient', spec, value, ctxDefault());
    expect(result[0].declarations).toEqual([
      {
        property: 'background-image',
        value: 'linear-gradient(45deg, var(--gk-color-accent) 0%, #000 50%, #fff 100%)',
      },
    ]);
  });

  it('type "radial" con "position" emette la clausola "at <position>"', () => {
    const value = {
      type: 'radial',
      position: 'top left',
      stops: [
        { color: '#fff', at: 0 },
        { color: '#000', at: 100 },
      ],
    };
    const result = toCss('gradient', spec, value, ctxDefault());
    expect(result[0].declarations).toEqual([
      { property: 'background-image', value: 'radial-gradient(at top left, #fff 0%, #000 100%)' },
    ]);
  });
});

// ─── position (SPEC-PROPKIND-V2-DETAILS.md § 7) ────────────────────────────

describe('toCss() — kind "position"', () => {
  const spec: PositionPropSpec = { kind: 'position', required: false };

  it('valore minimo: type "default" mappa al valore CSS iniziale "static", nessun\'altra dichiarazione', () => {
    const result = toCss('position', spec, { type: 'default' }, ctxDefault());
    expect(result).toEqual([
      {
        selector: '[data-block="b1"]',
        mediaQuery: undefined,
        declarations: [{ property: 'position', value: 'static' }],
      },
    ]);
  });

  it('valore con tutti i campi opzionali popolati (offset 4 lati, zIndex, sticky) emette tutte le dichiarazioni attese, nessuna deduplicazione', () => {
    const value = {
      type: 'sticky',
      offset: {
        top: { value: 10, unit: 'px' },
        right: { value: 5, unit: '%' },
        bottom: { value: 0, unit: 'px' },
        left: { value: -5, unit: 'vw' },
      },
      zIndex: 100,
      sticky: {
        edge: 'top',
        offset: { value: 20, unit: 'px' },
        onBreakpoints: ['tablet'],
        stayInParent: true,
      },
    };
    const result = toCss('position', spec, value, ctxDefault());
    expect(result[0].declarations).toEqual([
      { property: 'position', value: 'sticky' },
      { property: 'top', value: '10px' },
      { property: 'right', value: '5%' },
      { property: 'bottom', value: '0px' },
      { property: 'left', value: '-5vw' },
      { property: 'z-index', value: '100' },
      // `sticky.edge === 'top'`: seconda dichiarazione "top", non deduplicata (§ 10 punto 6).
      { property: 'top', value: '20px' },
    ]);
  });
});

// ─── transform (SPEC-PROPKIND-V2-DETAILS.md § 8) ───────────────────────────

describe('toCss() — kind "transform"', () => {
  const spec: TransformPropSpec = { kind: 'transform', required: false };

  it('valore minimo {} non produce alcuna dichiarazione (nessun blocco emesso)', () => {
    const result = toCss('transform', spec, {}, ctxDefault());
    expect(result).toEqual([]);
  });

  it('valore con tutti i campi opzionali popolati emette lo shorthand transform + transform-origin; flipH inverte il segno di scaleX', () => {
    const value = {
      rotate: 45,
      scale: 1.2,
      skewX: 10,
      skewY: -10,
      translateX: { value: 20, unit: 'px' },
      translateY: { value: -10, unit: '%' },
      flipH: true,
      flipV: false,
      origin: 'top left',
    };
    const result = toCss('transform', spec, value, ctxDefault());
    expect(result[0].declarations).toEqual([
      {
        property: 'transform',
        value: 'translate(20px, -10%) rotate(45deg) scale(-1.2, 1.2) skewX(10deg) skewY(-10deg)',
      },
      { property: 'transform-origin', value: 'top left' },
    ]);
  });
});

// ─── filter (SPEC-PROPKIND-V2-DETAILS.md § 9) ──────────────────────────────

describe('toCss() — kind "filter"', () => {
  const spec: FilterPropSpec = { kind: 'filter', required: false };

  it('valore minimo {} non produce alcuna dichiarazione (nessun blocco emesso)', () => {
    const result = toCss('filter', spec, {}, ctxDefault());
    expect(result).toEqual([]);
  });

  it('valore con tutti i campi opzionali popolati emette lo shorthand filter + mix-blend-mode', () => {
    const value = {
      blur: 5,
      brightness: 120,
      contrast: 90,
      saturate: 150,
      hue: 45,
      grayscale: 20,
      blend: 'multiply',
    };
    const result = toCss('filter', spec, value, ctxDefault());
    expect(result[0].declarations).toEqual([
      {
        property: 'filter',
        value:
          'blur(5px) brightness(120%) contrast(90%) saturate(150%) hue-rotate(45deg) grayscale(20%)',
      },
      { property: 'mix-blend-mode', value: 'multiply' },
    ]);
  });
});

// ─── Snapshot letterali § 10 ────────────────────────────────────────────────

describe('toCss() — snapshot esempi letterali di SPEC-PROPKIND-V2-DETAILS.md § 10', () => {
  it("styleBackground (colorRef, stateful + responsive) coincide esattamente con l'esempio del documento", () => {
    // Il valore letterale del documento porta un envelope { default: ... }
    // dentro ogni stato: la prop è quindi anche `responsive: true` (ADR-75 §
    // "Decisione" punto 2, ordine stato → breakpoint → valore), anche se solo
    // "default" è popolato per ciascuno stato (tablet/mobile restano opzionali,
    // ADR-29 § 2).
    const spec: ColorRefPropSpec = {
      kind: 'colorRef',
      required: false,
      stateful: true,
      responsive: true,
      cssProperty: 'background-color',
    };
    const value = {
      normal: { default: { ref: 'primary' } },
      hover: { default: '#1b5fa8' },
    };
    const ctx: ToCssContext = { blockId: 'b3', activeBreakpoints: [bp('default')] };
    const result = toCss('colorRef', spec, value, ctx);

    expect(result).toEqual([
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
    expect(renderBlocksToCss(result)).toBe(
      '[data-block="b3"] { background-color: var(--gk-color-primary); }\n' +
        '[data-block="b3"]:hover { background-color: #1b5fa8; }',
    );
  });

  it("styleFontSize (typography, responsive per campo) coincide esattamente con l'esempio del documento", () => {
    const spec: TypographyPropSpec = { kind: 'typography', required: false, responsive: true };
    const value = {
      fontSize: { default: { value: 32, unit: 'px' }, mobile: { value: 22, unit: 'px' } },
    };
    const ctx: ToCssContext = {
      blockId: 'b7',
      activeBreakpoints: [bp('default'), bp('mobile', MEDIA.mobile)],
    };
    const result = toCss('typography', spec, value, ctx);

    expect(result).toEqual([
      {
        selector: '[data-block="b7"]',
        mediaQuery: undefined,
        declarations: [{ property: 'font-size', value: '32px' }],
      },
      {
        selector: '[data-block="b7"]',
        mediaQuery: '(max-width: 767px)',
        declarations: [{ property: 'font-size', value: '22px' }],
      },
    ]);
    expect(renderBlocksToCss(result)).toBe(
      '[data-block="b7"] { font-size: 32px; }\n' +
        '@media (max-width: 767px) { [data-block="b7"] { font-size: 22px; } }',
    );
  });
});

// ─── Determinismo combinatorio (ADR-75 § "Decisione" punto 2, ADR-76 § punto 1/3) ─

describe('toCss() — determinismo combinatorio: 4 stati × 3 breakpoint attivi', () => {
  it("produce esattamente 12 blocchi, nell'ordine stato esterno (normal,hover,focus,active) → breakpoint interno (ordine ADR-76), indipendentemente dall'ordine di inserimento delle chiavi", () => {
    const spec: ColorRefPropSpec = {
      kind: 'colorRef',
      required: false,
      stateful: true,
      responsive: true,
      cssProperty: 'color',
    };
    // Chiavi di primo livello (stato) e di secondo livello (breakpoint)
    // deliberatamente fuori dall'ordine dichiarato, per dimostrare che
    // `toCss()` non dipende dall'ordine di inserimento dell'oggetto JS.
    const value = {
      active: { mobile: '#000004', default: '#000005', laptop: '#000006' },
      normal: { laptop: '#000000', default: '#000001', mobile: '#000002' },
      focus: { mobile: '#000009', laptop: '#000007', default: '#000008' },
      hover: { default: '#00000a', mobile: '#00000c', laptop: '#00000b' },
    };
    // Breakpoint attivi forniti fuori dall'ordine canonico ADR-76.
    const ctx: ToCssContext = {
      blockId: 'b9',
      activeBreakpoints: [bp('mobile', MEDIA.mobile), bp('default'), bp('laptop', MEDIA.laptop)],
    };

    const result = toCss('colorRef', spec, value, ctx);

    expect(result).toHaveLength(12);

    const expectedOrder: Array<{
      selector: string;
      mediaQuery: string | undefined;
      value: string;
    }> = [
      { selector: '[data-block="b9"]', mediaQuery: undefined, value: '#000001' },
      { selector: '[data-block="b9"]', mediaQuery: MEDIA.laptop, value: '#000000' },
      { selector: '[data-block="b9"]', mediaQuery: MEDIA.mobile, value: '#000002' },
      { selector: '[data-block="b9"]:hover', mediaQuery: undefined, value: '#00000a' },
      { selector: '[data-block="b9"]:hover', mediaQuery: MEDIA.laptop, value: '#00000b' },
      { selector: '[data-block="b9"]:hover', mediaQuery: MEDIA.mobile, value: '#00000c' },
      { selector: '[data-block="b9"]:focus', mediaQuery: undefined, value: '#000008' },
      { selector: '[data-block="b9"]:focus', mediaQuery: MEDIA.laptop, value: '#000007' },
      { selector: '[data-block="b9"]:focus', mediaQuery: MEDIA.mobile, value: '#000009' },
      { selector: '[data-block="b9"]:active', mediaQuery: undefined, value: '#000005' },
      { selector: '[data-block="b9"]:active', mediaQuery: MEDIA.laptop, value: '#000006' },
      { selector: '[data-block="b9"]:active', mediaQuery: MEDIA.mobile, value: '#000004' },
    ];

    expect(
      result.map((block) => ({
        selector: block.selector,
        mediaQuery: block.mediaQuery,
        value: block.declarations[0].value,
      })),
    ).toEqual(expectedOrder);
  });
});

// ─── Filtro breakpoint disattivato (ADR-76 § "Decisione" punto 4) ──────────

describe('toCss() — filtro breakpoint noto ma non attivo', () => {
  it('una chiave breakpoint presente nel valore ma assente da ctx.activeBreakpoints non produce alcun blocco per quella chiave', () => {
    const spec: ColorRefPropSpec = {
      kind: 'colorRef',
      required: false,
      responsive: true,
      cssProperty: 'color',
    };
    const value = { default: '#fff', tabletExtra: '#000' };
    // `tabletExtra` è una chiave nota (ADR-76 § "Decisione" punto 1) ma non è
    // presente in `ctx.activeBreakpoints`: disattivata per il sito.
    const ctx: ToCssContext = { blockId: 'b2', activeBreakpoints: [bp('default')] };

    const result = toCss('colorRef', spec, value, ctx);

    expect(result).toEqual([
      {
        selector: '[data-block="b2"]',
        mediaQuery: undefined,
        declarations: [{ property: 'color', value: '#fff' }],
      },
    ]);
    expect(result.some((block) => block.mediaQuery === MEDIA.tabletExtra)).toBe(false);
  });
});

// ─── Non-rottura: valore scalare/non-stateful/non-responsive (§ 10 punto 1) ─

describe('toCss() — non-rottura su valore scalare senza stateful/responsive', () => {
  it('un kind che non dichiara mai stateful/responsive (radius) con valore scalare produce un solo blocco, senza :hover né media query', () => {
    const spec: RadiusPropSpec = { kind: 'radius', required: false };
    const value = { tl: 4, tr: 4, br: 4, bl: 4, unit: 'px' };
    const result = toCss('radius', spec, value, ctxDefault('b5'));

    expect(result).toHaveLength(1);
    expect(result[0].selector).toBe('[data-block="b5"]');
    expect(result[0].selector).not.toContain(':hover');
    expect(result[0].selector).not.toContain(':focus');
    expect(result[0].selector).not.toContain(':active');
    expect(result[0].mediaQuery).toBeUndefined();
  });
});

// ─── Kind fuori scope (S1.2 implementa solo i 9 kind PropKind v2) ──────────

describe('toCss() — kind fuori scope del Sub-Task S1.2', () => {
  it('un kind v1 (es. "color") lancia un errore esplicito, mai un fallback silenzioso', () => {
    const spec: ColorPropSpec = { kind: 'color', required: false };
    expect(() => toCss('color', spec as unknown as PropSpec, '#fff', ctxDefault())).toThrow(
      /fuori scope del Sub-Task S1.2/,
    );
  });

  it('un disallineamento fra "kind" e "spec.kind" lancia un errore esplicito (guardia difensiva)', () => {
    const spec: RadiusPropSpec = { kind: 'radius', required: false };
    expect(() =>
      toCss(
        'gradient',
        spec as unknown as PropSpec,
        { tl: 0, tr: 0, br: 0, bl: 0, unit: 'px' },
        ctxDefault(),
      ),
    ).toThrow(/non coincide con/);
  });
});
