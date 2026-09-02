import { BlockDiffEngineService } from '../../../../src/pages/diff/block-diff-engine.service';
import { BlockNode } from '../../../../src/pages/content-tree';

/** Costruisce un nodo di test, con default sensati e override puntuali. */
function node(overrides: Partial<BlockNode>): BlockNode {
  return {
    id: 'n1',
    type: 'richText',
    v: 1,
    props: {},
    children: [],
    ...overrides,
  };
}

describe('BlockDiffEngineService (unit) — confronto strutturale fra Revisioni (business-rules.md § Revisioni, regola 4)', () => {
  let engine: BlockDiffEngineService;

  beforeEach(() => {
    engine = new BlockDiffEngineService();
  });

  it('albero identico (anche annidato) produce solo unchanged, nessun added/removed/modified', () => {
    const section = node({
      id: 'section-1',
      type: 'section',
      children: [
        node({ id: 'heading-1', type: 'heading', props: { text: 'Titolo' } }),
        node({ id: 'button-1', type: 'button', props: { text: 'Vai' } }),
      ],
    });
    const source = [section];
    const target = [structuredCloneNode(section)];

    const result = engine.compareTrees(source, target);

    expect(result.added).toEqual([]);
    expect(result.removed).toEqual([]);
    expect(result.modified).toEqual({});
    expect(result.unchanged.sort()).toEqual(['button-1', 'heading-1', 'section-1']);
  });

  it('riconosce un nodo aggiunto in profondità (Section con Heading + nuovo Button)', () => {
    const source = [
      node({
        id: 'section-1',
        type: 'section',
        children: [node({ id: 'heading-1', type: 'heading', props: { text: 'Titolo' } })],
      }),
    ];
    const target = [
      node({
        id: 'section-1',
        type: 'section',
        children: [
          node({ id: 'heading-1', type: 'heading', props: { text: 'Titolo' } }),
          node({ id: 'button-1', type: 'button', props: { text: 'Vai' } }),
        ],
      }),
    ];

    const result = engine.compareTrees(source, target);

    expect(result.added).toEqual(['button-1']);
    expect(result.removed).toEqual([]);
    // `section-1` è modificato: la lista `children` è cambiata (spostamento/aggiunta).
    expect(result.modified['section-1']).toEqual([
      { field: 'children', before: ['heading-1'], after: ['heading-1', 'button-1'] },
    ]);
    expect(result.unchanged).toEqual(['heading-1']);
  });

  it('riconosce un nodo rimosso in profondità', () => {
    const source = [
      node({
        id: 'section-1',
        type: 'section',
        children: [
          node({ id: 'heading-1', type: 'heading', props: { text: 'Titolo' } }),
          node({ id: 'button-1', type: 'button', props: { text: 'Vai' } }),
        ],
      }),
    ];
    const target = [
      node({
        id: 'section-1',
        type: 'section',
        children: [node({ id: 'heading-1', type: 'heading', props: { text: 'Titolo' } })],
      }),
    ];

    const result = engine.compareTrees(source, target);

    expect(result.removed).toEqual(['button-1']);
    expect(result.added).toEqual([]);
    expect(result.modified['section-1']).toEqual([
      { field: 'children', before: ['heading-1', 'button-1'], after: ['heading-1'] },
    ]);
  });

  it('riconosce la variazione di una prop di stile (styleTextColor)', () => {
    const source = [
      node({ id: 'heading-1', type: 'heading', props: { text: 'Titolo', styleTextColor: '#000000' } }),
    ];
    const target = [
      node({ id: 'heading-1', type: 'heading', props: { text: 'Titolo', styleTextColor: '#ff0000' } }),
    ];

    const result = engine.compareTrees(source, target);

    expect(result.modified['heading-1']).toEqual([
      { field: 'props.styleTextColor', before: '#000000', after: '#ff0000' },
    ]);
    expect(result.added).toEqual([]);
    expect(result.removed).toEqual([]);
  });

  it('riconosce la variazione del testo e riporta più variazioni sullo stesso nodo', () => {
    const source = [
      node({ id: 'heading-1', type: 'heading', props: { text: 'Vecchio', styleTextColor: '#000000' } }),
    ];
    const target = [
      node({ id: 'heading-1', type: 'heading', props: { text: 'Nuovo', styleTextColor: '#ff0000' } }),
    ];

    const result = engine.compareTrees(source, target);

    expect(result.modified['heading-1']).toEqual(
      expect.arrayContaining([
        { field: 'props.text', before: 'Vecchio', after: 'Nuovo' },
        { field: 'props.styleTextColor', before: '#000000', after: '#ff0000' },
      ]),
    );
    expect(result.modified['heading-1']).toHaveLength(2);
  });

  it('riconosce la variazione del type dello stesso id', () => {
    const source = [node({ id: 'n1', type: 'heading', props: { text: 'X' } })];
    const target = [node({ id: 'n1', type: 'richText', props: { text: 'X' } })];

    const result = engine.compareTrees(source, target);

    expect(result.modified['n1']).toEqual([{ field: 'type', before: 'heading', after: 'richText' }]);
  });

  it('riordinamento dei figli senza altre variazioni produce solo il diff su children', () => {
    const source = [
      node({
        id: 'section-1',
        type: 'section',
        children: [
          node({ id: 'a', type: 'button', props: {} }),
          node({ id: 'b', type: 'button', props: {} }),
        ],
      }),
    ];
    const target = [
      node({
        id: 'section-1',
        type: 'section',
        children: [
          node({ id: 'b', type: 'button', props: {} }),
          node({ id: 'a', type: 'button', props: {} }),
        ],
      }),
    ];

    const result = engine.compareTrees(source, target);

    expect(result.modified['section-1']).toEqual([
      { field: 'children', before: ['a', 'b'], after: ['b', 'a'] },
    ]);
    expect(result.unchanged.sort()).toEqual(['a', 'b']);
    expect(result.added).toEqual([]);
    expect(result.removed).toEqual([]);
  });

  it('albero vuoto contro albero vuoto produce un risultato completamente vuoto', () => {
    const result = engine.compareTrees([], []);

    expect(result).toEqual({ added: [], removed: [], modified: {}, unchanged: [] });
  });
});

function structuredCloneNode(n: BlockNode): BlockNode {
  return {
    ...n,
    props: { ...n.props },
    children: n.children.map(structuredCloneNode),
  };
}
