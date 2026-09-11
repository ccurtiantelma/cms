// Carica le variabili d'ambiente dal file .env prima di tutto il resto
import dotenv from 'dotenv';
dotenv.config();

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PublicSiteConfig } from './config';
import { ingestPageview, resolvePublicPage } from './public-api-client';
import { resolvePreviewPage } from './preview-api-client';
import { renderErrorDocument, renderPageDocument, renderPreviewDocument } from './entry-server';
import { createNonce, securityHeaders } from './security-headers';

/**
 * Header imposto su **ogni** risposta della rotta di anteprima, successo o
 * `404` che sia — senza eccezioni configurabili (ADR-25 § 4).
 */
const PREVIEW_ROBOTS_HEADER = 'noindex, nofollow, noarchive';

/**
 * Scrive gli header di sicurezza (`securityHeaders`, mai omessi — successo,
 * `404`, `405`, `308`, `500`, stesso principio di `PREVIEW_ROBOTS_HEADER` qui
 * esteso a ogni risposta) più quelli specifici della singola rotta, in
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

  const resolution = await resolvePublicPage(url.pathname);

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
      if (!isHead) ingestPageview(url.pathname);
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
 * Ogni risposta — successo o `404` — porta sempre `X-Robots-Tag`, senza
 * eccezioni: l'anteprima non è indicizzabile per costruzione, non per
 * convenzione.
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
        'X-Robots-Tag': PREVIEW_ROBOTS_HEADER,
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
          'X-Robots-Tag': PREVIEW_ROBOTS_HEADER,
        });
        res.end(html);
        return;
      }
      case 'not-found': {
        writeHead(res, 404, nonce, {
          'Content-Type': 'text/html; charset=utf-8',
          'X-Robots-Tag': PREVIEW_ROBOTS_HEADER,
        });
        res.end(isHead ? undefined : await renderErrorDocument(404, 'Pagina non trovata', css.href, nonce));
        return;
      }
      case 'error': {
        writeHead(res, 500, nonce, {
          'Content-Type': 'text/html; charset=utf-8',
          'X-Robots-Tag': PREVIEW_ROBOTS_HEADER,
        });
        res.end(isHead ? undefined : await renderErrorDocument(500, 'Errore interno', css.href, nonce));
        return;
      }
    }
  } catch (error: unknown) {
    // Un blocco/render inatteso non deve mai far perdere l'header
    // X-Robots-Tag (ADR-25 § 4: nessuna eccezione, mai).
    console.error('public-site: errore non gestito nell\'anteprima', error);
    if (!res.headersSent) {
      writeHead(res, 500, nonce, {
        'Content-Type': 'text/html; charset=utf-8',
        'X-Robots-Tag': PREVIEW_ROBOTS_HEADER,
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
  console.log(`public-site in ascolto sulla porta ${PublicSiteConfig.port}`);
});
