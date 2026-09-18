import { BlockTreeValidatorService } from '../../../../src/blocks/validator/block-tree-validator.service';
import { ValidatableBlockNode } from '../../../../src/blocks/validator/validatable-node.types';
import { BlockRegistry } from '../../../../src/blocks/block-registry';
import { BlockDefinition } from '../../../../src/blocks/block-definition.types';
import { PropSpec } from '../../../../src/blocks/prop-spec.types';

/**
 * Suite dedicata agli 8 `kind` nuovi del Sub-Task S1.4 ("Container v2
 * unificato & migrazioni v1→v2", ADR-81/ADR-82, round R1/R2 "parità
 * Elementor Pro"): `layout`, `background`, `link`, `animation`, `motion`,
 * `attributes`, `css`, `hideOn` (più `shapeDivider`, kind aggiuntivo di
 * design per ADR-82 § "Decisione" punto 1) e l'estensione `stateful`
 * opzionale di `border`/`shadow`. Stesso pattern architetturale di
 * `block-tree-validator.propkind-v2.spec.ts`.
 */

function node(overrides: Partial<ValidatableBlockNode>): ValidatableBlockNode {
  return { id: 'n1', type: 'testType', props: {}, children: [], ...overrides };
}

function registryWithProp(type: string, propName: string, spec: PropSpec): BlockRegistry {
  const definition: BlockDefinition = {
    type,
    v: 1,
    props: { [propName]: spec },
    children: { allow: [] },
    migrations: [],
    enabled: true,
  };
  return { definitions: new Map([[type, definition]]), rootAllowed: [type] };
}

