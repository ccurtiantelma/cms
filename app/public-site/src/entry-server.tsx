import { renderToStaticMarkup } from 'react-dom/server';
import type { components } from '@api-types';
import type { RenderableBlockNode } from '@blocks/types';
import type { ThemeConfigDto } from '../../frontend/src/utils/theme-css.utils';
import {
  fetchActiveGlobalSections,
  fetchThemeConfig,
  resolvePageGuidsToPaths,
} from './public-api-client';
import { blocksOf } from './PageView';
import App from './App';
import ErrorDocument from './ErrorDocument';
import PreviewDocument from './PreviewDocument';

type PublicPageDto = components['schemas']['PublicPageDto'];
type PagePreviewContentDto = components['schemas']['PagePreviewContentDto'];
type PublicActiveGlobalSectionsDto = components['schemas']['PublicActiveGlobalSectionsDto'];

const DOCTYPE = '<!DOCTYPE html>';

/**
 * Cerca ricorsivamente i `pageGuid` referenziati da ogni `navMenuItem` dell'albero
 * (ADR-52 § Conseguenze) — stesso principio di `hasFormBlock` in `PageView.tsx`, un walker
 * dedicato invece di riusare quello (cerca un valore, non solo la presenza di un tipo).
 * `pageGuid` assente/vuoto non produce voci: `url` esplicito o nessun link non hanno nulla
 * da risolvere.
 */
function collectNavMenuPageGuids(nodes: readonly RenderableBlockNode[]): string[] {
  const guids: string[] = [];
  for (const node of nodes) {
    if (node.type === 'navMenuItem') {
      const pageGuid = node.props.pageGuid;
      if (typeof pageGuid === 'string' && pageGuid) guids.push(pageGuid);
    }
    guids.push(...collectNavMenuPageGuids(node.children));
  }
  return guids;
}

/**
 * Le tre letture di layout/contenuto che ogni documento richiede — il tema
 * dell'installazione (Editor tema, ADR-4), le Sezioni Globali degli slot
 * (ADR-40) e la risoluzione `pageGuid → percorso` di ogni `navMenuItem`
 * (ADR-52) — le prime due risolte **in parallelo**: sono indipendenti fra
 * loro, e serializzarle raddoppierebbe la latenza di ogni risposta SSR per
 * nessun motivo. La risoluzione dei `pageGuid` segue, perché dipende anche
 * dai blocchi di header/footer appena arrivati dalle Sezioni Globali.
 *
 * Tutte e tre le funzioni sottostanti sono tolleranti ai guasti per
 * costruzione e non lanciano mai: qui non serve alcun `try`, e un backend
 * irraggiungibile produce un documento senza tema, senza header/footer e con
 * ogni voce di menu senza `href`, non un `500`.
 */
async function buildLayoutContext(pageBlocks: readonly RenderableBlockNode[]): Promise<{
  themeConfig: ThemeConfigDto | null;
  globalSections: PublicActiveGlobalSectionsDto;
  resolvePageUrl: (pageGuid: string) => string | null | undefined;
}> {
  const [themeConfig, globalSections] = await Promise.all([
    fetchThemeConfig(),
    fetchActiveGlobalSections(),
  ]);

  const headerBlocks = blocksOf(globalSections.header?.content);
  const footerBlocks = blocksOf(globalSections.footer?.content);
  const pageGuids = [
    ...collectNavMenuPageGuids(pageBlocks),
    ...collectNavMenuPageGuids(headerBlocks),
    ...collectNavMenuPageGuids(footerBlocks),
  ];
  const pageUrlByGuid =
    pageGuids.length > 0 ? await resolvePageGuidsToPaths(pageGuids) : new Map<string, string | null>();

  return {
    themeConfig,
    globalSections,
    resolvePageUrl: (pageGuid: string) => pageUrlByGuid.get(pageGuid),
  };
}

/**
 * `renderToStaticMarkup`, non `renderToString`: il sito pubblico non idrata
 * nulla, quindi i marcatori di idratazione sarebbero byte morti (ADR-22 § 2).
 * Un'eccezione qui è un bug e deve propagare (→ `500` nel chiamante): nessun
 * Error Boundary gira in SSR, l'albero non servibile è già respinto a monte.
 */
export async function renderPageDocument(
  page: PublicPageDto,
  cssHref: string,
  formScriptHref = '',
): Promise<string> {
  const { themeConfig, globalSections, resolvePageUrl } = await buildLayoutContext(
    blocksOf(page.content),
  );
  return (
    DOCTYPE +
    renderToStaticMarkup(
      <App
        page={page}
        cssHref={cssHref}
        formScriptHref={formScriptHref}
        themeConfig={themeConfig}
        globalSections={globalSections}
        resolvePageUrl={resolvePageUrl}
      />,
    )
  );
}

/** Stesso documento minimale per le pagine `404`/`500`. */
export async function renderErrorDocument(status: number, message: string, cssHref: string): Promise<string> {
  const themeConfig = await fetchThemeConfig();
  return (
    DOCTYPE +
    renderToStaticMarkup(
      <ErrorDocument status={status} message={message} cssHref={cssHref} themeConfig={themeConfig} />,
    )
  );
}

/**
 * Documento di anteprima di una bozza non pubblicata (ADR-25 § 3-4). Stesso
 * `renderToStaticMarkup` e stessi componenti blocco della pagina pubblica —
 * un'eccezione qui è un bug e deve propagare (→ `500` nel chiamante), stessa
 * garanzia di `renderPageDocument`.
 */
export async function renderPreviewDocument(
  page: PagePreviewContentDto,
  cssHref: string,
  formScriptHref = '',
): Promise<string> {
  const { themeConfig, globalSections, resolvePageUrl } = await buildLayoutContext(
    blocksOf(page.content),
  );
  return (
    DOCTYPE +
    renderToStaticMarkup(
      <PreviewDocument
        page={page}
        cssHref={cssHref}
        formScriptHref={formScriptHref}
        themeConfig={themeConfig}
        globalSections={globalSections}
        resolvePageUrl={resolvePageUrl}
      />,
    )
  );
}
