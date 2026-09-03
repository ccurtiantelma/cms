import { SeoGraphService } from '../../../src/pages/seo-graph.service';
import { BlockNode } from '../../../src/pages/content-tree';
import { PageSeoDto } from '../../../src/pages/dto/page-seo.dto';

/**
 * Copertura di ADR-48: generazione JSON-LD `WebPage`/`FAQPage` e fallback
 * OpenGraph a publish-time, merge non distruttivo con `structuredData`
 * manuale, e conferma che la FAQ è letta da `existingSeo.faq` — mai da un
 * tipo di blocco nell'albero di contenuto (che non esiste, ADR-21).
 */
describe('SeoGraphService — generazione JSON-LD/OpenGraph (ADR-48)', () => {
  function buildService(): SeoGraphService {
    return new SeoGraphService();
  }

  function emptySeo(): PageSeoDto {
    return new PageSeoDto();
  }

  const irrelevantContentTree: BlockNode[] = [
    { id: 'b1', type: 'heading', v: 1, props: { text: 'Titolo' }, children: [] },
  ];

  it('genera un WebPage JSON-LD valido con name/description dalla Pagina', () => {
    const seo = emptySeo();
    seo.metaTitle = 'Titolo SEO';
    seo.metaDescription = 'Descrizione SEO';

    const result = buildService().generateSeoMetadata('Titolo Pagina', irrelevantContentTree, seo);

    expect(result.structuredData).toEqual({
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: 'Titolo SEO',
      description: 'Descrizione SEO',
    });
  });

  it('usa il titolo della Pagina come fallback quando metaTitle è vuoto', () => {
    const result = buildService().generateSeoMetadata(
      'Titolo Pagina',
      irrelevantContentTree,
      emptySeo(),
    );

    expect((result.structuredData as { name: string }).name).toBe('Titolo Pagina');
  });

  it('co-genera FAQPage con mainEntity Question/Answer quando seo.faq è popolato', () => {
    const seo = emptySeo();
    seo.metaTitle = 'Titolo SEO';
    seo.faq = [
      { question: 'Domanda 1?', answer: 'Risposta 1.' },
      { question: 'Domanda 2?', answer: 'Risposta 2.' },
    ];

    const result = buildService().generateSeoMetadata('Titolo Pagina', irrelevantContentTree, seo);

    expect(result.structuredData).toEqual({
      '@context': 'https://schema.org',
      '@graph': [
        { '@type': 'WebPage', name: 'Titolo SEO' },
        {
          '@type': 'FAQPage',
          mainEntity: [
            {
              '@type': 'Question',
              name: 'Domanda 1?',
              acceptedAnswer: { '@type': 'Answer', text: 'Risposta 1.' },
            },
            {
              '@type': 'Question',
              name: 'Domanda 2?',
              acceptedAnswer: { '@type': 'Answer', text: 'Risposta 2.' },
            },
          ],
        },
      ],
    });
  });

  it('non co-genera FAQPage quando seo.faq è assente o vuoto', () => {
    const seo = emptySeo();
    seo.faq = [];

    const result = buildService().generateSeoMetadata('Titolo Pagina', irrelevantContentTree, seo);

    expect(result.structuredData).not.toHaveProperty('@graph');
    expect((result.structuredData as { '@type': string })['@type']).toBe('WebPage');
  });

  it('ignora completamente contentTree: la FAQ non è mai letta da un blocco (nessun tipo di blocco FAQ esiste, ADR-21)', () => {
    const seo = emptySeo();
    seo.faq = [{ question: 'Domanda?', answer: 'Risposta.' }];

    const faqBlockTree: BlockNode[] = [
      {
        id: 'faq-1',
        type: 'faq',
        v: 1,
        props: { question: 'Da un blocco?', answer: 'Non deve comparire.' },
        children: [],
      },
    ];

    const withFaqBlocks = buildService().generateSeoMetadata('Titolo', faqBlockTree, seo);
    const withoutBlocks = buildService().generateSeoMetadata('Titolo', [], seo);

    expect(withFaqBlocks.structuredData).toEqual(withoutBlocks.structuredData);
  });

  it("single source of truth: il generato non sovrascrive mai una chiave già presente nell'estensione manuale di structuredData", () => {
    const seo = emptySeo();
    seo.metaTitle = 'Titolo SEO';
    seo.structuredData = {
      '@type': 'WebPage',
      name: 'Nome scritto a mano dal redattore',
      customField: 'valore manuale che deve sopravvivere',
    };

    const result = buildService().generateSeoMetadata('Titolo Pagina', irrelevantContentTree, seo);

    expect(result.structuredData).toMatchObject({
      name: 'Nome scritto a mano dal redattore',
      customField: 'valore manuale che deve sopravvivere',
    });
  });

  it('non inquina structuredData con markup HTML: solo dati, mai tag <script>/<meta>', () => {
    const seo = emptySeo();
    seo.metaTitle = 'Titolo SEO';
    seo.faq = [{ question: 'Domanda?', answer: 'Risposta.' }];

    const result = buildService().generateSeoMetadata('Titolo Pagina', irrelevantContentTree, seo);
    const serialized = JSON.stringify(result.structuredData);

    expect(serialized).not.toMatch(/<script|<meta|<\/?[a-z]+>/i);
  });

  it('applica il fallback OpenGraph (ogTitle/ogDescription) da metaTitle/metaDescription quando vuoti', () => {
    const seo = emptySeo();
    seo.metaTitle = 'Meta Titolo';
    seo.metaDescription = 'Meta Descrizione';

    const result = buildService().generateSeoMetadata('Titolo Pagina', irrelevantContentTree, seo);

    expect(result.ogTitle).toBe('Meta Titolo');
    expect(result.ogDescription).toBe('Meta Descrizione');
  });

  it('non sovrascrive ogTitle/ogDescription già impostati esplicitamente in SEO', () => {
    const seo = emptySeo();
    seo.metaTitle = 'Meta Titolo';
    seo.metaDescription = 'Meta Descrizione';
    seo.ogTitle = 'OG Titolo esplicito';
    seo.ogDescription = 'OG Descrizione esplicita';

    const result = buildService().generateSeoMetadata('Titolo Pagina', irrelevantContentTree, seo);

    expect(result.ogTitle).toBe('OG Titolo esplicito');
    expect(result.ogDescription).toBe('OG Descrizione esplicita');
  });

  it('usa il titolo della Pagina come ultimo fallback per ogTitle quando metaTitle è vuoto', () => {
    const result = buildService().generateSeoMetadata(
      'Titolo Pagina',
      irrelevantContentTree,
      emptySeo(),
    );

    expect(result.ogTitle).toBe('Titolo Pagina');
  });

  it('non genera markup per ogImage: il campo resta invariato (nessuna fonte "immagine di copertina" nello schema)', () => {
    const seo = emptySeo();
    seo.ogImage = 'https://cdn.example.com/cover.png';

    const result = buildService().generateSeoMetadata('Titolo Pagina', irrelevantContentTree, seo);

    expect(result.ogImage).toBe('https://cdn.example.com/cover.png');
  });
});
