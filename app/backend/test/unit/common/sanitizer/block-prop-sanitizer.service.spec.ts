import { BlockPropSanitizerService } from '../../../../src/common/sanitizer/block-prop-sanitizer.service';
import { CssTreeSanitizerService } from '../../../../src/common/sanitizer/css-tree-sanitizer.service';
import {
  BASIC_SANITIZE_OPTIONS,
  INLINE_SANITIZE_OPTIONS,
} from '../../../../src/common/sanitizer/block-sanitize-profiles.config';
import { ValidatableBlockNode } from '../../../../src/blocks/validator/validatable-node.types';
import { BlockRegistry } from '../../../../src/blocks/block-registry';
import { BlockDefinition } from '../../../../src/blocks/block-definition.types';
import { richTextBlock } from '../../../../src/blocks/types/rich-text.block';
import { headingBlock } from '../../../../src/blocks/types/heading.block';
import { buttonBlock } from '../../../../src/blocks/types/button.block';
import { imageBlock } from '../../../../src/blocks/types/image.block';
import { sectionBlock } from '../../../../src/blocks/types/section.block';

function node(overrides: Partial<ValidatableBlockNode>): ValidatableBlockNode {
  return {
    id: 'n1',
    type: 'richText',
    props: {},
    children: [],
    ...overrides,
  };
}

/** Registro minimo dei tipi reali usati da questa suite. */
const REAL_REGISTRY: BlockRegistry = {
  definitions: new Map<string, BlockDefinition>([
    ['richText', richTextBlock],
    ['heading', headingBlock],
    ['button', buttonBlock],
    ['image', imageBlock],
    ['section', sectionBlock],
  ]),
  rootAllowed: ['richText', 'heading', 'button', 'image'],
};

