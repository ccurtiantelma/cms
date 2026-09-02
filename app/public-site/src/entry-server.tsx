import { renderToStaticMarkup } from 'react-dom/server';
import type { components } from '@api-types';
import type { ThemeConfigDto } from '../../frontend/src/utils/theme-css.utils';
import { fetchActiveGlobalSections, fetchThemeConfig } from './public-api-client';
import App from './App';
import ErrorDocument from './ErrorDocument';
import PreviewDocument from './PreviewDocument';

type PublicPageDto = components['schemas']['PublicPageDto'];
type PagePreviewContentDto = components['schemas']['PagePreviewContentDto'];
type PublicActiveGlobalSectionsDto = components['schemas']['PublicActiveGlobalSectionsDto'];

const DOCTYPE = '<!DOCTYPE html>';

/**
 * Le due letture di layout che ogni documento richiede — il tema
 * dell'installazione (Editor tema, ADR-4) e le Sezioni Globali degli slot
 * (ADR-40) — risolte **in parallelo**: sono indipendenti fra loro, e
 * serializzarle raddoppierebbe la latenza di ogni risposta SSR per nessun
 * motivo.
 *
 * Entrambe le funzioni sottostanti sono tolleranti ai guasti per costruzione e
 * non lanciano mai: qui non serve alcun `try`, e un backend irraggiungibile
 * produce un documento senza tema e senza header/footer, non un `500`.
 */
async function buildLayoutContext(): Promise<{
  themeConfig: ThemeConfigDto | null;
  globalSections: PublicActiveGlobalSectionsDto;
}> {
  const [themeConfig, globalSections] = await Promise.all([
    fetchThemeConfig(),
    fetchActiveGlobalSections(),
  ]);
  return { themeConfig, globalSections };
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
  const { themeConfig, globalSections } = await buildLayoutContext();
  return (
    DOCTYPE +
    renderToStaticMarkup(
      <App
        page={page}
        cssHref={cssHref}
        formScriptHref={formScriptHref}
        themeConfig={themeConfig}
        globalSections={globalSections}
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
  const { themeConfig, globalSections } = await buildLayoutContext();
  return (
    DOCTYPE +
    renderToStaticMarkup(
      <PreviewDocument
        page={page}
        cssHref={cssHref}
        formScriptHref={formScriptHref}
        themeConfig={themeConfig}
        globalSections={globalSections}
      />,
    )
  );
}
