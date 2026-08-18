import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PublicSiteConfig } from './config';
import { resolvePublicPage } from './public-api-client';
import { renderErrorDocument, renderPageDocument } from './entry-server';

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

const css = loadCss();

async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8', Allow: 'GET, HEAD' });
    res.end('Method Not Allowed');
    return;
  }

  const url = new URL(req.url ?? '/', 'http://public-site.internal');
  const isHead = req.method === 'HEAD';

  if (url.pathname === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(isHead ? undefined : 'ok');
    return;
  }

  if (url.pathname === css.href) {
    res.writeHead(200, {
      'Content-Type': 'text/css; charset=utf-8',
      'Cache-Control': 'public, max-age=31536000, immutable',
    });
    res.end(isHead ? undefined : css.content);
    return;
  }

  const resolution = await resolvePublicPage(url.pathname);

  switch (resolution.kind) {
    case 'ok': {
      const html = isHead ? undefined : renderPageDocument(resolution.page, css.href);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
    }
    case 'redirect': {
      res.writeHead(308, { Location: resolution.location });
      res.end();
      return;
    }
    case 'not-found': {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(isHead ? undefined : renderErrorDocument(404, 'Pagina non trovata', css.href));
      return;
    }
    case 'error': {
      res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(isHead ? undefined : renderErrorDocument(500, 'Errore interno', css.href));
      return;
    }
  }
}

const server = createServer((req, res) => {
  void handleRequest(req, res).catch((error: unknown) => {
    console.error('public-site: errore non gestito', error);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(renderErrorDocument(500, 'Errore interno', css.href));
    } else {
      res.end();
    }
  });
});

server.listen(PublicSiteConfig.port, () => {
  console.log(`public-site in ascolto sulla porta ${PublicSiteConfig.port}`);
});
