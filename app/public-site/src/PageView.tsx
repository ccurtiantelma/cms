import BlockRenderer from '@blocks/BlockRenderer';
import type { RenderableBlockNode } from '@blocks/types';
import type { components } from '@api-types';

type PublicPageContent = components['schemas']['PublicPageDto']['content'];
type PublicActiveGlobalSectionsDto = components['schemas']['PublicActiveGlobalSectionsDto'];
type PublicGlobalSectionDto = components['schemas']['PublicGlobalSectionDto'];

interface PageViewProps {
  content: PublicPageContent;
  /**
   * Sezioni Globali assegnate agli slot di layout (ADR-40), già risolte dal
   * chiamante. Opzionale — e ogni slot al suo interno può essere `null`: una
   * Pagina si serve per intero anche senza header né footer, che sono cromatura
   * del layout e non contenuto (vedi `fetchActiveGlobalSections`).
   */
  globalSections?: PublicActiveGlobalSectionsDto;
}

/**
 * Estrae l'albero di blocchi renderizzabile da un envelope `jsonb` non tipizzato.
 * Un `content` assente o senza `blocks` array dà un albero vuoto: uno slot con una
 * Sezione dal contenuto malformato non deve impedire il render della Pagina.
 */
function blocksOf(content: { blocks?: unknown } | undefined): RenderableBlockNode[] {
  return (Array.isArray(content?.blocks) ? content.blocks : []) as RenderableBlockNode[];
}

/**
 * Renderizza una Sezione Globale dentro il proprio landmark semantico
 * (`<header>`/`<footer>`). Restituisce `null` — nessun elemento vuoto nel
 * documento — quando lo slot non è assegnato o la Sezione non ha blocchi.
 */
function GlobalSectionSlot({
  section,
  as: Tag,
}: {
  section: PublicGlobalSectionDto | null | undefined;
  as: 'header' | 'footer';
}) {
  const blocks = blocksOf(section?.content);
  if (blocks.length === 0) return null;
  return (
    <Tag>
      {blocks.map((block) => (
        <BlockRenderer key={block.id} node={block} />
      ))}
    </Tag>
  );
}

/**
 * Renderizza l'albero di blocchi della Revisione pubblicata (già validato e
 * migrato server-side, ADR-21). Nessuna rivalidazione qui: stessa fiducia nel
 * server che l'admin già applica al proprio albero in sola lettura
 * (`PagePageDetail.tsx`).
 *
 * Attorno alla Pagina, gli slot di layout di ADR-40: la Sezione Globale
 * assegnata a `header` in cima al documento — prima dell'albero di Pagina — e
 * quella assegnata a `footer` in fondo. Entrambi gli slot sono facoltativi e
 * indipendenti: se nessuna Sezione è assegnata (o se l'endpoint non ha
 * risposto), resta esattamente il `<main>` di prima, senza errori.
 */
export default function PageView({ content, globalSections }: PageViewProps) {
  const blocks = blocksOf(content);

  return (
    <>
      <GlobalSectionSlot section={globalSections?.header} as="header" />
      <main>
        {blocks.map((block) => (
          <BlockRenderer key={block.id} node={block} />
        ))}
      </main>
      <GlobalSectionSlot section={globalSections?.footer} as="footer" />
    </>
  );
}