describe('BlockPropSanitizerService (unit) — sanitizzazione per kind (SPEC-F02-blocchi.md § 2)', () => {
  let sanitizer: BlockPropSanitizerService;

  beforeEach(() => {
    sanitizer = new BlockPropSanitizerService(new CssTreeSanitizerService());
  });

  // ─── richText — profilo "basic" ─────────────────────────────────────────

  describe('kind richText — profilo "basic" (SPEC-F02 § 2.1)', () => {
    it('neutralizza <script>, on*, <iframe>, style, class, <h2>, <img> (criterio di verifica #10)', () => {
      const html =
        '<script>alert(1)</script>' +
        '<p onclick="steal()">testo</p>' +
        '<iframe src="evil.com"></iframe>' +
        '<p style="color:red">stilizzato</p>' +
        '<p class="ostile">classe</p>' +
        '<h2>Titolo</h2>' +
        '<img src="x" onerror="alert(2)">';

      const result = sanitizer.sanitizeTree(
        [node({ type: 'richText', props: { html } })],
        REAL_REGISTRY,
      );

      const cleaned = result.tree[0].props.html as string;
      expect(cleaned).not.toMatch(/<script/i);
      expect(cleaned).not.toMatch(/onclick/i);
      expect(cleaned).not.toMatch(/onerror/i);
      expect(cleaned).not.toMatch(/<iframe/i);
      expect(cleaned).not.toMatch(/style=/i);
      expect(cleaned).not.toMatch(/class=/i);
      expect(cleaned).not.toMatch(/<h2/i);
      expect(cleaned).not.toMatch(/<img/i);
      expect(result.errors).toEqual([]);
    });

    it('conserva i tag ammessi (p, strong, em, a, ul/ol/li)', () => {
      const html = '<p>Testo <strong>forte</strong> e <em>corsivo</em></p><ul><li>uno</li></ul>';
      const result = sanitizer.sanitizeTree(
        [node({ type: 'richText', props: { html } })],
        REAL_REGISTRY,
      );
      const cleaned = result.tree[0].props.html as string;
      expect(cleaned).toContain('<strong>forte</strong>');
      expect(cleaned).toContain('<em>corsivo</em>');
      expect(cleaned).toContain('<ul>');
      expect(cleaned).toContain('<li>uno</li>');
    });

    it('conserva style="text-align" su p con un valore valido, lo scarta con uno non valido, e scarta ogni altra proprietà di stile (ADR-26 § 1)', () => {
      const html =
        '<p style="text-align:center">centrato</p>' +
        '<p style="text-align:start">non valido</p>' +
        '<p style="color:red;text-align:right">misto</p>';
      const result = sanitizer.sanitizeTree(
        [node({ type: 'richText', props: { html } })],
        REAL_REGISTRY,
      );
      const cleaned = result.tree[0].props.html as string;
      expect(cleaned).toContain('<p style="text-align:center">centrato</p>');
      expect(cleaned).toContain('<p>non valido</p>');
      expect(cleaned).toContain('<p style="text-align:right">misto</p>');
      expect(cleaned).not.toMatch(/color/i);
    });

    it('un <a target="_blank"> sopravvissuto esce con rel contenente noopener e noreferrer (§ 2.3.1)', () => {
      const html = '<a href="https://esempio.it" target="_blank">link</a>';
      const result = sanitizer.sanitizeTree(
        [node({ type: 'richText', props: { html } })],
        REAL_REGISTRY,
      );
      const cleaned = result.tree[0].props.html as string;
      expect(cleaned).toMatch(/rel="[^"]*noopener[^"]*"/);
      expect(cleaned).toMatch(/rel="[^"]*noreferrer[^"]*"/);
    });

    it('target diverso da _blank/_self viene scartato (§ 2.3.2)', () => {
      const html = '<a href="https://esempio.it" target="_parent">link</a>';
      const result = sanitizer.sanitizeTree(
        [node({ type: 'richText', props: { html } })],
        REAL_REGISTRY,
      );
      const cleaned = result.tree[0].props.html as string;
      expect(cleaned).not.toMatch(/target=/);
    });

    it('javascript: come schema di href viene scartato', () => {
      const html = '<a href="javascript:alert(1)">click</a>';
      const result = sanitizer.sanitizeTree(
        [node({ type: 'richText', props: { html } })],
        REAL_REGISTRY,
      );
      const cleaned = result.tree[0].props.html as string;
      expect(cleaned).not.toMatch(/javascript:/i);
    });
  });

  // ─── richText — profilo "inline" (A-F02-2: nessun consumatore reale) ───

  describe('kind richText — profilo "inline" (SPEC-F02 § 2.2, A-F02-2: senza consumatore fra i cinque tipi, esercitato qui)', () => {
    const inlineDefinition: BlockDefinition = {
      type: 'testInline',
      v: 1,
      props: { text: { kind: 'richText', profile: 'inline', required: true } },
      children: { allow: [] },
      migrations: [],
      enabled: true,
    };
    const registry: BlockRegistry = {
      definitions: new Map([['testInline', inlineDefinition]]),
      rootAllowed: ['testInline'],
    };

    it('scarta gli elementi di blocco (p, ul, ol, li) ma conserva gli inline (b, em, strong, a)', () => {
      const html = '<p>par</p><ul><li>voce</li></ul><b>grassetto</b><em>corsivo</em>';
      const result = sanitizer.sanitizeTree(
        [node({ type: 'testInline', props: { text: html } })],
        registry,
      );
      const cleaned = result.tree[0].props.text as string;

      expect(cleaned).not.toMatch(/<p>/);
      expect(cleaned).not.toMatch(/<ul>/);
      expect(cleaned).not.toMatch(/<li>/);
      expect(cleaned).toContain('<b>grassetto</b>');
      expect(cleaned).toContain('<em>corsivo</em>');
    });

    it('br sopravvive: è inline-level, non un elemento di blocco', () => {
      const result = sanitizer.sanitizeTree(
        [node({ type: 'testInline', props: { text: 'riga1<br>riga2' } })],
        registry,
      );
      expect(result.tree[0].props.text).toContain('<br');
    });
  });

  // ─── plainText — verbatim, controllo dei caratteri di controllo ───────

  describe('kind plainText — verbatim, nessuno escaping alla persistenza (ADR-21 § 4)', () => {
    it('conserva styleBackgroundColor di una Section', () => {
      const result = sanitizer.sanitizeTree(
        [node({ type: 'section', props: { styleBackgroundColor: '#00FF00' } })],
        REAL_REGISTRY,
      );

      expect(result.tree[0].props.styleBackgroundColor).toBe('#00FF00');
      expect(result.errors).toEqual([]);
    });

    it('"5 < 10" sopravvive integro (chiusura del limite noto di F01, criterio #11)', () => {
      const result = sanitizer.sanitizeTree(
        [node({ type: 'heading', props: { level: 'h2', text: '5 < 10' } })],
        REAL_REGISTRY,
      );
      expect(result.tree[0].props.text).toBe('5 < 10');
    });

    it('rimuove i caratteri di controllo C0/DEL, preservando tab (\\t) e newline (\\n)', () => {
      const withControlChars = 'ciao \tmondo\nfine';
      const result = sanitizer.sanitizeTree(
        [node({ type: 'heading', props: { level: 'h2', text: withControlChars } })],
        REAL_REGISTRY,
      );
      expect(result.tree[0].props.text).toBe('ciao\tmondo\nfine');
    });

    it('nessuna normalizzazione Unicode e nessun trim implicito del contenuto interno (solo i bordi non sono toccati qui)', () => {
      const spaced = '  parola   con   spazi interni  ';
      const result = sanitizer.sanitizeTree(
        [node({ type: 'heading', props: { level: 'h2', text: spaced } })],
        REAL_REGISTRY,
      );
      // Nessun trim: il sanitizzatore non tocca whitespace non di controllo.
      expect(result.tree[0].props.text).toBe(spaced);
    });
  });

  // ─── maxLength verificato SUL VALORE SANITIZZATO (correzione T3) ──────

  describe('maxLength — verificato dopo la pulizia, sul valore che verrà scritto (SPEC-F02 § 1.4, criterio #13)', () => {
    it('richText.html che supera il limite solo PRIMA della sanitizzazione è accettato (i tag scartati riducono la lunghezza sotto la soglia)', () => {
      const restrictiveDefinition: BlockDefinition = {
        type: 'testShortRichText',
        v: 1,
        props: { html: { kind: 'richText', profile: 'basic', required: true, maxLength: 10 } },
        children: { allow: [] },
        migrations: [],
        enabled: true,
      };
      const registry: BlockRegistry = {
        definitions: new Map([['testShortRichText', restrictiveDefinition]]),
        rootAllowed: ['testShortRichText'],
      };
      // "<script>1234567890</script>" è >10 caratteri, ma il contenuto di
      // <script> è scartato per intero (nonTextTags): il risultato pulito è
      // una stringa vuota, ben sotto il limite di 10.
      const html = '<script>1234567890</script>';

      const result = sanitizer.sanitizeTree(
        [node({ type: 'testShortRichText', props: { html } })],
        registry,
      );

      expect(result.errors).toEqual([]);
      expect(result.tree[0].props.html).toBe('');
    });

    it('richText.html che supera il limite ANCHE DOPO la sanitizzazione è respinto con reason maxLength', () => {
      const restrictiveDefinition: BlockDefinition = {
        type: 'testShortRichText',
        v: 1,
        props: { html: { kind: 'richText', profile: 'basic', required: true, maxLength: 10 } },
        children: { allow: [] },
        migrations: [],
        enabled: true,
      };
      const registry: BlockRegistry = {
        definitions: new Map([['testShortRichText', restrictiveDefinition]]),
        rootAllowed: ['testShortRichText'],
      };
      const html = '<p>Questo testo supera abbondantemente dieci caratteri</p>';

      const result = sanitizer.sanitizeTree(
        [node({ type: 'testShortRichText', props: { html } })],
        registry,
      );

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toMatchObject({
        code: 'BLOCK_PROP_INVALID',
        details: {
          path: 'blocks[0].props.html',
          type: 'testShortRichText',
          prop: 'html',
          kind: 'richText',
          reason: 'maxLength',
          constraint: 10,
        },
      });
    });

    it('plainText oltre maxLength dopo la pulizia è respinto con reason maxLength', () => {
      const result = sanitizer.sanitizeTree(
        [node({ type: 'heading', props: { level: 'h2', text: 'a'.repeat(201) } })],
        REAL_REGISTRY,
      );

      expect(result.errors).toEqual([
        {
          code: 'BLOCK_PROP_INVALID',
          details: {
            path: 'blocks[0].props.text',
            type: 'heading',
            prop: 'text',
            kind: 'plainText',
            reason: 'maxLength',
            constraint: 200,
            actual: 201,
          },
        },
      ]);
    });
  });

  // ─── number/boolean/enum/mediaRef/url — non passano da sanitize-html ──

  describe('kind non-stringa — mai passati da sanitize-html (§ 2.3.4)', () => {
    it('number e boolean attraversano invariati', () => {
      const definition: BlockDefinition = {
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
        definitions: new Map([['testNumberBool', definition]]),
        rootAllowed: ['testNumberBool'],
      };

      const result = sanitizer.sanitizeTree(
        [node({ type: 'testNumberBool', props: { count: 42, flag: true } })],
        registry,
      );

      expect(result.tree[0].props).toEqual({ count: 42, flag: true });
      expect(result.errors).toEqual([]);
    });

    it('url non subisce trasformazioni (nessuna sanitize-html sullo schema)', () => {
      const result = sanitizer.sanitizeTree(
        [node({ type: 'button', props: { label: 'Vai', href: '/servizi/consulenza' } })],
        REAL_REGISTRY,
      );
      expect(result.tree[0].props.href).toBe('/servizi/consulenza');
    });

    it('mediaRef non subisce trasformazioni', () => {
      const result = sanitizer.sanitizeTree(
        [node({ type: 'image', props: { mediaRef: '0123456789abcdef', alt: 'alt' } })],
        REAL_REGISTRY,
      );
      expect(result.tree[0].props.mediaRef).toBe('0123456789abcdef');
    });

    it('unitValue/border/shadow (ADR-38): valori oggetto attraversano invariati, nessun campo interno alterato', () => {
      const result = sanitizer.sanitizeTree(
        [
          node({
            type: 'heading',
            props: {
              level: 'h2',
              text: 'T',
              styleFontSizeCustom: { value: 32, unit: 'px' },
              styleBorder: { width: 2, style: 'solid', color: '#333333', radius: 8 },
              styleShadow: { x: 0, y: 4, blur: 12, spread: 0, color: '#000000' },
            },
          }),
        ],
        REAL_REGISTRY,
      );

      expect(result.tree[0].props.styleFontSizeCustom).toEqual({ value: 32, unit: 'px' });
      expect(result.tree[0].props.styleBorder).toEqual({
        width: 2,
        style: 'solid',
        color: '#333333',
        radius: 8,
      });
      expect(result.tree[0].props.styleShadow).toEqual({
        x: 0,
        y: 4,
        blur: 12,
        spread: 0,
        color: '#000000',
      });
      expect(result.errors).toEqual([]);
    });

    it('cssClassName/htmlId (ADR-38): stringhe già conformi al pattern attraversano invariate, nessuna sanitize-html', () => {
      const result = sanitizer.sanitizeTree(
        [
          node({
            type: 'heading',
            props: {
              level: 'h2',
              text: 'T',
              customCssClass: 'hero-title accent',
              customElementId: 'hero-block',
            },
          }),
        ],
        REAL_REGISTRY,
      );

      expect(result.tree[0].props.customCssClass).toBe('hero-title accent');
      expect(result.tree[0].props.customElementId).toBe('hero-block');
    });
  });

  // ─── Errore di sanitizzazione non recuperabile → CONTENT_SANITIZATION_FAILED ─

  describe('CONTENT_SANITIZATION_FAILED — un albero non sanitizzabile è respinto per intero (ADR-20)', () => {
    it('un errore sollevato dalla libreria di sanitizzazione produce un BadRequestException col code atteso', async () => {
      // Simula un guasto interno di `sanitize-html` (dipendenza esterna):
      // mock mirato della sola libreria, non della logica applicativa.
      jest.resetModules();
      jest.doMock('sanitize-html', () => {
        return jest.fn(() => {
          throw new Error('guasto simulato della libreria');
        });
      });
      // Importa il modulo DOPO il mock, per usare la versione mockata.
      const { BlockPropSanitizerService: MockedService } =
        await import('../../../../src/common/sanitizer/block-prop-sanitizer.service');
      const mockedSanitizer = new MockedService(new CssTreeSanitizerService());

      expect(() =>
        mockedSanitizer.sanitizeTree(
          [node({ type: 'richText', props: { html: '<p>qualunque cosa</p>' } })],
          REAL_REGISTRY,
        ),
      ).toThrow(
        expect.objectContaining({
          response: expect.objectContaining({ code: 'CONTENT_SANITIZATION_FAILED' }),
        }),
      );

      jest.dontMock('sanitize-html');
      jest.resetModules();
    });
  });

  // ─── Non muta l'input ────────────────────────────────────────────────

  describe("non muta l'albero ricevuto in input", () => {
    it('ritorna una copia: il nodo/props originali restano inalterati', () => {
      const original = node({ type: 'heading', props: { level: 'h2', text: '5 < 10' } });
      const frozenProps = Object.freeze({ ...original.props });
      original.props = frozenProps;

      expect(() => sanitizer.sanitizeTree([original], REAL_REGISTRY)).not.toThrow();
      expect(original.props).toEqual({ level: 'h2', text: '5 < 10' });
    });
  });
});

