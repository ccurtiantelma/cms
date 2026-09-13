// Carica le variabili d'ambiente dal file .env prima di tutto il resto
import dotenv from 'dotenv';
dotenv.config();

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PublicSiteConfig } from './config';
import { timingSafeEqual } from 'node:crypto';
import { resolvePublicPage } from './public-api-client';
import { resolvePreviewPage } from './preview-api-client';
import { renderErrorDocument, renderPageDocument, renderPreviewDocument } from './entry-server';
import { createNonce, securityHeaders } from './security-headers';

/**
 * Header imposti su **ogni** risposta della rotta di anteprima — `404` per
 * token vuoto, `200`, `404`, `500` e `500` di ultima istanza — senza eccezioni
 * configurabili. Un solo oggetto invece di due costanti separate perché un ramo
 * non possa ricordarne uno e dimenticare l'altro: stesso principio di
 * `writeHead` qui sotto, unico punto che scrive gli header di sicurezza.
 *
 * - `X-Robots-Tag` (ADR-25 § 4): l'anteprima non è indicizzabile per
 *   costruzione, non per convenzione.
 * - `Cache-Control` (ADR-25 § 3, «nessuna cache Redis: ogni lettura è fresca»):
 *   la freschezza lato server non serve a nulla se un proxy o il browser
 *   trattengono l'HTML di una bozza. `no-store` è la direttiva che vieta la
 *   memorizzazione (RFC 9111); `private` è difesa in profondità per le cache
 *   condivise legacy che onorano l'ambito di cacheabilità ma non `no-store`.
 *   Sta qui e non in `securityHeaders()` perché quest'ultima vale per ogni
 *   risposta del processo, comprese le Pagine pubblicate e il CSS con
 *   fingerprint che porta `immutable`: un `no-store` centralizzato
 *   contraddirebbe ADR-53 § 2 sulla cacheabilità del contenuto pubblicato.
 */
const PREVIEW_RESPONSE_HEADERS = {
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
  'Cache-Control': 'no-store, private',
} as const;

/**
 * Scrive gli header di sicurezza (`securityHeaders`, mai omessi — successo,
 * `404`, `405`, `308`, `500`, stesso principio di `PREVIEW_RESPONSE_HEADERS`
 * qui esteso a ogni risposta) più quelli specifici della singola rotta, in
 * un'unica chiamata a `writeHead`. Unico punto che chiama `writeHead` in
 * questo file: nessuna rotta può dimenticare gli header di sicurezza perché
 * nessuna rotta chiama `writeHead` direttamente.
 */
function writeHead(
  res: ServerResponse,
  statusCode: number,
  nonce: string,
  headers: Record<string, string> = {},
): void {
  res.writeHead(statusCode, { ...securityHeaders(nonce), ...headers });
}

/**
 * Prefisso della rotta di anteprima (ADR-25 § 3): percorso dedicato e mai
 * convergente con la risoluzione iterativa per slug di ADR-24 — un token
 * scaduto non deve mai finire a risolvere come se fosse uno slug.
 */
const PREVIEW_PATH_PREFIX = '/__preview/';

const currentDir = dirname(fileURLToPath(import.meta.url));

/**
 * `vite build --ssr src/server.ts` bundla il server e, attraversando
 * `entry-server → App → PageView → @blocks`, estrae anche il CSS in
 * `dist/assets/` (sibling di questo file compilato). Nome hashato, quindi
 * cercato all'avvio invece che cablato: se manca, il build è rotto e il
 * processo non deve avviarsi.
 */
function loadCss(): { href: string; content: string } {
  const assetsDir = join(currentDir, 'assets');
  const fileName = readdirSync(assetsDir)
    .filter((name) => name.endsWith('.css'))
    .sort()[0];
  if (!fileName) {
    throw new Error(`Nessun file CSS trovato in ${assetsDir}: build client mancante o rotta.`);
  }
  return {
    href: `/assets/${fileName}`,
    content: readFileSync(join(assetsDir, fileName), 'utf-8'),
  };
}

