import { BlockTreeValidatorService } from '../../../../src/blocks/validator/block-tree-validator.service';
import { ValidatableBlockNode } from '../../../../src/blocks/validator/validatable-node.types';
import { BlockRegistry, DEFAULT_BLOCK_REGISTRY } from '../../../../src/blocks/block-registry';
import { BlockDefinition } from '../../../../src/blocks/block-definition.types';
import { sectionBlock } from '../../../../src/blocks/types/section.block';
import { richTextBlock } from '../../../../src/blocks/types/rich-text.block';
import { containerBlock } from '../../../../src/blocks/types/container.block';

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
          allowed: ['heading', 'richText', 'image', 'button', 'container'],
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
              'styleColor',
              'backgroundColor',
              'color',
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
              'styleBorder',
              'styleShadow',
              'customCssClass',
              'customElementId',
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
            'styleTextColorCustom',
            'styleBackgroundColor',
            'styleColor',
            'backgroundColor',
            'color',
            'styleFontSizeCustom',
            'styleBorder',
            'styleShadow',
            'customCssClass',
            'customElementId',
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

  // ─── kind "unitValue"/"border"/"shadow"/"cssClassName"/"htmlId" (ADR-38) ─

  describe('BLOCK_PROP_INVALID — kind "unitValue" (ADR-38 § 2)', () => {
    it('heading.styleFontSizeCustom con value/unit dentro i vincoli dichiarati è accettato', () => {
      const result = validator.validateTree([
        node({
          type: 'heading',
          props: { level: 'h2', text: 'T', styleFontSizeCustom: { value: 32, unit: 'px' } },
        }),
      ]);
      expect(result.valid).toBe(true);
    });

    it('heading.styleFontSizeCustom con value fuori da [min,max] produce reason "range" sul sotto-path .value', () => {
      const result = validator.validateTree([
        node({
          type: 'heading',
          props: { level: 'h2', text: 'T', styleFontSizeCustom: { value: 500, unit: 'px' } },
        }),
      ]);

      expect(result.errors).toContainEqual({
        code: 'BLOCK_PROP_INVALID',
        details: {
          path: 'blocks[0].props.styleFontSizeCustom.value',
          type: 'heading',
          prop: 'styleFontSizeCustom',
          kind: 'unitValue',
          reason: 'range',
          constraint: [1, 200],
          actual: 500,
        },
      });
    });

    it('heading.styleFontSizeCustom con unit fuori dall\'elenco chiuso produce reason "enum" sul sotto-path .unit', () => {
      const result = validator.validateTree([
        node({
          type: 'heading',
          props: { level: 'h2', text: 'T', styleFontSizeCustom: { value: 16, unit: 'vw' } },
        }),
      ]);

      expect(result.errors).toContainEqual({
        code: 'BLOCK_PROP_INVALID',
        details: {
          path: 'blocks[0].props.styleFontSizeCustom.unit',
          type: 'heading',
          prop: 'styleFontSizeCustom',
          kind: 'unitValue',
          reason: 'enum',
          constraint: ['px', '%', 'em', 'rem'],
        },
      });
    });

    it('heading.styleFontSizeCustom non oggetto ({value,unit}) produce reason "type" sul path della prop, non sui sotto-campi', () => {
      const result = validator.validateTree([
        node({ type: 'heading', props: { level: 'h2', text: 'T', styleFontSizeCustom: '32px' } }),
      ]);

      expect(result.errors).toContainEqual({
        code: 'BLOCK_PROP_INVALID',
        details: {
          path: 'blocks[0].props.styleFontSizeCustom',
          type: 'heading',
          prop: 'styleFontSizeCustom',
          kind: 'unitValue',
          reason: 'type',
        },
      });
    });

    it('heading.styleFontSizeCustom con una chiave estranea nell\'oggetto è respinto per intero (nessuna chiave oltre value/unit)', () => {
      const result = validator.validateTree([
        node({
          type: 'heading',
          props: {
            level: 'h2',
            text: 'T',
            styleFontSizeCustom: { value: 16, unit: 'px', evil: '</style>' },
          },
        }),
      ]);

      expect(result.errors).toContainEqual({
        code: 'BLOCK_PROP_INVALID',
        details: {
          path: 'blocks[0].props.styleFontSizeCustom',
          type: 'heading',
          prop: 'styleFontSizeCustom',
          kind: 'unitValue',
          reason: 'type',
        },
      });
    });
  });

  describe('BLOCK_PROP_INVALID — kind "border" (ADR-38 § 3)', () => {
    it('section.styleBorder con i 4 campi dentro i vincoli fissi è accettato', () => {
      const result = validator.validateTree([
        node({
          type: 'section',
          props: { styleBorder: { width: 2, style: 'solid', color: '#333', radius: 8 } },
        }),
      ]);
      expect(result.valid).toBe(true);
    });

    it('section.styleBorder.width oltre il massimo fisso (12) produce reason "range"', () => {
      const result = validator.validateTree([
        node({
          type: 'section',
          props: { styleBorder: { width: 50, style: 'solid', color: '#333', radius: 8 } },
        }),
      ]);

      expect(result.errors).toContainEqual({
        code: 'BLOCK_PROP_INVALID',
        details: {
          path: 'blocks[0].props.styleBorder.width',
          type: 'section',
          prop: 'styleBorder',
          kind: 'border',
          reason: 'range',
          constraint: [0, 12],
          actual: 50,
        },
      });
    });

    it('section.styleBorder.style fuori dall\'elenco chiuso produce reason "enum"', () => {
      const result = validator.validateTree([
        node({
          type: 'section',
          props: { styleBorder: { width: 2, style: 'groove', color: '#333', radius: 8 } },
        }),
      ]);

      expect(result.errors).toContainEqual({
        code: 'BLOCK_PROP_INVALID',
        details: {
          path: 'blocks[0].props.styleBorder.style',
          type: 'section',
          prop: 'styleBorder',
          kind: 'border',
          reason: 'enum',
          constraint: ['solid', 'dashed', 'dotted', 'none'],
        },
      });
    });

    it('section.styleBorder.color non esadecimale (stesso HEX_COLOR_PATTERN di kind "color") produce reason "format"', () => {
      const result = validator.validateTree([
        node({
          type: 'section',
          props: { styleBorder: { width: 2, style: 'solid', color: 'rgb(0,0,0)', radius: 8 } },
        }),
      ]);

      expect(result.errors).toContainEqual({
        code: 'BLOCK_PROP_INVALID',
        details: {
          path: 'blocks[0].props.styleBorder.color',
          type: 'section',
          prop: 'styleBorder',
          kind: 'border',
          reason: 'format',
        },
      });
    });

    it('section.styleBorder non oggetto a 4 campi fissi produce reason "type" sul path della prop', () => {
      const result = validator.validateTree([
        node({ type: 'section', props: { styleBorder: '2px solid #333' } }),
      ]);

      expect(result.errors).toContainEqual({
        code: 'BLOCK_PROP_INVALID',
        details: {
          path: 'blocks[0].props.styleBorder',
          type: 'section',
          prop: 'styleBorder',
          kind: 'border',
          reason: 'type',
        },
      });
    });
  });

  describe('BLOCK_PROP_INVALID — kind "shadow" (ADR-38 § 4)', () => {
    it('section.styleShadow con i 5 campi dentro gli intervalli fissi è accettato', () => {
      const result = validator.validateTree([
        node({
          type: 'section',
          props: { styleShadow: { x: 0, y: 4, blur: 12, spread: 0, color: '#000000' } },
        }),
      ]);
      expect(result.valid).toBe(true);
    });

    it('section.styleShadow.blur oltre il massimo fisso (64) produce reason "range"', () => {
      const result = validator.validateTree([
        node({
          type: 'section',
          props: { styleShadow: { x: 0, y: 4, blur: 999, spread: 0, color: '#000000' } },
        }),
      ]);

      expect(result.errors).toContainEqual({
        code: 'BLOCK_PROP_INVALID',
        details: {
          path: 'blocks[0].props.styleShadow.blur',
          type: 'section',
          prop: 'styleShadow',
          kind: 'shadow',
          reason: 'range',
          constraint: [0, 64],
          actual: 999,
        },
      });
    });

    it('section.styleShadow.color non esadecimale produce reason "format"', () => {
      const result = validator.validateTree([
        node({
          type: 'section',
          props: { styleShadow: { x: 0, y: 4, blur: 12, spread: 0, color: 'black' } },
        }),
      ]);

      expect(result.errors).toContainEqual({
        code: 'BLOCK_PROP_INVALID',
        details: {
          path: 'blocks[0].props.styleShadow.color',
          type: 'section',
          prop: 'styleShadow',
          kind: 'shadow',
          reason: 'format',
        },
      });
    });
  });

  describe('BLOCK_PROP_INVALID — kind "cssClassName"/"htmlId" (ADR-38 § 5)', () => {
    it.each(['hero-title', 'hero_title', '_hero', 'hero title'])(
      'section.customCssClass = %j (1-3 token validi) è accettato',
      (customCssClass) => {
        const result = validator.validateTree([node({ type: 'section', props: { customCssClass } })]);
        expect(result.valid).toBe(true);
      },
    );

    it.each([
      '1leading-digit',
      'has spaces and more than three tokens here',
      'contains<script>',
      'a'.repeat(101),
    ])('section.customCssClass = %j è respinto con reason "format"', (customCssClass) => {
      const result = validator.validateTree([node({ type: 'section', props: { customCssClass } })]);

      expect(result.errors).toContainEqual({
        code: 'BLOCK_PROP_INVALID',
        details: {
          path: 'blocks[0].props.customCssClass',
          type: 'section',
          prop: 'customCssClass',
          kind: 'cssClassName',
          reason: 'format',
        },
      });
    });

    it('section.customElementId con un solo token valido è accettato', () => {
      const result = validator.validateTree([
        node({ type: 'section', props: { customElementId: 'hero-block' } }),
      ]);
      expect(result.valid).toBe(true);
    });

    it.each(['hero block', '9leading-digit', 'a'.repeat(51)])(
      'section.customElementId = %j è respinto con reason "format"',
      (customElementId) => {
        const result = validator.validateTree([
          node({ type: 'section', props: { customElementId } }),
        ]);

        expect(result.errors).toContainEqual({
          code: 'BLOCK_PROP_INVALID',
          details: {
            path: 'blocks[0].props.customElementId',
            type: 'section',
            prop: 'customElementId',
            kind: 'htmlId',
            reason: 'format',
          },
        });
      },
    );
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

  // ─── container — wildcard di nesting "*" (ADR-39 § 4) ───────────────────

  describe('container — wildcard di nesting "*" (ADR-39 § 4)', () => {
    const minimalPropsByType: Record<string, Record<string, unknown>> = {
      section: {},
      heading: { level: 'h2', text: 'T' },
      richText: { html: '<p>ok</p>' },
      image: { mediaRef: '0123456789abcdef', alt: 'alt' },
      button: { label: 'Vai', href: 'https://esempio.it' },
      container: {},
    };

    it.each(['heading', 'richText', 'image', 'button', 'section', 'container'])(
      '%s è ammesso come figlio diretto di container: la wildcard accetta ogni tipo risolto con successo (ADR-39 § 4)',
      (type) => {
        const result = validator.validateTree([
          node({
            id: 'outer',
            type: 'container',
            props: {},
            children: [node({ id: 'child', type, props: minimalPropsByType[type] })],
          }),
        ]);

        expect(result.valid).toBe(true);
      },
    );

    it('un container con i cinque tipi foglia più un altro container come figli diretti è valido per intero', () => {
      const result = validator.validateTree([
        node({
          id: 'outer',
          type: 'container',
          props: {},
          children: [
            node({ id: 'h', type: 'heading', props: minimalPropsByType.heading }),
            node({ id: 'r', type: 'richText', props: minimalPropsByType.richText }),
            node({ id: 'i', type: 'image', props: minimalPropsByType.image }),
            node({ id: 'b', type: 'button', props: minimalPropsByType.button }),
            node({ id: 's', type: 'section', props: minimalPropsByType.section }),
            node({ id: 'c', type: 'container', props: minimalPropsByType.container }),
          ],
        }),
      ]);

      expect(result).toEqual({ valid: true, errors: [] });
    });

    it('nesting ricorsivo profondo: section → container → container → heading è valido per intero (nesting ricorsivo, ADR-39 § 4)', () => {
      const result = validator.validateTree([
        node({
          id: 'sec',
          type: 'section',
          props: {},
          children: [
            node({
              id: 'c1',
              type: 'container',
              props: {},
              children: [
                node({
                  id: 'c2',
                  type: 'container',
                  props: {},
                  children: [node({ id: 'h', type: 'heading', props: minimalPropsByType.heading })],
                }),
              ],
            }),
          ],
        }),
      ]);

      expect(result).toEqual({ valid: true, errors: [] });
    });

    it('la wildcard non bypassa enabled:false sul figlio: produce BLOCK_TYPE_UNKNOWN, mai BLOCK_NESTING_NOT_ALLOWED', () => {
      const disabledRichText: BlockDefinition = { ...richTextBlock, enabled: false };
      const registry: BlockRegistry = {
        definitions: new Map([
          ['container', containerBlock],
          ['richText', disabledRichText],
        ]),
        rootAllowed: ['container'],
      };

      const result = validator.validateTree(
        [
          node({
            id: 'outer',
            type: 'container',
            props: {},
            children: [node({ id: 'child', type: 'richText', props: { html: '<p>x</p>' } })],
          }),
        ],
        registry,
      );

      expect(result.errors).toEqual([
        { code: 'BLOCK_TYPE_UNKNOWN', details: { path: 'blocks[0].children[0]', type: 'richText' } },
      ]);
    });

    it('la wildcard non bypassa un minRole non soddisfatto sul figlio: produce BLOCK_TYPE_UNKNOWN, mai BLOCK_NESTING_NOT_ALLOWED', () => {
      const restrictedRichText: BlockDefinition = { ...richTextBlock, minRole: 5 };
      const registry: BlockRegistry = {
        definitions: new Map([
          ['container', containerBlock],
          ['richText', restrictedRichText],
        ]),
        rootAllowed: ['container'],
      };

      const result = validator.validateTree(
        [
          node({
            id: 'outer',
            type: 'container',
            props: {},
            children: [node({ id: 'child', type: 'richText', props: { html: '<p>x</p>' } })],
          }),
        ],
        registry,
        { roleLevel: 30 }, // User: valore più alto di minRole (5) ⇒ non soddisfatto
      );

      expect(result.errors).toEqual([
        { code: 'BLOCK_TYPE_UNKNOWN', details: { path: 'blocks[0].children[0]', type: 'richText' } },
      ]);
    });
  });

  // ─── container — reason "enum" su props di layout responsive ───────────

  describe('container — reason "enum" su flexDirection/gap (ADR-39 § 2, responsive: true)', () => {
    it('container.flexDirection scalare (non envelope) è respinto con reason "type": la forma dichiarata è oggetto responsive', () => {
      const result = validator.validateTree([
        node({ type: 'container', props: { flexDirection: 'diagonal' } }),
      ]);

      expect(result.errors).toContainEqual({
        code: 'BLOCK_PROP_INVALID',
        details: {
          path: 'blocks[0].props.flexDirection',
          type: 'container',
          prop: 'flexDirection',
          kind: 'enum',
          reason: 'type',
        },
      });
    });

    it('container.flexDirection = { default: "diagonal" } è respinto con reason "enum" sul path .default, elenco chiuso in constraint', () => {
      const result = validator.validateTree([
        node({ type: 'container', props: { flexDirection: { default: 'diagonal' } } }),
      ]);

      expect(result.errors).toContainEqual({
        code: 'BLOCK_PROP_INVALID',
        details: {
          path: 'blocks[0].props.flexDirection.default',
          type: 'container',
          prop: 'flexDirection',
          kind: 'enum',
          reason: 'enum',
          constraint: ['row', 'row-reverse', 'column', 'column-reverse'],
        },
      });
    });

    it('container.gap scalare (non envelope) è respinto con reason "type"', () => {
      const result = validator.validateTree([node({ type: 'container', props: { gap: 'huge' } })]);

      expect(result.errors).toContainEqual({
        code: 'BLOCK_PROP_INVALID',
        details: {
          path: 'blocks[0].props.gap',
          type: 'container',
          prop: 'gap',
          kind: 'enum',
          reason: 'type',
        },
      });
    });

    it('container.gap = { default: "huge" } è respinto con reason "enum", constraint [none,sm,md,lg]', () => {
      const result = validator.validateTree([
        node({ type: 'container', props: { gap: { default: 'huge' } } }),
      ]);

      expect(result.errors).toContainEqual({
        code: 'BLOCK_PROP_INVALID',
        details: {
          path: 'blocks[0].props.gap.default',
          type: 'container',
          prop: 'gap',
          kind: 'enum',
          reason: 'enum',
          constraint: ['none', 'sm', 'md', 'lg'],
        },
      });
    });
  });
});
