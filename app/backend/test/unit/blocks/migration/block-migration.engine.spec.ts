import { BlockDefinition } from '../../../../src/blocks/block-definition.types';
import { BlockRegistry } from '../../../../src/blocks/block-registry';
import { migrateBlockNode } from '../../../../src/blocks/migration/node-migration.engine';
import { migrateBlockTree } from '../../../../src/blocks/migration/block-tree-migration.engine';
import { migrateEnvelope } from '../../../../src/blocks/migration/envelope-migration.engine';
import { MigratableBlockNode } from '../../../../src/blocks/migration/block-migration.types';
import { sectionBlock } from '../../../../src/blocks/types/section.block';
import { headingBlock } from '../../../../src/blocks/types/heading.block';
import { richTextBlock } from '../../../../src/blocks/types/rich-text.block';
import { imageBlock } from '../../../../src/blocks/types/image.block';
import { buttonBlock } from '../../../../src/blocks/types/button.block';
import { DEFAULT_BLOCK_REGISTRY } from '../../../../src/blocks/block-registry';

/** Costruisce un nodo di test con default sensati, override puntuali. */
function node(overrides: Partial<MigratableBlockNode>): MigratableBlockNode {
  return {
    id: 'n1',
    type: 'richText',
    props: {},
    children: [],
    ...overrides,
  };
}

describe('motore di migrazione — quattro tipi foglia reali migrati a v:2 (ADR-81, round R1 "parità Elementor Pro", Sub-Task S1.4)', () => {
  const leafDefinitionsV2: BlockDefinition[] = [
    headingBlock,
    richTextBlock,
    imageBlock,
    buttonBlock,
  ];

  it.each(leafDefinitionsV2)(
    '$type: props v1 vuote ⇒ v2 con default sicuri, v assente ⇒ migrato a v2',
    (definition) => {
      const input = node({ type: definition.type, props: {} });

      const { node: migrated, unsupported } = migrateBlockNode(input, DEFAULT_BLOCK_REGISTRY);

      expect(unsupported).toBeUndefined();
      expect(migrated.v).toBe(2);
      // Nessuna prop v1 sostituita sopravvive (ADR-81 § "Decisione" punto 3).
      expect(migrated.props).not.toHaveProperty('styleTextColor');
      expect(migrated.props).not.toHaveProperty('styleFontSize');
      expect(migrated.props).not.toHaveProperty('styleHideDesktop');
    },
  );

  it('heading: props v1 vuote producono color/typography/margin/hideOn con default sicuri', () => {
    const input = node({ type: 'heading', props: {} });
    const { node: migrated, unsupported } = migrateBlockNode(input, DEFAULT_BLOCK_REGISTRY);

    expect(unsupported).toBeUndefined();
    expect(migrated.v).toBe(2);
    expect(migrated.props.color).toEqual({ normal: { default: { ref: 'text' } } });
    expect(migrated.props.margin).toEqual({
      default: { top: 0, right: 0, bottom: 0, left: 0, unit: 'px', linked: true },
    });
    expect(migrated.props.hideOn).toEqual([]);
  });

  it('button: href v1 assente produce link.href "/" (default sicuro, mai un valore che fa fallire la validazione)', () => {
    const input = node({ type: 'button', props: { label: 'Vai' } });
    const { node: migrated, unsupported } = migrateBlockNode(input, DEFAULT_BLOCK_REGISTRY);

    expect(unsupported).toBeUndefined();
    expect(migrated.props.link).toEqual({ href: '/', target: '_self', rel: [] });
  });

  it('albero con i quattro tipi foglia reali: migrateBlockTree non produce errori, tutti a v:2', () => {
    const tree: MigratableBlockNode[] = leafDefinitionsV2.map((definition, index) =>
      node({ id: `n${index}`, type: definition.type, props: {} }),
    );

    const result = migrateBlockTree(tree, DEFAULT_BLOCK_REGISTRY);

    expect(result.errors).toEqual([]);
    expect(result.blocks).toHaveLength(leafDefinitionsV2.length);
    result.blocks.forEach((b) => expect(b.v).toBe(2));
  });

  it('tipo non nel registro: passa attraverso invariato, nessun errore prodotto qui (compito del validator)', () => {
    const input = node({ type: 'nonEsiste', props: { x: 1 } });

    const { node: migrated, unsupported } = migrateBlockNode(input, DEFAULT_BLOCK_REGISTRY);

    expect(unsupported).toBeUndefined();
    expect(migrated).toBe(input);
  });
});

