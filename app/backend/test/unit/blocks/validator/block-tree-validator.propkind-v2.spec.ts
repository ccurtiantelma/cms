import { BlockTreeValidatorService } from '../../../../src/blocks/validator/block-tree-validator.service';
import { ValidatableBlockNode } from '../../../../src/blocks/validator/validatable-node.types';
import { BlockRegistry, DEFAULT_BLOCK_REGISTRY } from '../../../../src/blocks/block-registry';
import { BlockDefinition } from '../../../../src/blocks/block-definition.types';
import { PropSpec } from '../../../../src/blocks/prop-spec.types';

/**
 * Suite dedicata al Sub-Task S1.1 ("Tipi PropKind v2 e Validatori NestJS",
 * `docs/ai/specs/SPEC-PROPKIND-V2-DETAILS.md`, ADR-74–ADR-77 round R0):
 * copre i nove nuovi `kind` (`colorRef`, `fontRef`, `typography`, `spacing`,
 * `radius`, `gradient`, `position`, `transform`, `filter`) e la composizione
 * ortogonale stateful/responsive di ADR-75, senza toccare
 * `block-tree-validator.service.spec.ts` (già verde, 265 test invariati).
 */

/** Costruisce un nodo di test minimale. */
function node(overrides: Partial<ValidatableBlockNode>): ValidatableBlockNode {
  return {
    id: 'n1',
    type: 'testType',
    props: {},
    children: [],
    ...overrides,
  };
}

/** Costruisce un registro di test con un solo tipo, `propName` come unica prop dichiarata. */
function registryWithProp(type: string, propName: string, spec: PropSpec): BlockRegistry {
  const definition: BlockDefinition = {
    type,
    v: 1,
    props: { [propName]: spec },
    children: { allow: [] },
    migrations: [],
    enabled: true,
  };
  return {
    definitions: new Map([[type, definition]]),
    rootAllowed: [type],
  };
}

