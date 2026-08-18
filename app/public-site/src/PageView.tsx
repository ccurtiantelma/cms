import BlockRenderer from '@blocks/BlockRenderer';
import type { RenderableBlockNode } from '@blocks/types';
import type { components } from '@api-types';

type PublicPageContent = components['schemas']['PublicPageDto']['content'];

interface PageViewProps {
  content: PublicPageContent;
}

/**
 * Renderizza l'albero di blocchi della Revisione pubblicata (già validato e
 * migrato server-side, ADR-21). Nessuna rivalidazione qui: stessa fiducia nel
 * server che l'admin già applica al proprio albero in sola lettura
 * (`PagePageDetail.tsx`).
 */
export default function PageView({ content }: PageViewProps) {
  const blocks = (
    Array.isArray(content.blocks) ? content.blocks : []
  ) as RenderableBlockNode[];

  return (
    <main>
      {blocks.map((block) => (
        <BlockRenderer key={block.id} node={block} />
      ))}
    </main>
  );
}