/**
 * Isola JS di submit dei Form (F10-04): asset statico non hashato — a
 * differenza del CSS non deriva dal contenuto dei blocchi, è un file scritto
 * a mano e copiato in `dist/assets/` dallo script `build` (`package.json`).
 * Nessun `Cache-Control: immutable` (il nome file non cambia a ogni deploy
 * come invece garantisce l'hash del CSS).
 */
function loadFormSubmitScript(): { href: string; content: string } {
  const fileName = 'form-submit.js';
  return {
    href: `/assets/${fileName}`,
    content: readFileSync(join(currentDir, 'assets', fileName), 'utf-8'),
  };
}

/** Header con cui il worker di export si fa riconoscere (ADR-67), in minuscolo come lo espone `node:http`. */
const EXPORT_RENDER_TOKEN_HEADER = 'x-export-render-token';

/** Confronto a tempo costante del segreto di export: nessuna informazione dal tempo di risposta. */
function hasValidExportRenderToken(req: IncomingMessage): boolean {
  const presented = req.headers[EXPORT_RENDER_TOKEN_HEADER];
  if (typeof presented !== 'string') return false;
  const expected = Buffer.from(PublicSiteConfig.exportRenderSecret);
  const actual = Buffer.from(presented);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

const css = loadCss();
const formSubmitScript = loadFormSubmitScript();

async function handleRequest(req: IncomingMessage, res: ServerResponse, nonce: string): Promise<void> {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    writeHead(res, 405, nonce, { 'Content-Type': 'text/plain; charset=utf-8', Allow: 'GET, HEAD' });
    res.end('Method Not Allowed');
    return;
  }

  const url = new URL(req.url ?? '/', 'http://public-site.internal');
  const isHead = req.method === 'HEAD';

  if (url.pathname === '/healthz') {
    writeHead(res, 200, nonce, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(isHead ? undefined : 'ok');
    return;
  }

  if (url.pathname === css.href) {
    writeHead(res, 200, nonce, {
      'Content-Type': 'text/css; charset=utf-8',
      'Cache-Control': 'public, max-age=31536000, immutable',
    });
    res.end(isHead ? undefined : css.content);
    return;
  }

  if (url.pathname === formSubmitScript.href) {
    writeHead(res, 200, nonce, {
      'Content-Type': 'text/javascript; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    });
    res.end(isHead ? undefined : formSubmitScript.content);
    return;
  }

  if (url.pathname.startsWith(PREVIEW_PATH_PREFIX)) {
    await handlePreviewRequest(url.pathname, isHead, res, nonce);
    return;
  }

  // ADR-67 (ADR-53 § 5): con il segreto di export configurato le Pagine si
  // rendono solo per il worker; ogni altra richiesta riceve lo stesso `404`
  // di una Pagina inesistente, senza consultare il backend.
  const isExportRender = req.headers[EXPORT_RENDER_TOKEN_HEADER] !== undefined;
  if (PublicSiteConfig.exportRenderSecret !== '' && !hasValidExportRenderToken(req)) {
    writeHead(res, 404, nonce, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(isHead ? undefined : await renderErrorDocument(404, 'Pagina non trovata', css.href, nonce));
    return;
  }

  const resolution = await resolvePublicPage(url.pathname, isExportRender);

  switch (resolution.kind) {
    case 'ok': {
      // `url.pathname` è già il percorso canonico: `resolvePublicPage` avrebbe
      // risposto `redirect` (case sotto) se non lo fosse (ADR-24 § 4) — nessun
      // ricalcolo qui, si passa lo stesso percorso già usato per la richiesta.
      const html = isHead
        ? undefined
        : await renderPageDocument(resolution.page, css.href, formSubmitScript.href, url.pathname, nonce);
      writeHead(res, 200, nonce, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
    }
    case 'redirect': {
      writeHead(res, 308, nonce, { Location: resolution.location });
      res.end();
      return;
    }
    case 'not-found': {
      writeHead(res, 404, nonce, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(isHead ? undefined : await renderErrorDocument(404, 'Pagina non trovata', css.href, nonce));
      return;
    }
    case 'error': {
      writeHead(res, 500, nonce, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(isHead ? undefined : await renderErrorDocument(500, 'Errore interno', css.href, nonce));
      return;
    }
  }
}

/**
 * Rotta di anteprima (`/__preview/:token`, ADR-25 § 3-4). Percorso separato
 * dalla risoluzione per slug di ADR-24: mai fuso col routing pubblico, per
 * costruzione qui non c'è iterazione per segmenti, solo un token opaco.
 *
 * Ogni risposta — successo, `404` o `500` — porta sempre
 * `PREVIEW_RESPONSE_HEADERS`, senza eccezioni: l'anteprima non è indicizzabile
 * né memorizzabile per costruzione, non per convenzione.
 */
async function handlePreviewRequest(
  pathname: string,
  isHead: boolean,
  res: ServerResponse,
  nonce: string,
): Promise<void> {
  try {
    const token = pathname.slice(PREVIEW_PATH_PREFIX.length);

    if (!token) {
      writeHead(res, 404, nonce, {
        'Content-Type': 'text/html; charset=utf-8',
        ...PREVIEW_RESPONSE_HEADERS,
      });
      res.end(isHead ? undefined : await renderErrorDocument(404, 'Pagina non trovata', css.href, nonce));
      return;
    }

    const resolution = await resolvePreviewPage(token);

    switch (resolution.kind) {
      case 'ok': {
        const html = isHead
          ? undefined
          : await renderPreviewDocument(resolution.page, css.href, formSubmitScript.href, nonce);
        writeHead(res, 200, nonce, {
          'Content-Type': 'text/html; charset=utf-8',
          ...PREVIEW_RESPONSE_HEADERS,
        });
        res.end(html);
        return;
      }
      case 'not-found': {
        writeHead(res, 404, nonce, {
          'Content-Type': 'text/html; charset=utf-8',
          ...PREVIEW_RESPONSE_HEADERS,
        });
        res.end(isHead ? undefined : await renderErrorDocument(404, 'Pagina non trovata', css.href, nonce));
        return;
      }
      case 'error': {
        writeHead(res, 500, nonce, {
          'Content-Type': 'text/html; charset=utf-8',
          ...PREVIEW_RESPONSE_HEADERS,
        });
        res.end(isHead ? undefined : await renderErrorDocument(500, 'Errore interno', css.href, nonce));
        return;
      }
    }
  } catch (error: unknown) {
    // Un blocco/render inatteso non deve mai far perdere X-Robots-Tag né
    // Cache-Control (ADR-25 § 3-4: nessuna eccezione, mai).
    console.error('public-site: errore non gestito nell\'anteprima', error);
    if (!res.headersSent) {
      writeHead(res, 500, nonce, {
        'Content-Type': 'text/html; charset=utf-8',
        ...PREVIEW_RESPONSE_HEADERS,
      });
      res.end(await renderErrorDocument(500, 'Errore interno', css.href, nonce));
    } else {
      res.end();
    }
  }
}

const server = createServer((req, res) => {
  // Un solo nonce per richiesta, generato qui — prima di ogni ramo, compreso
  // l'ultima istanza sotto — così anche una risposta 500 di errore non
  // gestito porta gli stessi header di sicurezza (CSP `style-src` incluso)
  // di ogni altra risposta, mai un caso speciale scoperto.
  const nonce = createNonce();

  // `async` + `await`: `renderErrorDocument` è asincrona (legge i Global Design
  // Tokens). Senza `await` questo `res.end()` riceveva una `Promise` e Node
  // sollevava `ERR_INVALID_ARG_TYPE` **fuori** da ogni catch, abbattendo il
  // processo — cioè l'esatto contrario di ciò che questo handler di ultima
  // istanza esiste per garantire (ADR-22 § 2: un blocco che solleva dà `500`,
  // mai una pagina mutilata e mai un server morto).
  void handleRequest(req, res, nonce).catch(async (error: unknown) => {
    console.error('public-site: errore non gestito', error);
    if (!res.headersSent) {
      writeHead(res, 500, nonce, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(await renderErrorDocument(500, 'Errore interno', css.href, nonce));
    } else {
      res.end();
    }
  });
});

server.listen(PublicSiteConfig.port, () => {
  // Riga di avvio per l'orchestratore dei container: `public-site` non ha un
  // logger applicativo e `console.log` è vietato in produzione (CLAUDE.md).
  process.stdout.write(`public-site in ascolto sulla porta ${PublicSiteConfig.port}\n`);
});
