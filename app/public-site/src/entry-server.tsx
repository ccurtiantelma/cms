import { renderToStaticMarkup } from 'react-dom/server';
import type { components } from '@api-types';
import { compileTokensToCss } from '../../frontend/src/libs/globalTokensCompiler';
import { fetchActiveGlobalSections, fetchThemeSettings } from './public-api-client';
import App from './App';
import ErrorDocument from './ErrorDocument';
import PreviewDocument from './PreviewDocument';

type PublicPageDto = components['schemas']['PublicPageDto'];
type PagePreviewContentDto = components['schemas']['PagePreviewContentDto'];
type PublicActiveGlobalSectionsDto = components['schemas']['PublicActiveGlobalSectionsDto'];

const DOCTYPE = '<!DOCTYPE html>';

/**
 * Recupera i Global Design Tokens correnti (default di fabbrica in caso di
 * guasto, mai un'eccezione — vedi `fetchThemeSettings`) e li compila nel
 * blocco `:root { ... }` da iniettare nell'head del documento. Punto unico
 * di questa pipeline: ogni funzione `render*Document` qui sotto lo richiama.
 */
async function buildGlobalTokensCss(): Promise<string> {
  const tokens = await fetchThemeSettings();
  return compileTokensToCss(tokens);
}

/**
 * Le due letture di layout che ogni documento richiede — tokens di brand e
 * Sezioni Globali degli slot (ADR-40) — risolte **in parallelo**: sono
 * indipendenti fra loro, e serializzarle raddoppierebbe la latenza di ogni
 * risposta SSR per nessun motivo.
 *
 * Entrambe le funzioni sottostanti sono tolleranti ai guasti per costruzione e
 * non lanciano mai: qui non serve alcun `try`, e un backend irraggiungibile
 * produce un documento con i tokens di fabbrica e nessun header/footer, non un
 * `500`.
 */
async function buildLayoutContext(): Promise<{
  globalTokensCss: string;
  globalSections: PublicActiveGlobalSectionsDto;
}> {
  const [globalTokensCss, globalSections] = await Promise.all([
    buildGlobalTokensCss(),
    fetchActiveGlobalSections(),
  ]);
  return { globalTokensCss, globalSections };
}

/**
 * `renderToStaticMarkup`, non `renderToString`: il sito pubblico non idrata
 * nulla, quindi i marcatori di idratazione sarebbero byte morti (ADR-22 § 2).
 * Un'eccezione qui è un bug e deve propagare (→ `500` nel chiamante): nessun
 * Error Boundary gira in SSR, l'albero non servibile è già respinto a monte.
 */
export async function renderPageDocument(page: PublicPageDto, cssHref: string): Promise<string> {
  const { globalTokensCss, globalSections } = await buildLayoutContext();
  return (
    DOCTYPE +
    renderToStaticMarkup(
      <App
        page={page}
        cssHref={cssHref}
        globalTokensCss={globalTokensCss}
        globalSections={globalSections}
      />,
    )
  );
}

/** Stesso documento minimale per le pagine `404`/`500`. */
export async function renderErrorDocument(status: number, message: string, cssHref: string): Promise<string> {
  const globalTokensCss = await buildGlobalTokensCss();
  return (
    DOCTYPE +
    renderToStaticMarkup(
      <ErrorDocument status={status} message={message} cssHref={cssHref} globalTokensCss={globalTokensCss} />,
    )
  );
}

/**
 * Documento di anteprima di una bozza non pubblicata (ADR-25 § 3-4). Stesso
 * `renderToStaticMarkup` e stessi componenti blocco della pagina pubblica —
 * un'eccezione qui è un bug e deve propagare (→ `500` nel chiamante), stessa
 * garanzia di `renderPageDocument`.
 */
export async function renderPreviewDocument(page: PagePreviewContentDto, cssHref: string): Promise<string> {
  const { globalTokensCss, globalSections } = await buildLayoutContext();
  return (
    DOCTYPE +
    renderToStaticMarkup(
      <PreviewDocument
        page={page}
        cssHref={cssHref}
        globalTokensCss={globalTokensCss}
        globalSections={globalSections}
      />,
    )
  );
}
