import { BadRequestException } from '@nestjs/common';
import { TreeSanitizerService } from '../../../../src/common/sanitizer/tree-sanitizer.service';

describe('TreeSanitizerService (unit)', () => {
  let sanitizer: TreeSanitizerService;

  beforeEach(() => {
    sanitizer = new TreeSanitizerService();
  });

  it('rimuove script/handler/URL javascript: da una prop stringa a qualunque profondità', () => {
    const tree = {
      id: 'block-1',
      type: 'richText',
      props: {
        html: '<p onclick="steal()">ciao</p><script>alert(1)</script>',
        link: '<a href="javascript:alert(1)">click</a>',
      },
      children: [
        {
          id: 'block-2',
          type: 'richText',
          props: { html: '<iframe src="evil.com"></iframe><b>ok</b>' },
          children: [],
        },
      ],
    };

    const result = sanitizer.sanitizeTree(tree);

    expect(result.props.html).toBe('<p>ciao</p>');
    expect(result.props.link).toBe('<a>click</a>');
    expect(result.children[0].props.html).toBe('<b>ok</b>');
    expect(JSON.stringify(result)).not.toContain('javascript:');
    expect(JSON.stringify(result)).not.toContain('onclick');
    expect(JSON.stringify(result)).not.toContain('<script>');
    expect(JSON.stringify(result)).not.toContain('<iframe');
  });

  it("preserva la struttura dell'albero (chiavi, id, type, children)", () => {
    const tree = { id: 'block-1', type: 'richText', props: { html: '<b>x</b>' }, children: [] };

    const result = sanitizer.sanitizeTree(tree);

    expect(Object.keys(result)).toEqual(['id', 'type', 'props', 'children']);
    expect(result.id).toBe('block-1');
    expect(result.type).toBe('richText');
    expect(result.children).toEqual([]);
  });

  it('non allowlista mai lo style: un attributo style viene scartato, non filtrato (postcss mai invocato)', () => {
    const tree = { props: { html: '<p style="color:red">x</p>' } };

    const result = sanitizer.sanitizeTree(tree);

    expect(result.props.html).toBe('<p>x</p>');
  });

  it(
    'LIMITE NOTO (chiuso da F02): sanitizza ogni prop stringa come HTML, quindi ' +
      'HTML-escapa una prop non-HTML (es. una label) — F01 non distingue le due',
    () => {
      const tree = { props: { label: '5 < 10 & altro "testo"' } };

      const result = sanitizer.sanitizeTree(tree);

      expect(result.props.label).toBe('5 &lt; 10 &amp; altro "testo"');
      expect(result.props.label).not.toBe(tree.props.label);
    },
  );

  it('respinge per intero un valore non sanitizzabile, senza persistenza parziale', () => {
    const circular: Record<string, unknown> = { props: {} };
    circular.props = circular;

    expect(() => sanitizer.sanitizeTree(circular)).toThrow(BadRequestException);
  });
});
