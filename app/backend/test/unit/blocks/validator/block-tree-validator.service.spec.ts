import { BlockTreeValidatorService } from '../../../../src/blocks/validator/block-tree-validator.service';
import { ValidatableBlockNode } from '../../../../src/blocks/validator/validatable-node.types';
import { BlockRegistry, DEFAULT_BLOCK_REGISTRY } from '../../../../src/blocks/block-registry';
import { BlockDefinition } from '../../../../src/blocks/block-definition.types';
import { sectionBlock } from '../../../../src/blocks/types/section.block';
import { richTextBlock } from '../../../../src/blocks/types/rich-text.block';

/** Costruisce un nodo di test, con default sensati e override puntuali. */
function node(overrides: Partial<ValidatableBlockNode>): ValidatableBlockNode {
  return {
    id: 'n1',
    type: 'richText',
    props: {},
    children: [],
    ...overrides,
  };
}

describe('BlockTreeValidatorService (unit) — interprete di validazione contro il registro (SPEC-F02-blocchi.md § 3/§ 4)', () => {
  let validator: BlockTreeValidatorService;

  beforeEach(() => {
    validator = new BlockTreeValidatorService();
  });

  // ─── Happy path sui cinque tipi reali ──────────────────────────────────

  describe('happy path — cinque tipi reali', () => {
    it('un albero con una section che contiene i quattro tipi foglia ammessi è valido', () => {
      const tree: ValidatableBlockNode[] = [
        node({
          id: 'sec',
          type: 'section',
          props: {},
          children: [
            node({ id: 'h', type: 'heading', props: { level: 'h2', text: 'Titolo' } }),
            node({ id: 'r', type: 'richText', props: { html: '<p>Ciao</p>' } }),
            node({
              id: 'i',
              type: 'image',
              props: { mediaRef: '0123456789abcdef', alt: 'Descrizione' },
            }),
            node({ id: 'b', type: 'button', props: { label: 'Vai', href: 'https://esempio.it' } }),
          ],
        }),
      ];

      const result = validator.validateTree(tree);

      expect(result).toEqual({ valid: true, errors: [] });
    });

    it.each(['section', 'heading', 'richText', 'image', 'button'])(
      '%s è ammesso come nodo di radice (ROOT_ALLOWED, SPEC-F02 § 3.1)',
      (type) => {
        const props: Record<string, Record<string, unknown>> = {
          section: {},
          heading: { level: 'h2', text: 'T' },
          richText: { html: '<p>ok</p>' },
          image: { mediaRef: '0123456789abcdef', alt: 'alt' },
          button: { label: 'Vai', href: 'https://esempio.it' },
        };
        const result = validator.validateTree([node({ type, props: props[type] })]);
        expect(result.valid).toBe(true);
      },
    );
  });

  // ─── BLOCK_TYPE_UNKNOWN ─────────────────────────────────────────────────

  describe('BLOCK_TYPE_UNKNOWN', () => {
    it('type non nel registro produce BLOCK_TYPE_UNKNOWN col path, e non scende sui figli', () => {
      const tree = [node({ type: 'nonEsiste', children: [node({ id: 'child' })] })];

      const result = validator.validateTree(tree);

      expect(result.valid).toBe(false);
      expect(result.errors).toEqual([
        { code: 'BLOCK_TYPE_UNKNOWN', details: { path: 'blocks[0]', type: 'nonEsiste' } },
      ]);
    });

    it('enabled:false produce BLOCK_TYPE_UNKNOWN, stesso codice di un type inesistente', () => {
      const disabled: BlockDefinition = { ...richTextBlock, enabled: false };
      const registry: BlockRegistry = {
        definitions: new Map([['richText', disabled]]),
        rootAllowed: ['richText'],
      };

      const result = validator.validateTree(
        [node({ type: 'richText', props: { html: '<p>x</p>' } })],
        registry,
      );

      expect(result.errors).toEqual([
        { code: 'BLOCK_TYPE_UNKNOWN', details: { path: 'blocks[0]', type: 'richText' } },
      ]);
    });

    it('minRole non soddisfatto (roleLevel del contesto > minRole della definizione) produce BLOCK_TYPE_UNKNOWN', () => {
      const restricted: BlockDefinition = { ...richTextBlock, minRole: 5 };
      const registry: BlockRegistry = {
        definitions: new Map([['richText', restricted]]),
        rootAllowed: ['richText'],
      };

      const result = validator.validateTree(
        [node({ type: 'richText', props: { html: '<p>x</p>' } })],
        registry,
        { roleLevel: 30 }, // User: valore più alto di minRole (5) ⇒ non soddisfatto
      );

      expect(result.errors).toEqual([
        { code: 'BLOCK_TYPE_UNKNOWN', details: { path: 'blocks[0]', type: 'richText' } },
      ]);
    });

    it('minRole soddisfatto (roleLevel <= minRole) non produce errore', () => {
      const restricted: BlockDefinition = { ...richTextBlock, minRole: 20 };
      const registry: BlockRegistry = {
        definitions: new Map([['richText', restricted]]),
        rootAllowed: ['richText'],
      };

      const result = validator.validateTree(
        [node({ type: 'richText', props: { html: '<p>x</p>' } })],
        registry,
        { roleLevel: 10 }, // Admin: più privilegiato di minRole (20)
      );

      expect(result.valid).toBe(true);
    });

    it('nessun roleLevel nel contesto: minRole non applicato (nessun filtro)', () => {
      const restricted: BlockDefinition = { ...richTextBlock, minRole: 5 };
      const registry: BlockRegistry = {
        definitions: new Map([['richText', restricted]]),
        rootAllowed: ['richText'],
      };

      const result = validator.validateTree(
        [node({ type: 'richText', props: { html: '<p>x</p>' } })],
        registry,
        {},
      );

      expect(result.valid).toBe(true);
    });
  });

  // ─── BLOCK_NESTING_NOT_ALLOWED ──────────────────────────────────────────

  describe('BLOCK_NESTING_NOT_ALLOWED', () => {
    it('section dentro section: 400 con allowed popolato (§ 3.2, section non si annida in se stessa)', () => {
      const tree = [
        node({
          id: 'outer',
          type: 'section',
          props: {},
          children: [node({ id: 'inner', type: 'section', props: {} })],
        }),
      ];

      const result = validator.validateTree(tree);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        code: 'BLOCK_NESTING_NOT_ALLOWED',
        details: {
          path: 'blocks[0].children[0]',
          type: 'section',
          parentType: 'section',
          allowed: ['heading', 'richText', 'image', 'button'],
        },
      });
    });

    it('un tipo non in ROOT_ALLOWED alla radice produce BLOCK_NESTING_NOT_ALLOWED con parentType null', () => {
      const custom: BlockDefinition = { ...richTextBlock, type: 'fuoriRadice' };
      const registry: BlockRegistry = {
        definitions: new Map<string, BlockDefinition>([
          ['fuoriRadice', custom],
          ['section', sectionBlock],
        ]),
        rootAllowed: ['section'], // radice ristretta: fuoriRadice non ammesso
      };

      const result = validator.validateTree(
        [node({ type: 'fuoriRadice', props: { html: '<p>x</p>' } })],
        registry,
      );

      expect(result.errors).toContainEqual({
        code: 'BLOCK_NESTING_NOT_ALLOWED',
        details: { path: 'blocks[0]', type: 'fuoriRadice', parentType: null, allowed: ['section'] },
      });
    });

    it('continua a validare props e figli anche dopo un errore di annidamento (mai fermarsi al primo)', () => {
      const tree = [
        node({
          id: 'outer',
          type: 'section',
          props: {},
          children: [
            node({
              id: 'inner',
              type: 'section',
              props: { nonEsiste: true }, // section non dichiara alcuna prop
              children: [node({ id: 'leaf', type: 'heading', props: {} })], // level/text mancanti
            }),
          ],
        }),
      ];

      const result = validator.validateTree(tree);

      const codes = result.errors.map((e) => e.code).sort();
      expect(codes).toEqual(
        [
          'BLOCK_NESTING_NOT_ALLOWED',
          'BLOCK_PROP_INVALID',
          'BLOCK_PROP_INVALID',
          'BLOCK_PROP_NOT_DECLARED',
        ].sort(),
      );
    });
  });

  // ─── BLOCK_PROP_NOT_DECLARED ────────────────────────────────────────────

  describe('BLOCK_PROP_NOT_DECLARED', () => {
    it('section con una prop non dichiarata produce BLOCK_PROP_NOT_DECLARED (§ 3.2, T3: section ha solo props di stile opzionali)', () => {
      const result = validator.validateTree([node({ type: 'section', props: { anchor: 'x' } })]);

      expect(result.errors).toEqual([
        {
          code: 'BLOCK_PROP_NOT_DECLARED',
          details: {
            path: 'blocks[0].props.anchor',
            type: 'section',
            prop: 'anchor',
            declared: [
              'styleSpaceBefore',
              'styleSpaceAfter',
              'stylePadding',
              'styleBackground',
              'columns',
              'gap',
              'alignItems',
              'contentWidth',
              'maxWidth',
              'columnRatio',
              'styleBackgroundColor',
              'stylePaddingTop',
              'stylePaddingRight',
              'stylePaddingBottom',
              'stylePaddingLeft',
              'styleMarginTop',
              'styleMarginRight',
              'styleMarginBottom',
              'styleMarginLeft',
              'styleLayer',
              'styleHideDesktop',
              'styleHideTablet',
              'styleHideMobile',
            ],
          },
        },
      ]);
    });

    it('una prop extra non dichiarata su un tipo con props note viene comunque respinta', () => {
      const result = validator.validateTree([
        node({ type: 'heading', props: { level: 'h2', text: 'T', extra: 1 } }),
      ]);

      expect(result.errors).toContainEqual({
        code: 'BLOCK_PROP_NOT_DECLARED',
        details: {
          path: 'blocks[0].props.extra',
          type: 'heading',
          prop: 'extra',
          declared: [
            'level',
            'text',
            'styleSpaceBefore',
            'styleSpaceAfter',
            'styleTextColor',
            'styleFontSize',
            'styleFontWeight',
            'styleFontFamily',
            'styleLayer',
            'styleHideDesktop',
            'styleHideTablet',
            'styleHideMobile',
          ],
        },
      });
    });
  });

  // ─── BLOCK_PROP_INVALID — ogni reason ───────────────────────────────────

  describe('BLOCK_PROP_INVALID — reason "required"', () => {
    it('prop obbligatoria assente produce reason required', () => {
      const result = validator.validateTree([node({ type: 'heading', props: {} })]);

      expect(result.errors).toContainEqual({
        code: 'BLOCK_PROP_INVALID',
        details: {
          path: 'blocks[0].props.level',
          type: 'heading',
          prop: 'level',
          kind: 'enum',
          reason: 'required',
        },
      });
      expect(result.errors).toContainEqual({
        code: 'BLOCK_PROP_INVALID',
        details: {
          path: 'blocks[0].props.text',
          type: 'heading',
          prop: 'text',
          kind: 'plainText',
          reason: 'required',
        },
      });
    });
  });

  describe('BLOCK_PROP_INVALID — reason "type"', () => {
    it.each([
      ['heading', { level: 2, text: 'T' }, 'level', 'enum'], // level numerico invece di stringa
      ['richText', { html: 123 }, 'html', 'richText'],
      ['image', { mediaRef: 42, alt: 'x' }, 'mediaRef', 'mediaRef'],
      ['button', { label: true, href: 'https://esempio.it' }, 'label', 'plainText'],
      ['button', { label: 'x', href: 42 }, 'href', 'url'],
    ] as const)(
      '%s.%s con tipo JS sbagliato produce reason type',
      (type, props, propName, kind) => {
        const result = validator.validateTree([node({ type, props })]);

        expect(result.errors).toContainEqual({
          code: 'BLOCK_PROP_INVALID',
          details: {
            path: `blocks[0].props.${propName}`,
            type,
            prop: propName,
            kind,
            reason: 'type',
          },
        });
      },
    );
  });

  describe('BLOCK_PROP_INVALID — reason "empty" (solo image.alt, SPEC-F02 § 3.5)', () => {
    it.each(['', '   '])('image.alt = %j produce reason empty', (alt) => {
      const result = validator.validateTree([
        node({ type: 'image', props: { mediaRef: '0123456789abcdef', alt } }),
      ]);

      expect(result.errors).toContainEqual({
        code: 'BLOCK_PROP_INVALID',
        details: {
          path: 'blocks[0].props.alt',
          type: 'image',
          prop: 'alt',
          kind: 'plainText',
          reason: 'empty',
        },
      });
    });

    it('heading.text vuota NON produce reason empty: nonEmpty non è dichiarato su heading.text', () => {
      const result = validator.validateTree([
        node({ type: 'heading', props: { level: 'h2', text: '' } }),
      ]);

      expect(result.valid).toBe(true);
    });
  });

  describe('BLOCK_PROP_INVALID — reason "enum"', () => {
    it('heading.level = "h1" è respinto: fuori dall\'elenco ammesso (SPEC-F02 § 3.3)', () => {
      const result = validator.validateTree([
        node({ type: 'heading', props: { level: 'h1', text: 'T' } }),
      ]);

      expect(result.errors).toContainEqual({
        code: 'BLOCK_PROP_INVALID',
        details: {
          path: 'blocks[0].props.level',
          type: 'heading',
          prop: 'level',
          kind: 'enum',
          reason: 'enum',
          constraint: ['h2', 'h3', 'h4', 'h5', 'h6'],
        },
      });
    });

    it.each(['h2', 'h3', 'h4', 'h5', 'h6'])('heading.level = "%s" è accettato', (level) => {
      const result = validator.validateTree([
        node({ type: 'heading', props: { level, text: 'T' } }),
      ]);
      expect(result.valid).toBe(true);
    });
  });

  describe('BLOCK_PROP_INVALID — reason "urlScheme" (SPEC-F02 § 3.6)', () => {
    it.each([
      'javascript:alert(1)',
      '//evil.tld/x', // protocol-relative
      'pagina.html', // relativa senza barra iniziale
      '../su',
      'data:text/html,x',
      'vbscript:msgbox(1)',
      'file:///etc/passwd',
    ])('button.href = %j è respinto con reason urlScheme', (href) => {
      const result = validator.validateTree([
        node({ type: 'button', props: { label: 'Vai', href } }),
      ]);

      expect(result.errors).toContainEqual({
        code: 'BLOCK_PROP_INVALID',
        details: {
          path: 'blocks[0].props.href',
          type: 'button',
          prop: 'href',
          kind: 'url',
          reason: 'urlScheme',
        },
      });
    });

    it.each([
      'https://esempio.it/pagina',
      'http://esempio.it',
      'mailto:info@esempio.it',
      '/servizi/consulenza', // root-relative, una sola barra iniziale
    ])('button.href = %j è accettato', (href) => {
      const result = validator.validateTree([
        node({ type: 'button', props: { label: 'Vai', href } }),
      ]);
      expect(result.valid).toBe(true);
    });
  });

  describe('BLOCK_PROP_INVALID — reason "maxLength" (solo su url: SPEC-F02 § 1.4, correzione T3)', () => {
    it('button.href oltre 2048 code point è respinto qui, prima della sanitizzazione (url non passa da sanitize-html)', () => {
      const longHref = `https://esempio.it/${'a'.repeat(2048)}`;
      const result = validator.validateTree([
        node({ type: 'button', props: { label: 'Vai', href: longHref } }),
      ]);

      expect(result.errors).toContainEqual({
        code: 'BLOCK_PROP_INVALID',
        details: {
          path: 'blocks[0].props.href',
          type: 'button',
          prop: 'href',
          kind: 'url',
          reason: 'maxLength',
          constraint: 2048,
          actual: longHref.length,
        },
      });
    });

    it('richText.html oltre maxLength NON è respinto qui: la verifica è del sanitizzatore, dopo la pulizia (correzione T3)', () => {
      const longHtml = `<p>${'a'.repeat(25000)}</p>`;
      const result = validator.validateTree([
        node({ type: 'richText', props: { html: longHtml } }),
      ]);

      expect(result.valid).toBe(true);
    });

    it('plainText oltre maxLength NON è respinto qui, per lo stesso motivo', () => {
      const longText = 'a'.repeat(500);
      const result = validator.validateTree([
        node({ type: 'heading', props: { level: 'h2', text: longText } }),
      ]);

      expect(result.valid).toBe(true);
    });
  });

  describe('BLOCK_PROP_INVALID — reason "guidFormat" (image.mediaRef, SPEC-F02 § 3.5)', () => {
    it.each(['troppo-corto', 'ABCDEF0123456789', '0123456789abcdeg', '0123456789abcde'])(
      'image.mediaRef = %j (non 16 hex minuscoli) è respinto',
      (mediaRef) => {
        const result = validator.validateTree([
          node({ type: 'image', props: { mediaRef, alt: 'alt valido' } }),
        ]);

        expect(result.errors).toContainEqual({
          code: 'BLOCK_PROP_INVALID',
          details: {
            path: 'blocks[0].props.mediaRef',
            type: 'image',
            prop: 'mediaRef',
            kind: 'mediaRef',
            reason: 'guidFormat',
          },
        });
      },
    );

    it('image.mediaRef con forma valida (16 hex minuscoli) è accettato', () => {
      const result = validator.validateTree([
        node({ type: 'image', props: { mediaRef: '0123456789abcdef', alt: 'alt valido' } }),
      ]);
      expect(result.valid).toBe(true);
    });
  });

  // ─── kind number/boolean/inline: senza consumatore reale (A-F02-2) ─────

  describe('kind "number"/"boolean" — nessun consumatore fra i cinque tipi reali (A-F02-2), esercitati con un registro di test', () => {
    const numberBoolDefinition: BlockDefinition = {
      type: 'testNumberBool',
      v: 1,
      props: {
        count: { kind: 'number', required: true },
        flag: { kind: 'boolean', required: true },
      },
      children: { allow: [] },
      migrations: [],
      enabled: true,
    };
    const registry: BlockRegistry = {
      definitions: new Map([['testNumberBool', numberBoolDefinition]]),
      rootAllowed: ['testNumberBool'],
    };

    it('number/boolean con valori conformi: valido', () => {
      const result = validator.validateTree(
        [node({ type: 'testNumberBool', props: { count: 3, flag: true } })],
        registry,
      );
      expect(result.valid).toBe(true);
    });

    it('number con NaN o stringa: reason type', () => {
      const nanResult = validator.validateTree(
        [node({ type: 'testNumberBool', props: { count: NaN, flag: true } })],
        registry,
      );
      expect(nanResult.errors).toContainEqual({
        code: 'BLOCK_PROP_INVALID',
        details: {
          path: 'blocks[0].props.count',
          type: 'testNumberBool',
          prop: 'count',
          kind: 'number',
          reason: 'type',
        },
      });

      const stringResult = validator.validateTree(
        [node({ type: 'testNumberBool', props: { count: '3', flag: true } })],
        registry,
      );
      expect(stringResult.errors).toContainEqual({
        code: 'BLOCK_PROP_INVALID',
        details: {
          path: 'blocks[0].props.count',
          type: 'testNumberBool',
          prop: 'count',
          kind: 'number',
          reason: 'type',
        },
      });
    });

    it('boolean con valore non booleano: reason type', () => {
      const result = validator.validateTree(
        [node({ type: 'testNumberBool', props: { count: 1, flag: 'true' } })],
        registry,
      );
      expect(result.errors).toContainEqual({
        code: 'BLOCK_PROP_INVALID',
        details: {
          path: 'blocks[0].props.flag',
          type: 'testNumberBool',
          prop: 'flag',
          kind: 'boolean',
          reason: 'type',
        },
      });
    });
  });

  // ─── Regola 4 business-rules: nessun early-return, tutti gli errori raccolti ─

  describe('regola 4 (business-rules.md § Blocchi): un albero non valido colleziona tutti gli errori, mai il primo soltanto', () => {
    it('due nodi di radice entrambi colpevoli producono due errori distinti, non uno', () => {
      const result = validator.validateTree([
        node({ id: 'a', type: 'heading', props: {} }), // level/text mancanti: 2 errori
        node({ id: 'b', type: 'inesistente', props: {} }), // BLOCK_TYPE_UNKNOWN
      ]);

      expect(result.errors.length).toBeGreaterThanOrEqual(3);
      expect(result.errors.some((e) => e.details.path === 'blocks[0].props.level')).toBe(true);
      expect(result.errors.some((e) => e.details.path === 'blocks[0].props.text')).toBe(true);
      expect(
        result.errors.some(
          (e) => e.code === 'BLOCK_TYPE_UNKNOWN' && e.details.path === 'blocks[1]',
        ),
      ).toBe(true);
    });
  });

  // ─── Props responsive (ADR-29) ──────────────────────────────────────────

  describe('props di stile responsive (ADR-29 § 2/§ 4) — kind "enum" con responsive: true', () => {
    it('un blocco già salvato senza alcuna prop di stile resta valido (retro-compatibilità, ADR-29 § 5)', () => {
      const result = validator.validateTree([
        node({ type: 'heading', props: { level: 'h2', text: 'Titolo' } }),
      ]);
      expect(result.valid).toBe(true);
    });

    it('un valore responsive completo ({ default, tablet, mobile }) tutti token validi è accettato', () => {
      const result = validator.validateTree([
        node({
          type: 'section',
          props: {
            styleSpaceBefore: { default: 'md', tablet: 'sm', mobile: 'xs' },
          },
        }),
      ]);
      expect(result.valid).toBe(true);
    });

    it('un valore responsive con solo "default" è accettato (tablet/mobile opzionali)', () => {
      const result = validator.validateTree([
        node({ type: 'section', props: { styleSpaceBefore: { default: 'lg' } } }),
      ]);
      expect(result.valid).toBe(true);
    });

    it('uno scalare passato a una prop responsive è respinto con reason "type" (ADR-29: la forma dichiarata è oggetto)', () => {
      const result = validator.validateTree([
        node({ type: 'section', props: { styleSpaceBefore: 'md' } }),
      ]);

      expect(result.errors).toContainEqual({
        code: 'BLOCK_PROP_INVALID',
        details: {
          path: 'blocks[0].props.styleSpaceBefore',
          type: 'section',
          prop: 'styleSpaceBefore',
          kind: 'enum',
          reason: 'type',
        },
      });
    });

    it('"default" mancante nell\'oggetto responsive produce reason "type" sul path della prop', () => {
      const result = validator.validateTree([
        node({ type: 'section', props: { styleSpaceBefore: { tablet: 'sm' } } }),
      ]);

      expect(result.errors).toContainEqual({
        code: 'BLOCK_PROP_INVALID',
        details: {
          path: 'blocks[0].props.styleSpaceBefore',
          type: 'section',
          prop: 'styleSpaceBefore',
          kind: 'enum',
          reason: 'type',
        },
      });
    });

    it('una chiave fuori dall\'elenco chiuso dei tre breakpoint produce reason "type" sul path della prop', () => {
      const result = validator.validateTree([
        node({
          type: 'section',
          props: { styleSpaceBefore: { default: 'md', wide: 'lg' } },
        }),
      ]);

      expect(result.errors).toContainEqual({
        code: 'BLOCK_PROP_INVALID',
        details: {
          path: 'blocks[0].props.styleSpaceBefore',
          type: 'section',
          prop: 'styleSpaceBefore',
          kind: 'enum',
          reason: 'type',
        },
      });
    });

    it('un token fuori lista su "tablet" produce reason "enum" sul path della singola voce', () => {
      const result = validator.validateTree([
        node({
          type: 'section',
          props: { styleSpaceBefore: { default: 'md', tablet: 'enorme' } },
        }),
      ]);

      expect(result.errors).toContainEqual({
        code: 'BLOCK_PROP_INVALID',
        details: {
          path: 'blocks[0].props.styleSpaceBefore.tablet',
          type: 'section',
          prop: 'styleSpaceBefore',
          kind: 'enum',
          reason: 'enum',
          constraint: ['none', 'xs', 'sm', 'md', 'lg', 'xl'],
        },
      });
    });

    it('un valore null è respinto con reason "type"', () => {
      const result = validator.validateTree([
        node({ type: 'section', props: { styleSpaceBefore: null } }),
      ]);

      expect(result.errors).toContainEqual({
        code: 'BLOCK_PROP_INVALID',
        details: {
          path: 'blocks[0].props.styleSpaceBefore',
          type: 'section',
          prop: 'styleSpaceBefore',
          kind: 'enum',
          reason: 'type',
        },
      });
    });

    it('stylePadding/styleBackground su section, styleTextColor/styleFontSize/styleFontWeight su heading/richText/button sono accettati responsive', () => {
      const sectionResult = validator.validateTree([
        node({
          type: 'section',
          props: {
            stylePadding: { default: 'sm' },
            styleBackground: { default: 'accent', mobile: 'none' },
          },
        }),
      ]);
      expect(sectionResult.valid).toBe(true);

      const headingResult = validator.validateTree([
        node({
          type: 'heading',
          props: {
            level: 'h2',
            text: 'Titolo',
            styleTextColor: { default: 'muted' },
            styleFontSize: { default: 'lg', tablet: 'md' },
            styleFontWeight: { default: 'bold' },
          },
        }),
      ]);
      expect(headingResult.valid).toBe(true);
    });
  });

  // ─── Registro di produzione realmente usato per default ────────────────

  describe('registro di default', () => {
    it('senza un secondo argomento, valida contro DEFAULT_BLOCK_REGISTRY (i cinque tipi reali)', () => {
      const result = validator.validateTree([
        node({ type: 'heading', props: { level: 'h2', text: 'Titolo' } }),
      ]);
      expect(result.valid).toBe(true);
      expect(DEFAULT_BLOCK_REGISTRY.rootAllowed).toContain('heading');
    });
  });
});