describe('Profili di sanitizzazione (block-sanitize-profiles.config.ts) — ispezione della configurazione (SPEC-F02 § 2, criterio #12)', () => {
  it('"style" in allowedAttributes esiste solo per p, e solo per abilitare allowedStyles/text-align (ADR-26 § 1)', () => {
    for (const options of [BASIC_SANITIZE_OPTIONS, INLINE_SANITIZE_OPTIONS]) {
      const allowedAttributes = options.allowedAttributes as Record<string, string[]>;
      for (const tag of Object.keys(allowedAttributes)) {
        if (tag === 'p') {
          expect(allowedAttributes[tag]).toEqual(['style']);
        } else {
          expect(allowedAttributes[tag]).not.toContain('style');
        }
      }
    }
  });

  it('allowedStyles ammette solo text-align su p, con un pattern chiuso ai quattro valori validi (ADR-26 § 1)', () => {
    for (const options of [BASIC_SANITIZE_OPTIONS, INLINE_SANITIZE_OPTIONS]) {
      const allowedStyles = options.allowedStyles as Record<string, Record<string, RegExp[]>>;
      expect(Object.keys(allowedStyles)).toEqual(['p']);
      expect(Object.keys(allowedStyles.p)).toEqual(['text-align']);
      const [pattern] = allowedStyles.p['text-align'];
      for (const valid of ['left', 'right', 'center', 'justify']) {
        expect(pattern.test(valid)).toBe(true);
      }
      for (const invalid of ['inherit', 'initial', 'start', '', 'center;color:red']) {
        expect(pattern.test(invalid)).toBe(false);
      }
    }
  });

  it('"inline" è un sottoinsieme stretto di "basic": nessun tag di "inline" fuori da "basic", meno p/ul/ol/li', () => {
    const basicTags = new Set((BASIC_SANITIZE_OPTIONS.allowedTags as string[]) ?? []);
    const inlineTags = (INLINE_SANITIZE_OPTIONS.allowedTags as string[]) ?? [];
    for (const tag of inlineTags) {
      expect(basicTags.has(tag)).toBe(true);
    }
    for (const blockTag of ['p', 'ul', 'ol', 'li']) {
      expect(inlineTags).not.toContain(blockTag);
    }
  });

  it('entrambi i profili ammettono solo gli schemi http/https/mailto, mai protocol-relative', () => {
    for (const options of [BASIC_SANITIZE_OPTIONS, INLINE_SANITIZE_OPTIONS]) {
      expect(options.allowedSchemes).toEqual(['http', 'https', 'mailto']);
      expect(options.allowProtocolRelative).toBe(false);
    }
  });
});
