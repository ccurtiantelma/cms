import { PagesService } from '../../../src/pages/pages.service';
import type { ContentTree } from '../../../src/pages/content-tree';

/**
 * Unit test puri della clonazione dell'albero blocchi usata da
 * `createTranslation()` (RFC-F05 § 3, estensione F05-02): gli `id` dei nodi
 * devono essere rigenerati per prevenire collisioni d'identità fra la
 * Pagina sorgente e la traduzione, mentre struttura/testi restano invariati
 * (deep-clone, non lo stesso riferimento). Le dipendenze del costruttore non
 * sono usate da questo percorso — un mock vuoto basta.
 */
describe('PagesService — clonazione albero blocchi con id rigenerati (F05-02)', () => {
  function buildService(): PagesService {
    const noop = {} as never;
    return new PagesService(noop, noop, noop, noop, noop, noop, noop, noop, noop, noop, noop);
  }

  function cloneContentTree(service: PagesService, content: ContentTree): ContentTree {
    // Accesso al metodo privato: coerente con la scelta di non esporre
    // `cloneContentTreeWithFreshIds`/`cloneBlockNodeWithFreshIds` come API
    // pubblica, riusata sia da `createTranslation` sia dai blueprint.
    return (
      service as unknown as {
        cloneContentTreeWithFreshIds(c: ContentTree): ContentTree;
      }
    ).cloneContentTreeWithFreshIds(content);
  }

  it("rigenera l'id di ogni nodo, a ogni livello di annidamento", () => {
    const service = buildService();
    const source: ContentTree = {
      version: 1,
      blocks: [
        {
          id: 'root-1',
          type: 'section',
          v: 1,
          props: {},
          children: [
            {
              id: 'child-1',
              type: 'heading',
              v: 1,
              props: { level: 'h2', text: 'Titolo' },
              children: [],
            },
            {
              id: 'child-2',
              type: 'heading',
              v: 1,
              props: { level: 'h3', text: 'Sottotitolo' },
              children: [],
            },
          ],
        },
      ],
    };

    const cloned = cloneContentTree(service, source);

    expect(cloned.blocks[0].id).not.toBe('root-1');
    expect(cloned.blocks[0].children[0].id).not.toBe('child-1');
    expect(cloned.blocks[0].children[1].id).not.toBe('child-2');

    // Nessuna collisione fra gli id generati nello stesso albero.
    const ids = [cloned.blocks[0].id, ...cloned.blocks[0].children.map((c) => c.id)];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("preserva type/v/props/struttura, solo l'id cambia", () => {
    const service = buildService();
    const source: ContentTree = {
      version: 1,
      blocks: [
        {
          id: 'b1',
          type: 'heading',
          v: 1,
          props: { level: 'h2', text: 'Testo originale' },
          children: [],
        },
      ],
    };

    const cloned = cloneContentTree(service, source);

    expect(cloned.version).toBe(source.version);
    expect(cloned.blocks[0].type).toBe(source.blocks[0].type);
    expect(cloned.blocks[0].v).toBe(source.blocks[0].v);
    expect(cloned.blocks[0].props).toEqual(source.blocks[0].props);
  });

  it('è un deep-clone: mutare la copia non tocca la sorgente', () => {
    const service = buildService();
    const source: ContentTree = {
      version: 1,
      blocks: [
        {
          id: 'b1',
          type: 'heading',
          v: 1,
          props: { level: 'h2', text: 'Testo originale' },
          children: [],
        },
      ],
    };

    const cloned = cloneContentTree(service, source);
    (cloned.blocks[0].props as { text: string }).text = 'Testo mutato nella copia';

    expect((source.blocks[0].props as { text: string }).text).toBe('Testo originale');
  });
});