describe('motore di migrazione — stadio di identità cross-type `section` → `container` (ADR-82 § "Decisione" punto 3, round R2, Sub-Task S1.4)', () => {
  it('un nodo {type:"section", v:1} con figli produce un container v2 coerente, figli migrati ricorsivamente', () => {
    const sectionNode = node({
      id: 'sec',
      type: 'section',
      props: { columns: '1' },
      children: [node({ id: 'h', type: 'heading', props: { level: 'h2', text: 'Titolo' } })],
    });

    const { node: migrated, unsupported } = migrateBlockNode(sectionNode, DEFAULT_BLOCK_REGISTRY);

    expect(unsupported).toBeUndefined();
    expect(migrated.type).toBe('container');
    expect(migrated.v).toBe(2);
    expect(migrated.props).not.toHaveProperty('columns');
    expect((migrated.props.layout as Record<string, unknown>).default).toMatchObject({
      display: 'flex',
    });

    const result = migrateBlockTree([sectionNode], DEFAULT_BLOCK_REGISTRY);
    expect(result.errors).toEqual([]);
    expect(result.blocks[0].type).toBe('container');
    expect(result.blocks[0].v).toBe(2);
    expect(result.blocks[0].children[0].type).toBe('heading');
    expect(result.blocks[0].children[0].v).toBe(2);
  });

  it('sectionBlock resta nel registro come binario morto (`enabled: false`), ma non è mai raggiunto dal validatore nella pipeline reale (migrazione sempre prima della validazione)', () => {
    expect(sectionBlock.enabled).toBe(false);
    expect(sectionBlock.v).toBe(1);
    expect(sectionBlock.migrations).toEqual([]);
  });

  it('columns:"3" produce layout.display:"grid" con gridTemplateColumns a preset repeat', () => {
    const sectionNode = node({ type: 'section', props: { columns: '3' } });
    const { node: migrated } = migrateBlockNode(sectionNode, DEFAULT_BLOCK_REGISTRY);
    const layout = migrated.props.layout as Record<string, unknown>;
    expect((layout.default as Record<string, unknown>).display).toBe('grid');
    expect((layout.default as Record<string, unknown>).gridTemplateColumns).toEqual({
      preset: 'repeat',
      count: 3,
    });
  });
});

