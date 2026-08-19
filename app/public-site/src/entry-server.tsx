import { renderToStaticMarkup } from 'react-dom/server';
import type { components } from '@api-types';
import App from './App';
import ErrorDocument from './ErrorDocument';
import PreviewDocument from './PreviewDocument';

type PublicPageDto = components['schemas']['PublicPageDto'];
type PagePreviewContentDto = components['schemas']['PagePreviewContentDto'];

const DOCTYPE = '<!DOCTYPE html>';

/**
 * `renderToStaticMarkup`, non `renderToString`: il sito pubblico non idrata
 * nulla, quindi i marcatori di idratazione sarebbero byte morti (ADR-22 § 2).
 * Un'eccezione qui è un bug e deve propagare (→ `500` nel chiamante): nessun
 * Error Boundary gira in SSR, l'albero non servibile è già respinto a monte.
 */
export function renderPageDocument(page: PublicPageDto, cssHref: string): string {
  return DOCTYPE + renderToStaticMarkup(<App page={page} cssHref={cssHref} />);
}

/** Stesso documento minimale per le pagine `404`/`500`. */
export function renderErrorDocument(status: number, message: string, cssHref: string): string {
  return DOCTYPE + renderToStaticMarkup(<ErrorDocument status={status} message={message} cssHref={cssHref} />);
}

/**
 * Documento di anteprima di una bozza non pubblicata (ADR-25 § 3-4). Stesso
 * `renderToStaticMarkup` e stessi componenti blocco della pagina pubblica —
 * un'eccezione qui è un bug e deve propagare (→ `500` nel chiamante), stessa
 * garanzia di `renderPageDocument`.
 */
export function renderPreviewDocument(page: PagePreviewContentDto, cssHref: string): string {
  return DOCTYPE + renderToStaticMarkup(<PreviewDocument page={page} cssHref={cssHref} />);
}