describe('BlockTreeValidatorService — PropKind v2 (SPEC-PROPKIND-V2-DETAILS.md, ADR-74–ADR-77 round R0)', () => {
  let validator: BlockTreeValidatorService;

  beforeEach(() => {
    validator = new BlockTreeValidatorService();
  });

  // ─── colorRef (SPEC-PROPKIND-V2-DETAILS.md § 1) ────────────────────────

  describe('kind "colorRef"', () => {
    const registry = registryWithProp('testColorRef', 'color', {
      kind: 'colorRef',
      required: false,
      cssProperty: 'background-color',
    });
    const registryAlpha = registryWithProp('testColorRef', 'color', {
      kind: 'colorRef',
      required: false,
      allowAlpha: true,
      cssProperty: 'background-color',
    });
    const registryStateful = registryWithProp('testColorRef', 'color', {
      kind: 'colorRef',
      required: false,
      stateful: true,
      cssProperty: 'background-color',
    });
    const registryResponsive = registryWithProp('testColorRef', 'color', {
      kind: 'colorRef',
      required: false,
      responsive: true,
      cssProperty: 'background-color',
    });
    const registryStatefulResponsive = registryWithProp('testColorRef', 'color', {
      kind: 'colorRef',
      required: false,
      stateful: true,
      responsive: true,
      cssProperty: 'background-color',
    });

    it.each(['#fff', '#FFAA00', '#000000'])('valore nudo hex %j è accettato', (color) => {
      const result = validator.validateTree(
        [node({ type: 'testColorRef', props: { color } })],
        registry,
      );
      expect(result.valid).toBe(true);
    });

    it.each(['primary', 'secondary', 'text', 'accent', '0123456789abcdef'])(
      'valore nudo { ref: %j } è accettato',
      (ref) => {
        const result = validator.validateTree(
          [node({ type: 'testColorRef', props: { color: { ref } } })],
          registry,
        );
        expect(result.valid).toBe(true);
      },
    );

    it('#RRGGBBAA è respinto con reason "format" senza allowAlpha', () => {
      const result = validator.validateTree(
        [node({ type: 'testColorRef', props: { color: '#ffaa0080' } })],
        registry,
      );
      expect(result.errors).toContainEqual({
        code: 'BLOCK_PROP_INVALID',
        details: {
          path: 'blocks[0].props.color',
          type: 'testColorRef',
          prop: 'color',
          kind: 'colorRef',
          reason: 'format',
        },
      });
    });

    it('#RRGGBBAA è accettato con allowAlpha: true', () => {
      const result = validator.validateTree(
        [node({ type: 'testColorRef', props: { color: '#ffaa0080' } })],
        registryAlpha,
      );
      expect(result.valid).toBe(true);
    });

    it.each([
      'not-a-color',
      '#gg0000',
      { ref: 'ABCDEF0123456789' },
      { ref: 'unknown' },
      42,
      null,
      ['#fff'],
    ])('valore nudo %j (né stringa-pattern né oggetto-ref) produce reason "format"', (color) => {
      const result = validator.validateTree(
        [node({ type: 'testColorRef', props: { color } })],
        registry,
      );
      expect(result.errors).toContainEqual({
        code: 'BLOCK_PROP_INVALID',
        details: {
          path: 'blocks[0].props.color',
          type: 'testColorRef',
          prop: 'color',
          kind: 'colorRef',
          reason: 'format',
        },
      });
    });

    it('{ ref: "primary", extra: 1 } (chiave estranea) è respinto con reason "format"', () => {
      const result = validator.validateTree(
        [node({ type: 'testColorRef', props: { color: { ref: 'primary', extra: 1 } } })],
        registry,
      );
      expect(result.errors).toContainEqual({
        code: 'BLOCK_PROP_INVALID',
        details: {
          path: 'blocks[0].props.color',
          type: 'testColorRef',
          prop: 'color',
          kind: 'colorRef',
          reason: 'format',
        },
      });
    });

    it('inviluppo stateful { normal, hover } con valori nudi validi è accettato', () => {
      const result = validator.validateTree(
        [node({ type: 'testColorRef', props: { color: { normal: '#fff', hover: '#000' } } })],
        registryStateful,
      );
      expect(result.valid).toBe(true);
    });

    it('inviluppo stateful con solo "normal" è accettato ("normal" è l\'unica chiave obbligatoria)', () => {
      const result = validator.validateTree(
        [node({ type: 'testColorRef', props: { color: { normal: '#fff' } } })],
        registryStateful,
      );
      expect(result.valid).toBe(true);
    });

    it('inviluppo stateful senza "normal" produce reason "type" sul path della prop', () => {
      const result = validator.validateTree(
        [node({ type: 'testColorRef', props: { color: { hover: '#000' } } })],
        registryStateful,
      );
      expect(result.errors).toContainEqual({
        code: 'BLOCK_PROP_INVALID',
        details: {
          path: 'blocks[0].props.color',
          type: 'testColorRef',
          prop: 'color',
          kind: 'colorRef',
          reason: 'type',
        },
      });
    });

    it('uno stato fuori dall\'elenco chiuso (normal|hover|focus|active) produce reason "type"', () => {
      const result = validator.validateTree(
        [node({ type: 'testColorRef', props: { color: { normal: '#fff', visited: '#000' } } })],
        registryStateful,
      );
      expect(result.errors).toContainEqual({
        code: 'BLOCK_PROP_INVALID',
        details: {
          path: 'blocks[0].props.color',
          type: 'testColorRef',
          prop: 'color',
          kind: 'colorRef',
          reason: 'type',
        },
      });
    });

    it('un valore nudo (scalare) passato a una prop stateful è respinto con reason "type"', () => {
      const result = validator.validateTree(
        [node({ type: 'testColorRef', props: { color: '#fff' } })],
        registryStateful,
      );
      expect(result.errors).toContainEqual({
        code: 'BLOCK_PROP_INVALID',
        details: {
          path: 'blocks[0].props.color',
          type: 'testColorRef',
          prop: 'color',
          kind: 'colorRef',
          reason: 'type',
        },
      });
    });

    it('inviluppo responsive { default, tablet, mobile } con valori nudi validi è accettato', () => {
      const result = validator.validateTree(
        [
          node({
            type: 'testColorRef',
            props: { color: { default: '#fff', tablet: '#eee', mobile: '#ddd' } },
          }),
        ],
        registryResponsive,
      );
      expect(result.valid).toBe(true);
    });

    it('inviluppo responsive senza "default" produce reason "type"', () => {
      const result = validator.validateTree(
        [node({ type: 'testColorRef', props: { color: { tablet: '#eee' } } })],
        registryResponsive,
      );
      expect(result.errors).toContainEqual({
        code: 'BLOCK_PROP_INVALID',
        details: {
          path: 'blocks[0].props.color',
          type: 'testColorRef',
          prop: 'color',
          kind: 'colorRef',
          reason: 'type',
        },
      });
    });

    it('un valore fuori forma dentro un ramo responsive produce reason "format" sul path del breakpoint', () => {
      const result = validator.validateTree(
        [
          node({
            type: 'testColorRef',
            props: { color: { default: '#fff', tablet: 'not-a-color' } },
          }),
        ],
        registryResponsive,
      );
      expect(result.errors).toContainEqual({
        code: 'BLOCK_PROP_INVALID',
        details: {
          path: 'blocks[0].props.color.tablet',
          type: 'testColorRef',
          prop: 'color',
          kind: 'colorRef',
          reason: 'format',
        },
      });
    });

    it('stateful + responsive combinati: ordine stato → breakpoint → valore, entrambi validi', () => {
      const result = validator.validateTree(
        [
          node({
            type: 'testColorRef',
            props: {
              color: {
                normal: { default: { ref: 'primary' } },
                hover: { default: '#1b5fa8', tablet: '#123456' },
              },
            },
          }),
        ],
        registryStatefulResponsive,
      );
      expect(result.valid).toBe(true);
    });

    it('stateful + responsive: un valore fuori forma nel ramo hover.tablet produce reason "format" sul path completo', () => {
      const result = validator.validateTree(
        [
          node({
            type: 'testColorRef',
            props: {
              color: {
                normal: { default: '#fff' },
                hover: { default: '#000', tablet: 'nope' },
              },
            },
          }),
        ],
        registryStatefulResponsive,
      );
      expect(result.errors).toContainEqual({
        code: 'BLOCK_PROP_INVALID',
        details: {
          path: 'blocks[0].props.color.hover.tablet',
          type: 'testColorRef',
          prop: 'color',
          kind: 'colorRef',
          reason: 'format',
        },
      });
    });
  });

  // ─── fontRef (SPEC-PROPKIND-V2-DETAILS.md § 2) ─────────────────────────

  describe('kind "fontRef"', () => {
    const registry = registryWithProp('testFontRef', 'font', { kind: 'fontRef', required: false });
    const registryResponsive = registryWithProp('testFontRef', 'font', {
      kind: 'fontRef',
      required: false,
      responsive: true,
    });
    // `stateful` non è mai onorato per `fontRef` (ADR-75 § "Decisione" punto 6): impostato
    // ugualmente sul descrittore per dimostrare che il validatore lo ignora.
    const registryIgnoredStateful = registryWithProp('testFontRef', 'font', {
      kind: 'fontRef',
      required: false,
      stateful: true,
    });

    it.each(['primary', 'secondary', 'text', 'accent', '0123456789abcdef'])(
      '{ ref: %j } è accettato',
      (ref) => {
        const result = validator.validateTree(
          [node({ type: 'testFontRef', props: { font: { ref } } })],
          registry,
        );
        expect(result.valid).toBe(true);
      },
    );

    it('{ ref: "bogus" } (né id system né guid) produce reason "format"', () => {
      const result = validator.validateTree(
        [node({ type: 'testFontRef', props: { font: { ref: 'bogus' } } })],
        registry,
      );
      expect(result.errors).toContainEqual({
        code: 'BLOCK_PROP_INVALID',
        details: {
          path: 'blocks[0].props.font',
          type: 'testFontRef',
          prop: 'font',
          kind: 'fontRef',
          reason: 'format',
        },
      });
    });

    it.each(['default', 'inter', 'roboto', 'playfair', 'montserrat', 'monospace'])(
      '{ family: %j, source: "system" } è accettato',
      (family) => {
        const result = validator.validateTree(
          [node({ type: 'testFontRef', props: { font: { family, source: 'system' } } })],
          registry,
        );
        expect(result.valid).toBe(true);
      },
    );

    it('{ family: "Comic Sans", source: "system" } (fuori vocabolario chiuso) produce reason "enum"', () => {
      const result = validator.validateTree(
        [
          node({
            type: 'testFontRef',
            props: { font: { family: 'Comic Sans', source: 'system' } },
          }),
        ],
        registry,
      );
      expect(result.errors).toContainEqual({
        code: 'BLOCK_PROP_INVALID',
        details: {
          path: 'blocks[0].props.font.family',
          type: 'testFontRef',
          prop: 'font',
          kind: 'fontRef',
          reason: 'enum',
          constraint: ['default', 'inter', 'roboto', 'playfair', 'montserrat', 'monospace'],
        },
      });
    });

    it.each(['google', 'custom'])(
      '{ family: "Poppins", source: %j } è accettato in forma (nessuna verifica DB in questo validatore stateless)',
      (source) => {
        const result = validator.validateTree(
          [node({ type: 'testFontRef', props: { font: { family: 'Poppins', source } } })],
          registry,
        );
        expect(result.valid).toBe(true);
      },
    );

    it('source fuori dall\'elenco chiuso produce reason "enum"', () => {
      const result = validator.validateTree(
        [node({ type: 'testFontRef', props: { font: { family: 'Poppins', source: 'cdn' } } })],
        registry,
      );
      expect(result.errors).toContainEqual({
        code: 'BLOCK_PROP_INVALID',
        details: {
          path: 'blocks[0].props.font.source',
          type: 'testFontRef',
          prop: 'font',
          kind: 'fontRef',
          reason: 'enum',
          constraint: ['system', 'google', 'custom'],
        },
      });
    });

    // ─── S1.3: allowlist opzionale contro fonts.google_allowlist/customFonts[] ──
    // (SPEC-PROPKIND-V2-DETAILS.md § 2 punti 3-4). `fontAllowlist` assente = nessuna
    // restrizione (i due test sopra, comportamento storico S1.1 invariato). Passato
    // esplicitamente via `context`, il validatore lo applica.
    it.each(['google', 'custom'] as const)(
      "{ family, source: %j } accettato quando la famiglia è nell'allowlist passata via context",
      (source) => {
        const result = validator.validateTree(
          [node({ type: 'testFontRef', props: { font: { family: 'Poppins', source } } })],
          registry,
          { fontAllowlist: { google: ['Poppins'], custom: ['Poppins'] } },
        );
        expect(result.valid).toBe(true);
      },
    );

    it.each(['google', 'custom'] as const)(
      '{ family, source: %j } fuori allowlist produce reason "enum" sul path .family',
      (source) => {
        const result = validator.validateTree(
          [node({ type: 'testFontRef', props: { font: { family: 'Comic Sans MS', source } } })],
          registry,
          { fontAllowlist: { google: ['Poppins'], custom: ['Poppins'] } },
        );
        expect(result.errors).toContainEqual({
          code: 'BLOCK_PROP_INVALID',
          details: {
            path: 'blocks[0].props.font.family',
            type: 'testFontRef',
            prop: 'font',
            kind: 'fontRef',
            reason: 'enum',
            constraint: ['Poppins'],
          },
        });
      },
    );

    it('un valore né { ref } né { family, source } produce reason "format"', () => {
      const result = validator.validateTree(
        [node({ type: 'testFontRef', props: { font: 'Inter' } })],
        registry,
      );
      expect(result.errors).toContainEqual({
        code: 'BLOCK_PROP_INVALID',
        details: {
          path: 'blocks[0].props.font',
          type: 'testFontRef',
          prop: 'font',
          kind: 'fontRef',
          reason: 'format',
        },
      });
    });

    it('inviluppo responsive { default, tablet } è accettato', () => {
      const result = validator.validateTree(
        [
          node({
            type: 'testFontRef',
            props: {
              font: { default: { ref: 'primary' }, tablet: { family: 'inter', source: 'system' } },
            },
          }),
        ],
        registryResponsive,
      );
      expect(result.valid).toBe(true);
    });

    it('`stateful: true` sul descrittore è ignorato: un valore nudo (non-inviluppo) resta accettato', () => {
      const result = validator.validateTree(
        [node({ type: 'testFontRef', props: { font: { ref: 'primary' } } })],
        registryIgnoredStateful,
      );
      expect(result.valid).toBe(true);
    });

    it('`stateful: true` sul descrittore è ignorato: un inviluppo { normal, hover } NON viene interpretato come stato, produce reason "format" (letto come oggetto { ref/family } malformato)', () => {
      const result = validator.validateTree(
        [
          node({
            type: 'testFontRef',
            props: { font: { normal: { ref: 'primary' }, hover: { ref: 'accent' } } },
          }),
        ],
        registryIgnoredStateful,
      );
      expect(result.errors).toContainEqual({
        code: 'BLOCK_PROP_INVALID',
        details: {
          path: 'blocks[0].props.font',
          type: 'testFontRef',
          prop: 'font',
          kind: 'fontRef',
          reason: 'format',
        },
      });
    });
  });

  // ─── typography (SPEC-PROPKIND-V2-DETAILS.md § 3) ──────────────────────

  describe('kind "typography"', () => {
    const registry = registryWithProp('testTypography', 'typo', {
      kind: 'typography',
      required: false,
    });
    const registryResponsive = registryWithProp('testTypography', 'typo', {
      kind: 'typography',
      required: false,
      responsive: true,
    });
    const registryStateful = registryWithProp('testTypography', 'typo', {
      kind: 'typography',
      required: false,
      stateful: true,
    });
    const registryStatefulResponsive = registryWithProp('testTypography', 'typo', {
      kind: 'typography',
      required: false,
      stateful: true,
      responsive: true,
    });

    it('{} (nessun campo) è accettato: tutti i campi sono opzionali', () => {
      const result = validator.validateTree(
        [node({ type: 'testTypography', props: { typo: {} } })],
        registry,
      );
      expect(result.valid).toBe(true);
    });

    it('un valore completo con tutti e 9 i campi validi è accettato', () => {
      const result = validator.validateTree(
        [
          node({
            type: 'testTypography',
            props: {
              typo: {
                fontFamily: { family: 'inter', source: 'system' },
                fontSize: { value: 32, unit: 'px' },
                fontWeight: '700',
                textTransform: 'uppercase',
                fontStyle: 'italic',
                textDecoration: 'underline',
                lineHeight: { value: 1.4, unit: 'em' },
                letterSpacing: { value: 2, unit: 'px' },
                wordSpacing: { value: 4, unit: 'px' },
              },
            },
          }),
        ],
        registry,
      );
      expect(result.valid).toBe(true);
    });

    it('fontSize.value oltre il massimo (400) produce reason "range" sul path completo', () => {
      const result = validator.validateTree(
        [
          node({
            type: 'testTypography',
            props: { typo: { fontSize: { value: 500, unit: 'px' } } },
          }),
        ],
        registry,
      );
      expect(result.errors).toContainEqual({
        code: 'BLOCK_PROP_INVALID',
        details: {
          path: 'blocks[0].props.typo.fontSize.value',
          type: 'testTypography',
          prop: 'typo',
          kind: 'typography',
          reason: 'range',
          constraint: [1, 400],
          actual: 500,
        },
      });
    });

    it('fontWeight fuori dall\'elenco chiuso produce reason "enum"', () => {
      const result = validator.validateTree(
        [node({ type: 'testTypography', props: { typo: { fontWeight: '999' } } })],
        registry,
      );
      expect(result.errors).toContainEqual({
        code: 'BLOCK_PROP_INVALID',
        details: {
          path: 'blocks[0].props.typo.fontWeight',
          type: 'testTypography',
          prop: 'typo',
          kind: 'typography',
          reason: 'enum',
          constraint: [
            '100',
            '200',
            '300',
            '400',
            '500',
            '600',
            '700',
            '800',
            '900',
            'normal',
            'bold',
          ],
        },
      });
    });

    it('lineHeight unit "em" con value 12 (oltre 0–10) produce reason "range"', () => {
      const result = validator.validateTree(
        [
          node({
            type: 'testTypography',
            props: { typo: { lineHeight: { value: 12, unit: 'em' } } },
          }),
        ],
        registry,
      );
      expect(result.errors).toContainEqual({
        code: 'BLOCK_PROP_INVALID',
        details: {
          path: 'blocks[0].props.typo.lineHeight.value',
          type: 'testTypography',
          prop: 'typo',
          kind: 'typography',
          reason: 'range',
          constraint: [0, 10],
          actual: 12,
        },
      });
    });

    it('lineHeight unit "px" con value 250 (oltre 0–200) produce reason "range"', () => {
      const result = validator.validateTree(
        [
          node({
            type: 'testTypography',
            props: { typo: { lineHeight: { value: 250, unit: 'px' } } },
          }),
        ],
        registry,
      );
      expect(result.errors).toContainEqual({
        code: 'BLOCK_PROP_INVALID',
        details: {
          path: 'blocks[0].props.typo.lineHeight.value',
          type: 'testTypography',
          prop: 'typo',
          kind: 'typography',
          reason: 'range',
          constraint: [0, 200],
          actual: 250,
        },
      });
    });

    it('lineHeight unit fuori da em|px produce reason "enum"', () => {
      const result = validator.validateTree(
        [
          node({
            type: 'testTypography',
            props: { typo: { lineHeight: { value: 1, unit: 'rem' } } },
          }),
        ],
        registry,
      );
      expect(result.errors).toContainEqual({
        code: 'BLOCK_PROP_INVALID',
        details: {
          path: 'blocks[0].props.typo.lineHeight.unit',
          type: 'testTypography',
          prop: 'typo',
          kind: 'typography',
          reason: 'enum',
          constraint: ['em', 'px'],
        },
      });
    });

    it('letterSpacing/wordSpacing fuori range producono reason "range"', () => {
      const result = validator.validateTree(
        [
          node({
            type: 'testTypography',
            props: {
              typo: {
                letterSpacing: { value: 100, unit: 'px' },
                wordSpacing: { value: -50, unit: 'em' },
              },
            },
          }),
        ],
        registry,
      );
      expect(result.errors).toContainEqual({
        code: 'BLOCK_PROP_INVALID',
        details: {
          path: 'blocks[0].props.typo.letterSpacing.value',
          type: 'testTypography',
          prop: 'typo',
          kind: 'typography',
          reason: 'range',
          constraint: [-20, 50],
          actual: 100,
        },
      });
      expect(result.errors).toContainEqual({
        code: 'BLOCK_PROP_INVALID',
        details: {
          path: 'blocks[0].props.typo.wordSpacing.value',
          type: 'testTypography',
          prop: 'typo',
          kind: 'typography',
          reason: 'range',
          constraint: [-20, 100],
          actual: -50,
        },
      });
    });

    it('fontFamily riusa la validazione di fontRef: family fuori vocabolario system produce reason "enum" sul path annidato', () => {
      const result = validator.validateTree(
        [
          node({
            type: 'testTypography',
            props: { typo: { fontFamily: { family: 'wingdings', source: 'system' } } },
          }),
        ],
        registry,
      );
      expect(result.errors).toContainEqual({
        code: 'BLOCK_PROP_INVALID',
        details: {
          path: 'blocks[0].props.typo.fontFamily.family',
          type: 'testTypography',
          prop: 'typo',
          kind: 'typography',
          reason: 'enum',
          constraint: ['default', 'inter', 'roboto', 'playfair', 'montserrat', 'monospace'],
        },
      });
    });

    it('un valore non oggetto (scalare) produce reason "type" sul path della prop', () => {
      const result = validator.validateTree(
        [node({ type: 'testTypography', props: { typo: 'bold 16px' } })],
        registry,
      );
      expect(result.errors).toContainEqual({
        code: 'BLOCK_PROP_INVALID',
        details: {
          path: 'blocks[0].props.typo',
          type: 'testTypography',
          prop: 'typo',
          kind: 'typography',
          reason: 'type',
        },
      });
    });

    it('responsive per campo: fontSize come inviluppo { default, tablet } è accettato', () => {
      const result = validator.validateTree(
        [
          node({
            type: 'testTypography',
            props: {
              typo: {
                fontSize: { default: { value: 32, unit: 'px' }, tablet: { value: 24, unit: 'px' } },
              },
            },
          }),
        ],
        registryResponsive,
      );
      expect(result.valid).toBe(true);
    });

    it('responsive per campo: un fontSize fuori range dentro "tablet" produce reason "range" sul path completo', () => {
      const result = validator.validateTree(
        [
          node({
            type: 'testTypography',
            props: {
              typo: {
                fontSize: {
                  default: { value: 32, unit: 'px' },
                  tablet: { value: 999, unit: 'px' },
                },
              },
            },
          }),
        ],
        registryResponsive,
      );
      expect(result.errors).toContainEqual({
        code: 'BLOCK_PROP_INVALID',
        details: {
          path: 'blocks[0].props.typo.fontSize.tablet.value',
          type: 'testTypography',
          prop: 'typo',
          kind: 'typography',
          reason: 'range',
          constraint: [1, 400],
          actual: 999,
        },
      });
    });

    it("stateful sull'intero oggetto: { normal, hover } con fontSize diversi è accettato", () => {
      const result = validator.validateTree(
        [
          node({
            type: 'testTypography',
            props: {
              typo: {
                normal: { fontSize: { value: 16, unit: 'px' } },
                hover: { fontSize: { value: 18, unit: 'px' } },
              },
            },
          }),
        ],
        registryStateful,
      );
      expect(result.valid).toBe(true);
    });

    it('stateful senza "normal" produce reason "type" sul path della prop', () => {
      const result = validator.validateTree(
        [
          node({
            type: 'testTypography',
            props: { typo: { hover: { fontSize: { value: 18, unit: 'px' } } } },
          }),
        ],
        registryStateful,
      );
      expect(result.errors).toContainEqual({
        code: 'BLOCK_PROP_INVALID',
        details: {
          path: 'blocks[0].props.typo',
          type: 'testTypography',
          prop: 'typo',
          kind: 'typography',
          reason: 'type',
        },
      });
    });

    it('stateful + responsive combinati: ordine stato → campo → breakpoint', () => {
      const result = validator.validateTree(
        [
          node({
            type: 'testTypography',
            props: {
              typo: {
                normal: { fontSize: { default: { value: 16, unit: 'px' } } },
                hover: {
                  fontSize: {
                    default: { value: 18, unit: 'px' },
                    tablet: { value: 17, unit: 'px' },
                  },
                },
              },
            },
          }),
        ],
        registryStatefulResponsive,
      );
      expect(result.valid).toBe(true);
    });

    it('stateful + responsive: un valore fuori range nel ramo hover.fontSize.tablet produce reason "range" sul path completo', () => {
      const result = validator.validateTree(
        [
          node({
            type: 'testTypography',
            props: {
              typo: {
                normal: { fontSize: { default: { value: 16, unit: 'px' } } },
                hover: {
                  fontSize: {
                    default: { value: 18, unit: 'px' },
                    tablet: { value: 900, unit: 'px' },
                  },
                },
              },
            },
          }),
        ],
        registryStatefulResponsive,
      );
      expect(result.errors).toContainEqual({
        code: 'BLOCK_PROP_INVALID',
        details: {
          path: 'blocks[0].props.typo.hover.fontSize.tablet.value',
          type: 'testTypography',
          prop: 'typo',
          kind: 'typography',
          reason: 'range',
          constraint: [1, 400],
          actual: 900,
        },
      });
    });
  });

  // ─── spacing (SPEC-PROPKIND-V2-DETAILS.md § 4) ─────────────────────────

  describe('kind "spacing"', () => {
    const spec = {
      kind: 'spacing' as const,
      required: false,
      units: ['px', '%'] as const,
      min: 0,
      max: 96,
      target: 'padding' as const,
    };
    const registry = registryWithProp('testSpacing', 'padding', spec);
    const registryResponsive = registryWithProp('testSpacing', 'padding', {
      ...spec,
      responsive: true,
    });
    // `stateful` non è mai onorato per `spacing` (ADR-75 § "Decisione" punto 6).
    const registryIgnoredStateful = registryWithProp('testSpacing', 'padding', {
      ...spec,
      stateful: true,
    });

    it('un valore nudo dentro i vincoli è accettato', () => {
      const result = validator.validateTree(
        [
          node({
            type: 'testSpacing',
            props: { padding: { top: 8, right: 8, bottom: 8, left: 8, unit: 'px', linked: true } },
          }),
        ],
        registry,
      );
      expect(result.valid).toBe(true);
    });

    it('un lato oltre il massimo (96) produce reason "range" sul sotto-path del lato', () => {
      const result = validator.validateTree(
        [
          node({
            type: 'testSpacing',
            props: {
              padding: { top: 200, right: 8, bottom: 8, left: 8, unit: 'px', linked: true },
            },
          }),
        ],
        registry,
      );
      expect(result.errors).toContainEqual({
        code: 'BLOCK_PROP_INVALID',
        details: {
          path: 'blocks[0].props.padding.top',
          type: 'testSpacing',
          prop: 'padding',
          kind: 'spacing',
          reason: 'range',
          constraint: [0, 96],
          actual: 200,
        },
      });
    });

    it('unit fuori dall\'elenco dichiarato dalla prop produce reason "enum"', () => {
      const result = validator.validateTree(
        [
          node({
            type: 'testSpacing',
            props: { padding: { top: 8, right: 8, bottom: 8, left: 8, unit: 'vh', linked: true } },
          }),
        ],
        registry,
      );
      expect(result.errors).toContainEqual({
        code: 'BLOCK_PROP_INVALID',
        details: {
          path: 'blocks[0].props.padding.unit',
          type: 'testSpacing',
          prop: 'padding',
          kind: 'spacing',
          reason: 'enum',
          constraint: ['px', '%'],
        },
      });
    });

    it('linked non booleano produce reason "type" sul sotto-path .linked', () => {
      const result = validator.validateTree(
        [
          node({
            type: 'testSpacing',
            props: { padding: { top: 8, right: 8, bottom: 8, left: 8, unit: 'px', linked: 'yes' } },
          }),
        ],
        registry,
      );
      expect(result.errors).toContainEqual({
        code: 'BLOCK_PROP_INVALID',
        details: {
          path: 'blocks[0].props.padding.linked',
          type: 'testSpacing',
          prop: 'padding',
          kind: 'spacing',
          reason: 'type',
        },
      });
    });

    it('un oggetto con una chiave estranea è respinto per intero con reason "type"', () => {
      const result = validator.validateTree(
        [
          node({
            type: 'testSpacing',
            props: {
              padding: { top: 8, right: 8, bottom: 8, left: 8, unit: 'px', linked: true, evil: 1 },
            },
          }),
        ],
        registry,
      );
      expect(result.errors).toContainEqual({
        code: 'BLOCK_PROP_INVALID',
        details: {
          path: 'blocks[0].props.padding',
          type: 'testSpacing',
          prop: 'padding',
          kind: 'spacing',
          reason: 'type',
        },
      });
    });

    it("inviluppo responsive { default, tablet } sull'intero oggetto è accettato", () => {
      const result = validator.validateTree(
        [
          node({
            type: 'testSpacing',
            props: {
              padding: {
                default: { top: 16, right: 16, bottom: 16, left: 16, unit: 'px', linked: true },
                tablet: { top: 8, right: 8, bottom: 8, left: 8, unit: 'px', linked: true },
              },
            },
          }),
        ],
        registryResponsive,
      );
      expect(result.valid).toBe(true);
    });

    it('`stateful: true` sul descrittore è ignorato: un valore nudo resta accettato (mai un inviluppo di stato)', () => {
      const result = validator.validateTree(
        [
          node({
            type: 'testSpacing',
            props: { padding: { top: 8, right: 8, bottom: 8, left: 8, unit: 'px', linked: true } },
          }),
        ],
        registryIgnoredStateful,
      );
      expect(result.valid).toBe(true);
    });
  });

  // ─── radius (SPEC-PROPKIND-V2-DETAILS.md § 5) ──────────────────────────

  describe('kind "radius" — mai stateful/responsive', () => {
    const registry = registryWithProp('testRadius', 'radius', { kind: 'radius', required: false });

    it('un valore nudo dentro i vincoli fissi (0–500) è accettato', () => {
      const result = validator.validateTree(
        [
          node({
            type: 'testRadius',
            props: { radius: { tl: 8, tr: 8, br: 8, bl: 8, unit: 'px', linked: true } },
          }),
        ],
        registry,
      );
      expect(result.valid).toBe(true);
    });

    it('un vertice oltre il massimo fisso (500) produce reason "range"', () => {
      const result = validator.validateTree(
        [
          node({
            type: 'testRadius',
            props: { radius: { tl: 999, tr: 8, br: 8, bl: 8, unit: 'px', linked: true } },
          }),
        ],
        registry,
      );
      expect(result.errors).toContainEqual({
        code: 'BLOCK_PROP_INVALID',
        details: {
          path: 'blocks[0].props.radius.tl',
          type: 'testRadius',
          prop: 'radius',
          kind: 'radius',
          reason: 'range',
          constraint: [0, 500],
          actual: 999,
        },
      });
    });

    it('unit fuori da px|% produce reason "enum"', () => {
      const result = validator.validateTree(
        [
          node({
            type: 'testRadius',
            props: { radius: { tl: 8, tr: 8, br: 8, bl: 8, unit: 'em', linked: true } },
          }),
        ],
        registry,
      );
      expect(result.errors).toContainEqual({
        code: 'BLOCK_PROP_INVALID',
        details: {
          path: 'blocks[0].props.radius.unit',
          type: 'testRadius',
          prop: 'radius',
          kind: 'radius',
          reason: 'enum',
          constraint: ['px', '%'],
        },
      });
    });

    it('un inviluppo stateful/responsive non è mai atteso: { normal: {...} } produce reason "type" (chiave estranea)', () => {
      const result = validator.validateTree(
        [
          node({
            type: 'testRadius',
            props: { radius: { normal: { tl: 8, tr: 8, br: 8, bl: 8, unit: 'px', linked: true } } },
          }),
        ],
        registry,
      );
      expect(result.errors).toContainEqual({
        code: 'BLOCK_PROP_INVALID',
        details: {
          path: 'blocks[0].props.radius',
          type: 'testRadius',
          prop: 'radius',
          kind: 'radius',
          reason: 'type',
        },
      });
    });
  });

  // ─── gradient (SPEC-PROPKIND-V2-DETAILS.md § 6) ────────────────────────

  describe('kind "gradient" — mai stateful/responsive', () => {
    const registry = registryWithProp('testGradient', 'bg', { kind: 'gradient', required: false });

    it('un gradiente lineare valido (2 stop) è accettato', () => {
      const result = validator.validateTree(
        [
          node({
            type: 'testGradient',
            props: {
              bg: {
                type: 'linear',
                angle: 90,
                stops: [
                  { color: '#fff', at: 0 },
                  { color: '#000', at: 100 },
                ],
              },
            },
          }),
        ],
        registry,
      );
      expect(result.valid).toBe(true);
    });

    it('un gradiente radiale con position valido è accettato', () => {
      const result = validator.validateTree(
        [
          node({
            type: 'testGradient',
            props: {
              bg: {
                type: 'radial',
                position: 'center center',
                stops: [
                  { color: { ref: 'primary' }, at: 0 },
                  { color: '#000', at: 100 },
                ],
              },
            },
          }),
        ],
        registry,
      );
      expect(result.valid).toBe(true);
    });

    it('type fuori da linear|radial produce reason "enum"', () => {
      const result = validator.validateTree(
        [
          node({
            type: 'testGradient',
            props: {
              bg: {
                type: 'conic',
                stops: [
                  { color: '#fff', at: 0 },
                  { color: '#000', at: 100 },
                ],
              },
            },
          }),
        ],
        registry,
      );
      expect(result.errors).toContainEqual({
        code: 'BLOCK_PROP_INVALID',
        details: {
          path: 'blocks[0].props.bg.type',
          type: 'testGradient',
          prop: 'bg',
          kind: 'gradient',
          reason: 'enum',
          constraint: ['linear', 'radial'],
        },
      });
    });

    it('angle oltre 0–360 produce reason "range"', () => {
      const result = validator.validateTree(
        [
          node({
            type: 'testGradient',
            props: {
              bg: {
                type: 'linear',
                angle: 400,
                stops: [
                  { color: '#fff', at: 0 },
                  { color: '#000', at: 100 },
                ],
              },
            },
          }),
        ],
        registry,
      );
      expect(result.errors).toContainEqual({
        code: 'BLOCK_PROP_INVALID',
        details: {
          path: 'blocks[0].props.bg.angle',
          type: 'testGradient',
          prop: 'bg',
          kind: 'gradient',
          reason: 'range',
          constraint: [0, 360],
          actual: 400,
        },
      });
    });

    it('position fuori dal vocabolario chiuso (9 valori) produce reason "enum"', () => {
      const result = validator.validateTree(
        [
          node({
            type: 'testGradient',
            props: {
              bg: {
                type: 'radial',
                position: 'middle',
                stops: [
                  { color: '#fff', at: 0 },
                  { color: '#000', at: 100 },
                ],
              },
            },
          }),
        ],
        registry,
      );
      expect(result.errors).toContainEqual({
        code: 'BLOCK_PROP_INVALID',
        details: {
          path: 'blocks[0].props.bg.position',
          type: 'testGradient',
          prop: 'bg',
          kind: 'gradient',
          reason: 'enum',
          constraint: [
            'top left',
            'top center',
            'top right',
            'center left',
            'center center',
            'center right',
            'bottom left',
            'bottom center',
            'bottom right',
          ],
        },
      });
    });

    it('meno di 2 stop produce reason "range" su .stops', () => {
      const result = validator.validateTree(
        [
          node({
            type: 'testGradient',
            props: { bg: { type: 'linear', stops: [{ color: '#fff', at: 0 }] } },
          }),
        ],
        registry,
      );
      expect(result.errors).toContainEqual({
        code: 'BLOCK_PROP_INVALID',
        details: {
          path: 'blocks[0].props.bg.stops',
          type: 'testGradient',
          prop: 'bg',
          kind: 'gradient',
          reason: 'range',
          constraint: [2, 6],
          actual: 1,
        },
      });
    });

    it('più di 6 stop produce reason "range" su .stops', () => {
      const stops = Array.from({ length: 7 }, (_, i) => ({ color: '#fff', at: i * 10 }));
      const result = validator.validateTree(
        [node({ type: 'testGradient', props: { bg: { type: 'linear', stops } } })],
        registry,
      );
      expect(result.errors).toContainEqual({
        code: 'BLOCK_PROP_INVALID',
        details: {
          path: 'blocks[0].props.bg.stops',
          type: 'testGradient',
          prop: 'bg',
          kind: 'gradient',
          reason: 'range',
          constraint: [2, 6],
          actual: 7,
        },
      });
    });

    it('uno stop con colore fuori forma produce reason "format" sul path dello stop (nessun allowAlpha implicito)', () => {
      const result = validator.validateTree(
        [
          node({
            type: 'testGradient',
            props: {
              bg: {
                type: 'linear',
                stops: [
                  { color: '#ffaa0080', at: 0 },
                  { color: '#000', at: 100 },
                ],
              },
            },
          }),
        ],
        registry,
      );
      expect(result.errors).toContainEqual({
        code: 'BLOCK_PROP_INVALID',
        details: {
          path: 'blocks[0].props.bg.stops[0].color',
          type: 'testGradient',
          prop: 'bg',
          kind: 'gradient',
          reason: 'format',
        },
      });
    });

    it('uno stop con "at" fuori 0–100 produce reason "range"', () => {
      const result = validator.validateTree(
        [
          node({
            type: 'testGradient',
            props: {
              bg: {
                type: 'linear',
                stops: [
                  { color: '#fff', at: -5 },
                  { color: '#000', at: 100 },
                ],
              },
            },
          }),
        ],
        registry,
      );
      expect(result.errors).toContainEqual({
        code: 'BLOCK_PROP_INVALID',
        details: {
          path: 'blocks[0].props.bg.stops[0].at',
          type: 'testGradient',
          prop: 'bg',
          kind: 'gradient',
          reason: 'range',
          constraint: [0, 100],
          actual: -5,
        },
      });
    });
  });

  // ─── position (SPEC-PROPKIND-V2-DETAILS.md § 7) ────────────────────────

  describe('kind "position"', () => {
    const registry = registryWithProp('testPosition', 'pos', { kind: 'position', required: false });
    const registryResponsive = registryWithProp('testPosition', 'pos', {
      kind: 'position',
      required: false,
      responsive: true,
    });

    it.each(['default', 'relative', 'absolute', 'fixed', 'sticky'])(
      'type: %j da solo è accettato',
      (type) => {
        const result = validator.validateTree(
          [node({ type: 'testPosition', props: { pos: { type } } })],
          registry,
        );
        expect(result.valid).toBe(true);
      },
    );

    it('type fuori dall\'elenco chiuso produce reason "enum"', () => {
      const result = validator.validateTree(
        [node({ type: 'testPosition', props: { pos: { type: 'floating' } } })],
        registry,
      );
      expect(result.errors).toContainEqual({
        code: 'BLOCK_PROP_INVALID',
        details: {
          path: 'blocks[0].props.pos.type',
          type: 'testPosition',
          prop: 'pos',
          kind: 'position',
          reason: 'enum',
          constraint: ['default', 'relative', 'absolute', 'fixed', 'sticky'],
        },
      });
    });

    it('offset nudo con un lato fuori range (-1000..1000) produce reason "range"', () => {
      const result = validator.validateTree(
        [
          node({
            type: 'testPosition',
            props: { pos: { type: 'absolute', offset: { top: { value: 2000, unit: 'px' } } } },
          }),
        ],
        registry,
      );
      expect(result.errors).toContainEqual({
        code: 'BLOCK_PROP_INVALID',
        details: {
          path: 'blocks[0].props.pos.offset.top.value',
          type: 'testPosition',
          prop: 'pos',
          kind: 'position',
          reason: 'range',
          constraint: [-1000, 1000],
          actual: 2000,
        },
      });
    });

    it('zIndex fuori da -10..9999 produce reason "range"', () => {
      const result = validator.validateTree(
        [node({ type: 'testPosition', props: { pos: { type: 'relative', zIndex: 20000 } } })],
        registry,
      );
      expect(result.errors).toContainEqual({
        code: 'BLOCK_PROP_INVALID',
        details: {
          path: 'blocks[0].props.pos.zIndex',
          type: 'testPosition',
          prop: 'pos',
          kind: 'position',
          reason: 'range',
          constraint: [-10, 9999],
          actual: 20000,
        },
      });
    });

    it('sticky valido è accettato', () => {
      const result = validator.validateTree(
        [
          node({
            type: 'testPosition',
            props: {
              pos: {
                type: 'sticky',
                sticky: {
                  edge: 'top',
                  offset: { value: 0, unit: 'px' },
                  onBreakpoints: ['tablet'],
                  stayInParent: true,
                },
              },
            },
          }),
        ],
        registry,
      );
      expect(result.valid).toBe(true);
    });

    it('sticky.edge fuori da top|bottom produce reason "enum"', () => {
      const result = validator.validateTree(
        [
          node({
            type: 'testPosition',
            props: {
              pos: {
                type: 'sticky',
                sticky: {
                  edge: 'left',
                  offset: { value: 0, unit: 'px' },
                  onBreakpoints: [],
                  stayInParent: false,
                },
              },
            },
          }),
        ],
        registry,
      );
      expect(result.errors).toContainEqual({
        code: 'BLOCK_PROP_INVALID',
        details: {
          path: 'blocks[0].props.pos.sticky.edge',
          type: 'testPosition',
          prop: 'pos',
          kind: 'position',
          reason: 'enum',
          constraint: ['top', 'bottom'],
        },
      });
    });

    it('sticky.onBreakpoints con una chiave sconosciuta produce reason "enum" sul path indicizzato', () => {
      // `'widescreen'` non è più un esempio valido di chiave sconosciuta da
      // ADR-76 § "Decisione" punto 1/2 (S1.3): le 7 chiavi ADR-76 sono ora
      // l'unione chiusa di `RESPONSIVE_BREAKPOINTS`, `'widescreen'` inclusa —
      // una chiave nota (anche se disattivata per il sito) non è più un
      // errore di validazione (ADR-76 § "Decisione" punto 5). Si usa qui una
      // chiave davvero fuori dall'unione chiusa.
      const result = validator.validateTree(
        [
          node({
            type: 'testPosition',
            props: {
              pos: {
                type: 'sticky',
                sticky: {
                  edge: 'top',
                  offset: { value: 0, unit: 'px' },
                  onBreakpoints: ['xl-desktop'],
                  stayInParent: true,
                },
              },
            },
          }),
        ],
        registry,
      );
      expect(result.errors).toContainEqual({
        code: 'BLOCK_PROP_INVALID',
        details: {
          path: 'blocks[0].props.pos.sticky.onBreakpoints[0]',
          type: 'testPosition',
          prop: 'pos',
          kind: 'position',
          reason: 'enum',
          constraint: [
            'default',
            'widescreen',
            'laptop',
            'tabletExtra',
            'tablet',
            'mobileExtra',
            'mobile',
          ],
        },
      });
    });

    it('responsive sull\'intero oggetto "offset": { default, tablet } è accettato', () => {
      const result = validator.validateTree(
        [
          node({
            type: 'testPosition',
            props: {
              pos: {
                type: 'absolute',
                offset: {
                  default: { top: { value: 10, unit: 'px' } },
                  tablet: { top: { value: 4, unit: 'px' } },
                },
              },
            },
          }),
        ],
        registryResponsive,
      );
      expect(result.valid).toBe(true);
    });

    it('type: "fixed" dentro l\'albero di una Sezione Globale è respinto con reason "enum" (SPEC-PROPKIND-V2-DETAILS.md § 7 punto 4)', () => {
      const result = validator.validateTree(
        [node({ type: 'testPosition', props: { pos: { type: 'fixed' } } })],
        registry,
        { insideGlobalSection: true },
      );
      expect(result.errors).toContainEqual({
        code: 'BLOCK_PROP_INVALID',
        details: {
          path: 'blocks[0].props.pos.type',
          type: 'testPosition',
          prop: 'pos',
          kind: 'position',
          reason: 'enum',
          constraint: ['default', 'relative', 'sticky'],
        },
      });
    });

    it('type: "absolute" dentro l\'albero di una Sezione Globale è respinto', () => {
      const result = validator.validateTree(
        [node({ type: 'testPosition', props: { pos: { type: 'absolute' } } })],
        registry,
        { insideGlobalSection: true },
      );
      expect(result.valid).toBe(false);
    });

    it('type: "relative" dentro l\'albero di una Sezione Globale resta accettato (nessuna restrizione fuori da fixed/absolute)', () => {
      const result = validator.validateTree(
        [node({ type: 'testPosition', props: { pos: { type: 'relative' } } })],
        registry,
        { insideGlobalSection: true },
      );
      expect(result.valid).toBe(true);
    });

    it('type: "fixed" fuori da una Sezione Globale resta accettato (nessuna restrizione senza il contesto)', () => {
      const result = validator.validateTree(
        [node({ type: 'testPosition', props: { pos: { type: 'fixed' } } })],
        registry,
      );
      expect(result.valid).toBe(true);
    });
  });

  // ─── transform (SPEC-PROPKIND-V2-DETAILS.md § 8) ───────────────────────

  describe('kind "transform"', () => {
    const registry = registryWithProp('testTransform', 'tr', {
      kind: 'transform',
      required: false,
    });
    const registryStateful = registryWithProp('testTransform', 'tr', {
      kind: 'transform',
      required: false,
      stateful: true,
    });
    const registryResponsive = registryWithProp('testTransform', 'tr', {
      kind: 'transform',
      required: false,
      responsive: true,
    });
    const registryStatefulResponsive = registryWithProp('testTransform', 'tr', {
      kind: 'transform',
      required: false,
      stateful: true,
      responsive: true,
    });

    it('un valore nudo completo dentro i vincoli è accettato', () => {
      const result = validator.validateTree(
        [
          node({
            type: 'testTransform',
            props: {
              tr: {
                rotate: 45,
                scale: 1.2,
                skewX: 10,
                skewY: -10,
                translateX: { value: 20, unit: 'px' },
                translateY: { value: -10, unit: '%' },
                flipH: true,
                flipV: false,
                origin: 'top left',
              },
            },
          }),
        ],
        registry,
      );
      expect(result.valid).toBe(true);
    });

    it('rotate oltre -360..360 produce reason "range"', () => {
      const result = validator.validateTree(
        [node({ type: 'testTransform', props: { tr: { rotate: 400 } } })],
        registry,
      );
      expect(result.errors).toContainEqual({
        code: 'BLOCK_PROP_INVALID',
        details: {
          path: 'blocks[0].props.tr.rotate',
          type: 'testTransform',
          prop: 'tr',
          kind: 'transform',
          reason: 'range',
          constraint: [-360, 360],
          actual: 400,
        },
      });
    });

    it('scale oltre 0..3 produce reason "range"', () => {
      const result = validator.validateTree(
        [node({ type: 'testTransform', props: { tr: { scale: 5 } } })],
        registry,
      );
      expect(result.errors).toContainEqual({
        code: 'BLOCK_PROP_INVALID',
        details: {
          path: 'blocks[0].props.tr.scale',
          type: 'testTransform',
          prop: 'tr',
          kind: 'transform',
          reason: 'range',
          constraint: [0, 3],
          actual: 5,
        },
      });
    });

    it('skewX/skewY oltre -90..90 producono reason "range"', () => {
      const result = validator.validateTree(
        [node({ type: 'testTransform', props: { tr: { skewX: 120, skewY: -120 } } })],
        registry,
      );
      expect(result.errors).toContainEqual({
        code: 'BLOCK_PROP_INVALID',
        details: {
          path: 'blocks[0].props.tr.skewX',
          type: 'testTransform',
          prop: 'tr',
          kind: 'transform',
          reason: 'range',
          constraint: [-90, 90],
          actual: 120,
        },
      });
    });

    it('origin fuori dal vocabolario chiuso produce reason "enum"', () => {
      const result = validator.validateTree(
        [node({ type: 'testTransform', props: { tr: { origin: 'middle' } } })],
        registry,
      );
      expect(result.errors).toContainEqual({
        code: 'BLOCK_PROP_INVALID',
        details: {
          path: 'blocks[0].props.tr.origin',
          type: 'testTransform',
          prop: 'tr',
          kind: 'transform',
          reason: 'enum',
          constraint: [
            'center',
            'top',
            'bottom',
            'left',
            'right',
            'top left',
            'top right',
            'bottom left',
            'bottom right',
          ],
        },
      });
    });

    it('flipH non booleano produce reason "type"', () => {
      const result = validator.validateTree(
        [node({ type: 'testTransform', props: { tr: { flipH: 'yes' } } })],
        registry,
      );
      expect(result.errors).toContainEqual({
        code: 'BLOCK_PROP_INVALID',
        details: {
          path: 'blocks[0].props.tr.flipH',
          type: 'testTransform',
          prop: 'tr',
          kind: 'transform',
          reason: 'type',
        },
      });
    });

    it('translateX con unit fuori da px|% produce reason "enum"', () => {
      const result = validator.validateTree(
        [node({ type: 'testTransform', props: { tr: { translateX: { value: 10, unit: 'em' } } } })],
        registry,
      );
      expect(result.errors).toContainEqual({
        code: 'BLOCK_PROP_INVALID',
        details: {
          path: 'blocks[0].props.tr.translateX.unit',
          type: 'testTransform',
          prop: 'tr',
          kind: 'transform',
          reason: 'enum',
          constraint: ['px', '%'],
        },
      });
    });

    it('translateX/translateY non hanno un intervallo numerico dichiarato dai documenti: un valore molto grande con unità valida è accettato (vedi nota di scope)', () => {
      const result = validator.validateTree(
        [
          node({
            type: 'testTransform',
            props: { tr: { translateX: { value: 999999, unit: 'px' } } },
          }),
        ],
        registry,
      );
      expect(result.valid).toBe(true);
    });

    it("inviluppo stateful { normal, hover } sull'intero oggetto è accettato", () => {
      const result = validator.validateTree(
        [
          node({
            type: 'testTransform',
            props: { tr: { normal: { rotate: 0 }, hover: { rotate: 5, scale: 1.05 } } },
          }),
        ],
        registryStateful,
      );
      expect(result.valid).toBe(true);
    });

    it("inviluppo responsive { default, tablet } sull'intero oggetto è accettato", () => {
      const result = validator.validateTree(
        [
          node({
            type: 'testTransform',
            props: { tr: { default: { rotate: 0 }, tablet: { rotate: 10 } } },
          }),
        ],
        registryResponsive,
      );
      expect(result.valid).toBe(true);
    });

    it('stateful + responsive combinati: ordine stato → breakpoint → valore', () => {
      const result = validator.validateTree(
        [
          node({
            type: 'testTransform',
            props: {
              tr: {
                normal: { default: { rotate: 0 } },
                hover: { default: { rotate: 5 }, tablet: { rotate: 3 } },
              },
            },
          }),
        ],
        registryStatefulResponsive,
      );
      expect(result.valid).toBe(true);
    });

    it('stateful + responsive: un rotate fuori range nel ramo hover.tablet produce reason "range" sul path completo', () => {
      const result = validator.validateTree(
        [
          node({
            type: 'testTransform',
            props: {
              tr: {
                normal: { default: { rotate: 0 } },
                hover: { default: { rotate: 5 }, tablet: { rotate: 500 } },
              },
            },
          }),
        ],
        registryStatefulResponsive,
      );
      expect(result.errors).toContainEqual({
        code: 'BLOCK_PROP_INVALID',
        details: {
          path: 'blocks[0].props.tr.hover.tablet.rotate',
          type: 'testTransform',
          prop: 'tr',
          kind: 'transform',
          reason: 'range',
          constraint: [-360, 360],
          actual: 500,
        },
      });
    });
  });

  // ─── filter (SPEC-PROPKIND-V2-DETAILS.md § 9) ──────────────────────────

  describe('kind "filter"', () => {
    const registry = registryWithProp('testFilter', 'fx', { kind: 'filter', required: false });
    const registryStateful = registryWithProp('testFilter', 'fx', {
      kind: 'filter',
      required: false,
      stateful: true,
    });
    const registryResponsive = registryWithProp('testFilter', 'fx', {
      kind: 'filter',
      required: false,
      responsive: true,
    });
    const registryStatefulResponsive = registryWithProp('testFilter', 'fx', {
      kind: 'filter',
      required: false,
      stateful: true,
      responsive: true,
    });

    it('un valore nudo completo dentro i vincoli è accettato', () => {
      const result = validator.validateTree(
        [
          node({
            type: 'testFilter',
            props: {
              fx: {
                blur: 5,
                brightness: 120,
                contrast: 90,
                saturate: 150,
                hue: 45,
                grayscale: 20,
                blend: 'multiply',
              },
            },
          }),
        ],
        registry,
      );
      expect(result.valid).toBe(true);
    });

    it('blur oltre 0..20 produce reason "range"', () => {
      const result = validator.validateTree(
        [node({ type: 'testFilter', props: { fx: { blur: 50 } } })],
        registry,
      );
      expect(result.errors).toContainEqual({
        code: 'BLOCK_PROP_INVALID',
        details: {
          path: 'blocks[0].props.fx.blur',
          type: 'testFilter',
          prop: 'fx',
          kind: 'filter',
          reason: 'range',
          constraint: [0, 20],
          actual: 50,
        },
      });
    });

    it.each(['brightness', 'contrast', 'saturate'])(
      '%s oltre 0..200 produce reason "range"',
      (field) => {
        const result = validator.validateTree(
          [node({ type: 'testFilter', props: { fx: { [field]: 300 } } })],
          registry,
        );
        expect(result.errors).toContainEqual({
          code: 'BLOCK_PROP_INVALID',
          details: {
            path: `blocks[0].props.fx.${field}`,
            type: 'testFilter',
            prop: 'fx',
            kind: 'filter',
            reason: 'range',
            constraint: [0, 200],
            actual: 300,
          },
        });
      },
    );

    it('hue oltre 0..360 produce reason "range"', () => {
      const result = validator.validateTree(
        [node({ type: 'testFilter', props: { fx: { hue: 400 } } })],
        registry,
      );
      expect(result.errors).toContainEqual({
        code: 'BLOCK_PROP_INVALID',
        details: {
          path: 'blocks[0].props.fx.hue',
          type: 'testFilter',
          prop: 'fx',
          kind: 'filter',
          reason: 'range',
          constraint: [0, 360],
          actual: 400,
        },
      });
    });

    it('grayscale oltre 0..100 produce reason "range"', () => {
      const result = validator.validateTree(
        [node({ type: 'testFilter', props: { fx: { grayscale: 150 } } })],
        registry,
      );
      expect(result.errors).toContainEqual({
        code: 'BLOCK_PROP_INVALID',
        details: {
          path: 'blocks[0].props.fx.grayscale',
          type: 'testFilter',
          prop: 'fx',
          kind: 'filter',
          reason: 'range',
          constraint: [0, 100],
          actual: 150,
        },
      });
    });

    it('blend fuori dal vocabolario chiuso a 12 valori produce reason "enum"', () => {
      const result = validator.validateTree(
        [node({ type: 'testFilter', props: { fx: { blend: 'saturation' } } })],
        registry,
      );
      expect(result.errors).toContainEqual({
        code: 'BLOCK_PROP_INVALID',
        details: {
          path: 'blocks[0].props.fx.blend',
          type: 'testFilter',
          prop: 'fx',
          kind: 'filter',
          reason: 'enum',
          constraint: [
            'normal',
            'multiply',
            'screen',
            'overlay',
            'darken',
            'lighten',
            'color-dodge',
            'color-burn',
            'hard-light',
            'soft-light',
            'difference',
            'exclusion',
          ],
        },
      });
    });

    it('inviluppo stateful { normal, hover } è accettato', () => {
      const result = validator.validateTree(
        [node({ type: 'testFilter', props: { fx: { normal: { blur: 0 }, hover: { blur: 8 } } } })],
        registryStateful,
      );
      expect(result.valid).toBe(true);
    });

    it('inviluppo responsive { default, tablet } è accettato', () => {
      const result = validator.validateTree(
        [
          node({
            type: 'testFilter',
            props: { fx: { default: { blur: 0 }, tablet: { blur: 4 } } },
          }),
        ],
        registryResponsive,
      );
      expect(result.valid).toBe(true);
    });

    it('stateful + responsive combinati: ordine stato → breakpoint → valore', () => {
      const result = validator.validateTree(
        [
          node({
            type: 'testFilter',
            props: {
              fx: {
                normal: { default: { blur: 0 } },
                hover: { default: { blur: 8 }, tablet: { blur: 4 } },
              },
            },
          }),
        ],
        registryStatefulResponsive,
      );
      expect(result.valid).toBe(true);
    });

    it('stateful + responsive: un blur fuori range nel ramo hover.tablet produce reason "range" sul path completo', () => {
      const result = validator.validateTree(
        [
          node({
            type: 'testFilter',
            props: {
              fx: {
                normal: { default: { blur: 0 } },
                hover: { default: { blur: 8 }, tablet: { blur: 999 } },
              },
            },
          }),
        ],
        registryStatefulResponsive,
      );
      expect(result.errors).toContainEqual({
        code: 'BLOCK_PROP_INVALID',
        details: {
          path: 'blocks[0].props.fx.hover.tablet.blur',
          type: 'testFilter',
          prop: 'fx',
          kind: 'filter',
          reason: 'range',
          constraint: [0, 20],
          actual: 999,
        },
      });
    });
  });

  // ─── reason "required" anche per un kind v2 (generico, riuso di validateProps) ─

  describe('BLOCK_PROP_INVALID — reason "required" su un kind v2', () => {
    const registry = registryWithProp('testRequiredTypography', 'typo', {
      kind: 'typography',
      required: true,
    });

    it('una prop v2 obbligatoria assente produce reason "required" col kind corretto', () => {
      const result = validator.validateTree(
        [node({ type: 'testRequiredTypography', props: {} })],
        registry,
      );
      expect(result.errors).toContainEqual({
        code: 'BLOCK_PROP_INVALID',
        details: {
          path: 'blocks[0].props.typo',
          type: 'testRequiredTypography',
          prop: 'typo',
          kind: 'typography',
          reason: 'required',
        },
      });
    });
  });

  // ─── Regressione: i PropKind v1 restano invariati (ADR-21/ADR-29/ADR-38) ─

  describe("regressione — PropKind v1 invariati dopo l'estensione v2 (aggiornata S1.4: container/section deprecato, ADR-81/ADR-82)", () => {
    it('il registro di produzione valida ancora un albero container v2 con i quattro tipi foglia v2 senza alcuna differenza osservabile', () => {
      const result = validator.validateTree([
        node({
          id: 'root',
          type: 'container',
          props: {},
          children: [
            node({
              id: 'h',
              type: 'heading',
              props: {
                level: 'h2',
                text: 'Titolo',
                styleBorder: { width: 2, style: 'solid', color: '#333', radius: 8 },
              },
            }),
            node({ id: 'r', type: 'richText', props: { html: '<p>Ciao</p>' } }),
            node({
              id: 'i',
              type: 'image',
              props: { mediaRef: '0123456789abcdef', alt: 'Descrizione' },
            }),
            node({
              id: 'b',
              type: 'button',
              props: {
                label: 'Vai',
                link: { href: 'https://esempio.it', target: '_self', rel: [] },
              },
            }),
          ],
        }),
      ]);
      expect(result).toEqual({ valid: true, errors: [] });
      expect(DEFAULT_BLOCK_REGISTRY.rootAllowed).toContain('container');
    });

    it('kind "enum" responsive (ADR-29) continua a produrre reason "type"/"enum" identici a prima dell\'estensione v2 (verificato su heading.styleSpaceBefore, prop invariata dal bump ADR-81)', () => {
      const result = validator.validateTree([
        node({
          type: 'heading',
          props: { level: 'h2', text: 'T', styleSpaceBefore: { default: 'md', tablet: 'enorme' } },
        }),
      ]);
      expect(result.errors).toContainEqual({
        code: 'BLOCK_PROP_INVALID',
        details: {
          path: 'blocks[0].props.styleSpaceBefore.tablet',
          type: 'heading',
          prop: 'styleSpaceBefore',
          kind: 'enum',
          reason: 'enum',
          constraint: ['none', 'xs', 'sm', 'md', 'lg', 'xl'],
        },
      });
    });

    it('kind "unitValue"/"border" (ADR-38) continuano a validare identico (verificato su container.boxedWidth e heading.styleBorder, entrambe non stateful)', () => {
      const unitValueResult = validator.validateTree([
        node({
          type: 'container',
          props: { boxedWidth: { value: 5000, unit: 'px' } },
        }),
      ]);
      expect(unitValueResult.errors).toContainEqual({
        code: 'BLOCK_PROP_INVALID',
        details: {
          path: 'blocks[0].props.boxedWidth.value',
          type: 'container',
          prop: 'boxedWidth',
          kind: 'unitValue',
          reason: 'range',
          constraint: [0, 4000],
          actual: 5000,
        },
      });

      const borderResult = validator.validateTree([
        node({
          type: 'heading',
          props: {
            level: 'h2',
            text: 'T',
            styleBorder: { width: 50, style: 'solid', color: '#333', radius: 8 },
          },
        }),
      ]);
      expect(borderResult.errors).toContainEqual({
        code: 'BLOCK_PROP_INVALID',
        details: {
          path: 'blocks[0].props.styleBorder.width',
          type: 'heading',
          prop: 'styleBorder',
          kind: 'border',
          reason: 'range',
          constraint: [0, 12],
          actual: 50,
        },
      });
    });
  });
});