describe('motore di migrazione — tipo fittizio a v:2 con un gradino v1→v2', () => {
  /** Simula una prop rinominata `oldTitle` → `title`, con default 'Senza titolo'. */
  function stepV1ToV2(props: Record<string, unknown>): Record<string, unknown> {
    const legacyTitle = props.oldTitle;
    const title =
      typeof legacyTitle === 'string' && legacyTitle.length > 0 ? legacyTitle : 'Senza titolo';
    // Non muta l'oggetto ricevuto: costruisce un nuovo oggetto e scarta la chiave legacy.
    const rest = { ...props };
    delete rest.oldTitle;
    return { ...rest, title };
  }

  const fakeBlockV2: BlockDefinition = {
    type: 'fakeCard',
    v: 2,
    props: {
      title: { kind: 'plainText', required: true, maxLength: 200 },
    },
    children: { allow: [] },
    migrations: [stepV1ToV2],
    enabled: true,
  };

  const testRegistry: BlockRegistry = {
    definitions: new Map([['fakeCard', fakeBlockV2]]),
    rootAllowed: ['fakeCard'],
  };

  it('(a) nodo con v assente è trattato come v1 e migrato a v2', () => {
    const input = node({ type: 'fakeCard', props: { oldTitle: 'Ciao' } });

    const { node: migrated, unsupported } = migrateBlockNode(input, testRegistry);

    expect(unsupported).toBeUndefined();
    expect(migrated.v).toBe(2);
    expect(migrated.props).toEqual({ title: 'Ciao' });
  });

  it('(b) nodo già a v2 non subisce trasformazioni', () => {
    const props = { title: 'Già a posto' };
    const input = node({ type: 'fakeCard', v: 2, props });

    const { node: migrated, unsupported } = migrateBlockNode(input, testRegistry);

    expect(unsupported).toBeUndefined();
    expect(migrated.v).toBe(2);
    expect(migrated.props).toEqual(props);
  });

  it('(c) nodo a v3 (> corrente) produce BLOCK_VERSION_UNSUPPORTED con path, senza toccare le props, senza bloccare fratelli/figli', () => {
    const futureNode = node({
      id: 'future',
      type: 'fakeCard',
      v: 3,
      props: { title: 'Dal futuro' },
    });
    const sibling = node({ id: 'sibling', type: 'fakeCard', props: { oldTitle: 'Fratello' } });
    const childOfFuture = node({ id: 'child', type: 'fakeCard', props: { oldTitle: 'Figlio' } });
    const futureWithChild: MigratableBlockNode = { ...futureNode, children: [childOfFuture] };

    const result = migrateBlockTree([futureWithChild, sibling], testRegistry);

    expect(result.errors).toEqual([
      {
        code: 'BLOCK_VERSION_UNSUPPORTED',
        details: { path: 'blocks[0]', type: 'fakeCard', v: 3, current: 2 },
      },
    ]);

    // Il nodo dal futuro torna come ricevuto: props non toccate.
    expect(result.blocks[0].props).toEqual({ title: 'Dal futuro' });
    expect(result.blocks[0].v).toBe(3);

    // Il figlio del nodo dal futuro continua comunque a essere processato (migrato).
    expect(result.blocks[0].children[0].v).toBe(2);
    expect(result.blocks[0].children[0].props).toEqual({ title: 'Figlio' });

    // Il fratello continua a essere processato normalmente.
    expect(result.blocks[1].v).toBe(2);
    expect(result.blocks[1].props).toEqual({ title: 'Fratello' });
  });

  it('(d) la funzione di migrazione riceve props malformate e produce output valido con fallback ai default', () => {
    const missingKey = node({ type: 'fakeCard', props: {} });
    const wrongType = node({ type: 'fakeCard', props: { oldTitle: 42 } });

    const missingResult = migrateBlockNode(missingKey, testRegistry);
    const wrongTypeResult = migrateBlockNode(wrongType, testRegistry);

    expect(missingResult.unsupported).toBeUndefined();
    expect(missingResult.node.props).toEqual({ title: 'Senza titolo' });

    expect(wrongTypeResult.unsupported).toBeUndefined();
    expect(wrongTypeResult.node.props).toEqual({ title: 'Senza titolo' });
  });

  it("(e) l'oggetto props originale passato in input non viene mutato", () => {
    const originalProps = Object.freeze({ oldTitle: 'Non toccarmi' });
    const input = node({ type: 'fakeCard', props: originalProps as Record<string, unknown> });

    expect(() => migrateBlockNode(input, testRegistry)).not.toThrow();

    // L'oggetto originale, congelato, resta con la sua unica chiave: nessuna
    // mutazione in place l'avrebbe fatto esplodere in strict mode di ts-jest,
    // ma verifichiamo esplicitamente anche il contenuto.
    expect(originalProps).toEqual({ oldTitle: 'Non toccarmi' });
  });

  it('la catena applica solo i gradini necessari quando fromV === definition.v (nessun gradino eseguito)', () => {
    let calls = 0;
    const countingStep = (props: Record<string, unknown>): Record<string, unknown> => {
      calls += 1;
      return { ...props };
    };
    const v2WithCountingStep: BlockDefinition = { ...fakeBlockV2, migrations: [countingStep] };
    const registry: BlockRegistry = {
      definitions: new Map([['fakeCard', v2WithCountingStep]]),
      rootAllowed: ['fakeCard'],
    };

    const input = node({ type: 'fakeCard', v: 2, props: { title: 'Stabile' } });
    migrateBlockNode(input, registry);

    expect(calls).toBe(0);
  });
});

describe('motore di migrazione — envelope', () => {
  it('catena vuota: envelope invariato, ENVELOPE_VERSION corrente = 1', () => {
    const envelope = { version: 1, blocks: [] };

    const result = migrateEnvelope(envelope);

    expect(result.unsupported).toBeUndefined();
    expect(result.envelope).toEqual(envelope);
  });

  it('fromVersion assente ⇒ trattato come 1', () => {
    const envelope = { version: 1, blocks: [] };

    const result = migrateEnvelope(envelope, undefined as unknown as number);

    // fromVersion non passato usa il default del parametro (1).
    expect(result.unsupported).toBeUndefined();
  });

  it("fromVersion superiore alla versione corrente produce un esito unsupported, mai un'eccezione", () => {
    const envelope = { version: 2, blocks: [] };

    const result = migrateEnvelope(envelope, 2);

    expect(result.unsupported).toEqual({ version: 2, current: 1 });
    expect(result.envelope).toBe(envelope);
  });
});
