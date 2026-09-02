import BlockRenderer from '@blocks/BlockRenderer';
import type { RenderableBlockNode } from '@blocks/types';
import type { components } from '@api-types';
import { computeFormHoneypotFieldName, computeFormSignature } from './form-antispam';
import { PublicSiteConfig } from './config';

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
  /**
   * URL dell'isola JS di submit dei Form (F10-04, `server.ts`/`entry-server.tsx`).
   * Iniettata come `<script defer>` solo se l'albero contiene almeno un blocco
   * `form` (vedi {@link hasFormBlock}): il sito pubblico resta senza JavaScript
   * per ogni Pagina che non ne ha bisogno (ADR-22 § 2), la deroga vale solo dove
   * serve davvero un invio reale.
   */
  formScriptHref?: string;
}

/**
 * Honeypot/firma HMAC per `formKey` (RFC-46 D6), calcolati qui — unico punto
 * con accesso al secret lato renderer pubblico (`form-antispam.ts`) — e l'URL
 * di destinazione del submit, sull'origine **rivolta al browser** del backend
 * (`PublicSiteConfig.publicApiBrowserBaseUrl`, mai quella server-to-server usata
 * per le fetch SSR). Passata a `BlockRenderer` come pass-through opzionale
 * (F10-04, N8): il Canvas admin non la passa mai.
 */
function resolveFormSubmission(formKey: string) {
  return {
    honeypotFieldName: computeFormHoneypotFieldName(formKey),
    signature: computeFormSignature(formKey),
    submitUrl: `${PublicSiteConfig.publicApiBrowserBaseUrl}/api/v1/public/forms/${encodeURIComponent(formKey)}/submit`,
  };
}

/** Cerca ricorsivamente un nodo `type: 'form'` nell'albero, per decidere se iniettare l'isola JS di submit. */
function hasFormBlock(nodes: readonly RenderableBlockNode[]): boolean {
  return nodes.some((node) => node.type === 'form' || hasFormBlock(node.children));
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
  const stickyStyle = Tag === 'header' && section?.isSticky ? { position: 'sticky', top: 0, zIndex: 20 } : undefined;
  return (
    <Tag style={stickyStyle}>
      {blocks.map((block) => (
        <BlockRenderer key={block.id} node={block} formSubmission={resolveFormSubmission} />
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
export default function PageView({ content, globalSections, formScriptHref = '' }: PageViewProps) {
  const blocks = blocksOf(content);
  const headerBlocks = blocksOf(globalSections?.header?.content);
  const footerBlocks = blocksOf(globalSections?.footer?.content);
  const needsFormScript =
    hasFormBlock(blocks) || hasFormBlock(headerBlocks) || hasFormBlock(footerBlocks);

  return (
    <>
      <GlobalSectionSlot section={globalSections?.header} as="header" />
      <main>
        {blocks.map((block) => (
          <BlockRenderer key={block.id} node={block} formSubmission={resolveFormSubmission} />
        ))}
      </main>
      <GlobalSectionSlot section={globalSections?.footer} as="footer" />
      {needsFormScript ? <script src={formScriptHref} defer /> : null}
    </>
  );
}