describe('BlockTreeValidatorService — Container v2, 8 kind nuovi (ADR-81/ADR-82, Sub-Task S1.4)', () => {
  let validator: BlockTreeValidatorService;

  beforeEach(() => {
    validator = new BlockTreeValidatorService();
  });

  // ─── layout ────────────────────────────────────────────────────────────

  describe('kind "layout"', () => {
    const registry = registryWithProp('t', 'layout', {
      kind: 'layout',
      required: false,
      responsive: true,
    });

    it('{} è valido (tutti i campi opzionali)', () => {
      const result = validator.validateTree(
        [node({ type: 't', props: { layout: { default: {} } } })],
        registry,
      );
      expect(result.valid).toBe(true);
    });

    it('un valore flex completo è accettato', () => {
      const result = validator.validateTree(
        [
          node({
            type: 't',
            props: {
              layout: {
                default: {
                  display: 'flex',
                  direction: 'row',
                  wrap: 'nowrap',
                  justify: 'center',
                  align: 'stretch',
                  gap: { x: { value: 8, unit: 'px' }, y: { value: 8, unit: 'px' } },
                },
              },
            },
          }),
        ],
        registry,
      );
      expect(result.valid).toBe(true);
    });

    it('gridTemplateColumns { preset: "repeat", count: 12 } è accettato (12 colonne)', () => {
      const result = validator.validateTree(
        [
          node({
            type: 't',
            props: {
              layout: {
                default: { display: 'grid', gridTemplateColumns: { preset: 'repeat', count: 12 } },
              },
            },
          }),
        ],
        registry,
      );
      expect(result.valid).toBe(true);
    });

    it('gridTemplateColumns { preset: "repeat", count: 13 } è respinto con reason "range"', () => {
      const result = validator.validateTree(
        [
          node({
            type: 't',
            props: {
              layout: {
                default: { display: 'grid', gridTemplateColumns: { preset: 'repeat', count: 13 } },
              },
            },
          }),
        ],
        registry,
      );
      expect(result.errors).toContainEqual({
        code: 'BLOCK_PROP_INVALID',
        details: {
          path: 'blocks[0].props.layout.default.gridTemplateColumns.count',
          type: 't',
          prop: 'layout',
          kind: 'layout',
          reason: 'range',
          constraint: [1, 12],
          actual: 13,
        },
      });
    });

    it('gridTemplateColumns come array di 13 GridTrackValue è respinto con reason "range"', () => {
      const tracks = Array.from({ length: 13 }, () => ({ value: 1, unit: 'fr' }));
      const result = validator.validateTree(
        [
          node({
            type: 't',
            props: { layout: { default: { display: 'grid', gridTemplateColumns: tracks } } },
          }),
        ],
        registry,
      );
      expect(result.errors).toContainEqual({
        code: 'BLOCK_PROP_INVALID',
        details: {
          path: 'blocks[0].props.layout.default.gridTemplateColumns',
          type: 't',
          prop: 'layout',
          kind: 'layout',
          reason: 'range',
          constraint: [1, 12],
          actual: 13,
        },
      });
    });

    it('gridTemplateColumns come stringa CSS libera ("1fr 1fr") è respinto con reason "type" (mai una forma libera)', () => {
      const result = validator.validateTree(
        [
          node({
            type: 't',
            props: { layout: { default: { display: 'grid', gridTemplateColumns: '1fr 1fr' } } },
          }),
        ],
        registry,
      );
      expect(result.errors).toContainEqual({
        code: 'BLOCK_PROP_INVALID',
        details: {
          path: 'blocks[0].props.layout.default.gridTemplateColumns',
          type: 't',
          prop: 'layout',
          kind: 'layout',
          reason: 'type',
        },
      });
    });

    it('un array di 1 GridTrackValue con "auto" è accettato', () => {
      const result = validator.validateTree(
        [node({ type: 't', props: { layout: { default: { gridTemplateColumns: ['auto'] } } } })],
        registry,
      );
      expect(result.valid).toBe(true);
    });

    it('un campo enum fuori vocabolario produce reason "enum"', () => {
      const result = validator.validateTree(
        [node({ type: 't', props: { layout: { default: { display: 'inline-block' } } } })],
        registry,
      );
      expect(result.errors).toContainEqual({
        code: 'BLOCK_PROP_INVALID',
        details: {
          path: 'blocks[0].props.layout.default.display',
          type: 't',
          prop: 'layout',
          kind: 'layout',
          reason: 'enum',
          constraint: ['flex', 'grid'],
        },
      });
    });

    it('layout non è mai avvolto in un inviluppo stateful anche se il descrittore lo dichiarasse per errore: solo responsive', () => {
      const result = validator.validateTree(
        [node({ type: 't', props: { layout: { default: {} } } })],
        registry,
      );
      expect(result.valid).toBe(true);
    });
  });

  // ─── background ────────────────────────────────────────────────────────

  describe('kind "background"', () => {
    const registry = registryWithProp('t', 'background', {
      kind: 'background',
      required: false,
      stateful: true,
    });
    const registryNoStateful = registryWithProp('t', 'background', {
      kind: 'background',
      required: false,
    });

    it('{ type: "none" } è valido (background non è mai responsive, il valore nudo non è avvolto)', () => {
      const result = validator.validateTree(
        [node({ type: 't', props: { background: { type: 'none' } } })],
        registryNoStateful,
      );
      expect(result.valid).toBe(true);
    });

    it('{ type: "color", color: "#fff" } è valido', () => {
      const result = validator.validateTree(
        [node({ type: 't', props: { background: { type: 'color', color: '#fff' } } })],
        registryNoStateful,
      );
      expect(result.valid).toBe(true);
    });

    it('{ type: "gradient", gradient: {...} } valido riusa la validazione di "gradient"', () => {
      const result = validator.validateTree(
        [
          node({
            type: 't',
            props: {
              background: {
                type: 'gradient',
                gradient: {
                  type: 'linear',
                  angle: 90,
                  stops: [
                    { color: '#000', at: 0 },
                    { color: '#fff', at: 100 },
                  ],
                },
              },
            },
          }),
        ],
        registryNoStateful,
      );
      expect(result.valid).toBe(true);
    });

    it('type fuori dall\'elenco chiuso produce reason "enum"', () => {
      const result = validator.validateTree(
        [node({ type: 't', props: { background: { type: 'rainbow' } } })],
        registryNoStateful,
      );
      expect(result.errors).toContainEqual({
        code: 'BLOCK_PROP_INVALID',
        details: {
          path: 'blocks[0].props.background.type',
          type: 't',
          prop: 'background',
          kind: 'background',
          reason: 'enum',
          constraint: ['none', 'color', 'gradient', 'image', 'video', 'slideshow'],
        },
      });
    });

    it('con stateful:true un valore { normal: {...}, hover: {...} } è accettato', () => {
      const result = validator.validateTree(
        [
          node({
            type: 't',
            props: {
              background: {
                normal: { type: 'color', color: '#111' },
                hover: { type: 'color', color: '#222' },
              },
            },
          }),
        ],
        registry,
      );
      expect(result.valid).toBe(true);
    });

    it('image richiede mediaRef in forma di guid, position/attachment/repeat/size validi', () => {
      const result = validator.validateTree(
        [
          node({
            type: 't',
            props: {
              background: {
                type: 'image',
                image: {
                  mediaRef: '0123456789abcdef',
                  position: 'center center',
                  attachment: 'scroll',
                  repeat: 'no-repeat',
                  size: 'cover',
                },
              },
            },
          }),
        ],
        registryNoStateful,
      );
      expect(result.valid).toBe(true);
    });
  });

  // ─── link ──────────────────────────────────────────────────────────────

  describe('kind "link" — mai stateful/responsive', () => {
    const registry = registryWithProp('t', 'link', { kind: 'link', required: false });

    it('{ href: url, target, rel } minimo valido è accettato', () => {
      const result = validator.validateTree(
        [
          node({
            type: 't',
            props: { link: { href: 'https://esempio.it', target: '_self', rel: [] } },
          }),
        ],
        registry,
      );
      expect(result.valid).toBe(true);
    });

    it('{ href: { pageRef: guid } } è accettato', () => {
      const result = validator.validateTree(
        [
          node({
            type: 't',
            props: {
              link: { href: { pageRef: '0123456789abcdef' }, target: '_blank', rel: ['nofollow'] },
            },
          }),
        ],
        registry,
      );
      expect(result.valid).toBe(true);
    });

    it('href con schema non ammesso produce reason "urlScheme"', () => {
      const result = validator.validateTree(
        [
          node({
            type: 't',
            props: { link: { href: 'javascript:alert(1)', target: '_self', rel: [] } },
          }),
        ],
        registry,
      );
      expect(result.errors).toContainEqual({
        code: 'BLOCK_PROP_INVALID',
        details: {
          path: 'blocks[0].props.link.href',
          type: 't',
          prop: 'link',
          kind: 'link',
          reason: 'urlScheme',
        },
      });
    });

    it('rel con un token fuori elenco produce reason "enum"', () => {
      const result = validator.validateTree(
        [node({ type: 't', props: { link: { href: '/', target: '_self', rel: ['ugc'] } } })],
        registry,
      );
      expect(result.errors).toContainEqual({
        code: 'BLOCK_PROP_INVALID',
        details: {
          path: 'blocks[0].props.link.rel[0]',
          type: 't',
          prop: 'link',
          kind: 'link',
          reason: 'enum',
          constraint: ['nofollow', 'noopener', 'sponsored'],
        },
      });
    });
  });

  // ─── animation ─────────────────────────────────────────────────────────

  describe('kind "animation" — mai stateful/responsive', () => {
    const registry = registryWithProp('t', 'animation', { kind: 'animation', required: false });

    it('{ duration, delayMs } senza entrance è valido (entrance opzionale)', () => {
      const result = validator.validateTree(
        [node({ type: 't', props: { animation: { duration: 'normal', delayMs: 0 } } })],
        registry,
      );
      expect(result.valid).toBe(true);
    });

    it('entrance fuori allowlist produce reason "enum"', () => {
      const result = validator.validateTree(
        [
          node({
            type: 't',
            props: { animation: { entrance: 'explode', duration: 'fast', delayMs: 100 } },
          }),
        ],
        registry,
      );
      expect(
        result.errors.some((e) => e.details.path === 'blocks[0].props.animation.entrance'),
      ).toBe(true);
    });

    it('delayMs fuori [0,5000] produce reason "range"', () => {
      const result = validator.validateTree(
        [node({ type: 't', props: { animation: { duration: 'fast', delayMs: 6000 } } })],
        registry,
      );
      expect(result.errors).toContainEqual({
        code: 'BLOCK_PROP_INVALID',
        details: {
          path: 'blocks[0].props.animation.delayMs',
          type: 't',
          prop: 'animation',
          kind: 'animation',
          reason: 'range',
          constraint: [0, 5000],
          actual: 6000,
        },
      });
    });
  });

  // ─── motion ─────────────────────────────────────────────────────────────

  describe('kind "motion" — mai stateful/responsive', () => {
    const registry = registryWithProp('t', 'motion', { kind: 'motion', required: false });

    it('{} è valido (tutti i campi opzionali)', () => {
      const result = validator.validateTree([node({ type: 't', props: { motion: {} } })], registry);
      expect(result.valid).toBe(true);
    });

    it('scroll.verticalTranslate non numerico produce reason "type"', () => {
      const result = validator.validateTree(
        [node({ type: 't', props: { motion: { scroll: { verticalTranslate: 'lots' } } } })],
        registry,
      );
      expect(result.errors).toContainEqual({
        code: 'BLOCK_PROP_INVALID',
        details: {
          path: 'blocks[0].props.motion.scroll.verticalTranslate',
          type: 't',
          prop: 'motion',
          kind: 'motion',
          reason: 'type',
        },
      });
    });

    it('onBreakpoints con chiave fuori elenco chiuso produce reason "enum"', () => {
      const result = validator.validateTree(
        [node({ type: 't', props: { motion: { onBreakpoints: ['giant'] } } })],
        registry,
      );
      expect(
        result.errors.some((e) => e.details.path === 'blocks[0].props.motion.onBreakpoints[0]'),
      ).toBe(true);
    });
  });

  // ─── attributes ────────────────────────────────────────────────────────

  describe('kind "attributes" — mai stateful/responsive', () => {
    const registry = registryWithProp('t', 'attributes', { kind: 'attributes', required: false });

    it('[] è valido', () => {
      const result = validator.validateTree(
        [node({ type: 't', props: { attributes: [] } })],
        registry,
      );
      expect(result.valid).toBe(true);
    });

    it.each(['data-testid', 'aria-hidden', 'title', 'role', 'lang'])(
      'name "%s" è accettato',
      (name) => {
        const result = validator.validateTree(
          [node({ type: 't', props: { attributes: [{ name, value: 'x' }] } })],
          registry,
        );
        expect(result.valid).toBe(true);
      },
    );

    it.each(['onclick', 'href', 'src', 'style', 'class', 'id'])(
      'name "%s" (mai ammesso) produce reason "format"',
      (name) => {
        const result = validator.validateTree(
          [node({ type: 't', props: { attributes: [{ name, value: 'x' }] } })],
          registry,
        );
        expect(result.errors).toContainEqual({
          code: 'BLOCK_PROP_INVALID',
          details: {
            path: 'blocks[0].props.attributes[0].name',
            type: 't',
            prop: 'attributes',
            kind: 'attributes',
            reason: 'format',
          },
        });
      },
    );

    it('più di 10 elementi produce reason "range"', () => {
      const items = Array.from({ length: 11 }, (_unused, i) => ({
        name: `data-x${i}`,
        value: 'v',
      }));
      const result = validator.validateTree(
        [node({ type: 't', props: { attributes: items } })],
        registry,
      );
      expect(result.errors).toContainEqual({
        code: 'BLOCK_PROP_INVALID',
        details: {
          path: 'blocks[0].props.attributes',
          type: 't',
          prop: 'attributes',
          kind: 'attributes',
          reason: 'range',
          constraint: [0, 10],
          actual: 11,
        },
      });
    });

    it('value oltre 200 caratteri produce reason "maxLength"', () => {
      const result = validator.validateTree(
        [node({ type: 't', props: { attributes: [{ name: 'title', value: 'x'.repeat(201) }] } })],
        registry,
      );
      expect(result.errors).toContainEqual({
        code: 'BLOCK_PROP_INVALID',
        details: {
          path: 'blocks[0].props.attributes[0].value',
          type: 't',
          prop: 'attributes',
          kind: 'attributes',
          reason: 'maxLength',
          constraint: 200,
          actual: 201,
        },
      });
    });
  });

  // ─── css ───────────────────────────────────────────────────────────────

  describe('kind "css" — scope ridotto (ADR-78 non firmata)', () => {
    const registry = registryWithProp('t', 'css', { kind: 'css', required: false, maxLength: 20 });

    it('una stringa entro maxLength è accettata', () => {
      const result = validator.validateTree(
        [node({ type: 't', props: { css: '.a{color:red}' } })],
        registry,
      );
      expect(result.valid).toBe(true);
    });

    it('una stringa oltre maxLength produce reason "maxLength"', () => {
      const result = validator.validateTree(
        [node({ type: 't', props: { css: '.selettore { color: red; background: blue; }' } })],
        registry,
      );
      expect(result.errors[0].details).toMatchObject({ reason: 'maxLength', constraint: 20 });
    });

    it('un valore non stringa produce reason "type"', () => {
      const result = validator.validateTree([node({ type: 't', props: { css: 42 } })], registry);
      expect(result.errors).toContainEqual({
        code: 'BLOCK_PROP_INVALID',
        details: {
          path: 'blocks[0].props.css',
          type: 't',
          prop: 'css',
          kind: 'css',
          reason: 'type',
        },
      });
    });
  });

  // ─── hideOn ────────────────────────────────────────────────────────────

  describe('kind "hideOn" — mai stateful/responsive', () => {
    const registry = registryWithProp('t', 'hideOn', { kind: 'hideOn', required: false });

    it('[] è valido', () => {
      const result = validator.validateTree([node({ type: 't', props: { hideOn: [] } })], registry);
      expect(result.valid).toBe(true);
    });

    it('["default","tablet","mobile"] è valido', () => {
      const result = validator.validateTree(
        [node({ type: 't', props: { hideOn: ['default', 'tablet', 'mobile'] } })],
        registry,
      );
      expect(result.valid).toBe(true);
    });

    it('una chiave fuori dall\'elenco chiuso produce reason "enum"', () => {
      const result = validator.validateTree(
        [node({ type: 't', props: { hideOn: ['giant'] } })],
        registry,
      );
      expect(result.errors.some((e) => e.details.path === 'blocks[0].props.hideOn[0]')).toBe(true);
    });

    it('un valore non array produce reason "type"', () => {
      const result = validator.validateTree(
        [node({ type: 't', props: { hideOn: 'mobile' } })],
        registry,
      );
      expect(result.errors).toContainEqual({
        code: 'BLOCK_PROP_INVALID',
        details: {
          path: 'blocks[0].props.hideOn',
          type: 't',
          prop: 'hideOn',
          kind: 'hideOn',
          reason: 'type',
        },
      });
    });
  });

  // ─── shapeDivider ──────────────────────────────────────────────────────

  describe('kind "shapeDivider" — mai stateful/responsive', () => {
    const registry = registryWithProp('t', 'shapeDivider', {
      kind: 'shapeDivider',
      required: false,
    });

    it("un valore completo con style dall'allowlist è accettato", () => {
      const result = validator.validateTree(
        [
          node({
            type: 't',
            props: {
              shapeDivider: {
                style: 'wave',
                color: '#fff',
                width: { value: 100, unit: '%' },
                height: { value: 80, unit: 'px' },
                flip: false,
                invert: false,
                aboveContent: false,
              },
            },
          }),
        ],
        registry,
      );
      expect(result.valid).toBe(true);
    });

    it('style fuori dall\'allowlist chiusa a 20 nomi produce reason "enum"', () => {
      const result = validator.validateTree(
        [
          node({
            type: 't',
            props: {
              shapeDivider: {
                style: 'unicorn',
                color: '#fff',
                width: { value: 100, unit: '%' },
                height: { value: 80, unit: 'px' },
                flip: false,
                invert: false,
                aboveContent: false,
              },
            },
          }),
        ],
        registry,
      );
      expect(
        result.errors.some((e) => e.details.path === 'blocks[0].props.shapeDivider.style'),
      ).toBe(true);
    });
  });

  // ─── border/shadow con inviluppo stateful opzionale (ADR-82 § "Conseguenze") ──

  describe('border/shadow — estensione stateful opzionale', () => {
    it('border senza stateful continua a validare un valore scalare (comportamento invariato)', () => {
      const registry = registryWithProp('t', 'border', { kind: 'border', required: false });
      const result = validator.validateTree(
        [
          node({
            type: 't',
            props: { border: { width: 2, style: 'solid', color: '#333', radius: 4 } },
          }),
        ],
        registry,
      );
      expect(result.valid).toBe(true);
    });

    it("border con stateful:true richiede l'inviluppo { normal, hover? }", () => {
      const registry = registryWithProp('t', 'border', {
        kind: 'border',
        required: false,
        stateful: true,
      });
      const scalarResult = validator.validateTree(
        [
          node({
            type: 't',
            props: { border: { width: 2, style: 'solid', color: '#333', radius: 4 } },
          }),
        ],
        registry,
      );
      expect(scalarResult.valid).toBe(false);
      expect(scalarResult.errors).toContainEqual({
        code: 'BLOCK_PROP_INVALID',
        details: {
          path: 'blocks[0].props.border',
          type: 't',
          prop: 'border',
          kind: 'border',
          reason: 'type',
        },
      });

      const envelopeResult = validator.validateTree(
        [
          node({
            type: 't',
            props: {
              border: {
                normal: { width: 2, style: 'solid', color: '#333', radius: 4 },
                hover: { width: 4, style: 'dashed', color: '#000', radius: 0 },
              },
            },
          }),
        ],
        registry,
      );
      expect(envelopeResult.valid).toBe(true);
    });

    it("shadow con stateful:true richiede l'inviluppo { normal, hover? }", () => {
      const registry = registryWithProp('t', 'shadow', {
        kind: 'shadow',
        required: false,
        stateful: true,
      });
      const result = validator.validateTree(
        [
          node({
            type: 't',
            props: { shadow: { normal: { x: 0, y: 2, blur: 4, spread: 0, color: '#000' } } },
          }),
        ],
        registry,
      );
      expect(result.valid).toBe(true);
    });
  });
});
