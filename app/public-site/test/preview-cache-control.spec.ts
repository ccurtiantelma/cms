import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { createServer as createHttpServer, type Server as HttpServer } from 'node:http';
import { createServer as createNetServer } from 'node:net';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { components } from '@api-types';
import { DEFAULT_THEME_CONFIG } from '../../frontend/src/theme';

type PagePreviewContentDto = components['schemas']['PagePreviewContentDto'];
type PublicPageDto = components['schemas']['PublicPageDto'];

const currentDir = dirname(fileURLToPath(import.meta.url));
const publicSiteDir = join(currentDir, '..');
const repoRoot = join(publicSiteDir, '../..');
const distServerPath = join(publicSiteDir, 'dist', 'server.js');

/**
 * L'HTML di una bozza non deve essere trattenuto da nessuna cache — né del
 * browser né di un proxy intermedio: ADR-25 § 3 («nessuna cache: ogni lettura
 * è fresca») non è soddisfatta dalla sola assenza di cache Redis lato server.
 * Questo spec verifica che `PREVIEW_RESPONSE_HEADERS` (`Cache-Control:
 * no-store, private` + `X-Robots-Tag`, ADR-25 § 4) sia presente su **ogni**
 * ramo di `handlePreviewRequest`, e — non-regressione, è il punto del task —
 * che quel `no-store` non sia colato sulla superficie pubblicata, dove il
 * contenuto resta cacheabile (ADR-53 § 2) e il CSS con fingerprint continua a
 * portare `immutable`.
 *
 * Server reale (`dist/server.js` via `spawn`), stesso impianto di
 * `security-headers.spec.ts`: gli header dipendono da side-effect a livello di
 * modulo (`loadCss`, `server.listen`), non sono osservabili importando
 * `server.ts` direttamente.
 *
 * Limite noto: il `catch` di ultima istanza di `handlePreviewRequest` non è
 * provocabile dall'esterno senza modificare codice applicativo (servirebbe un
 * hook di test nel sorgente, vietato). Resta coperto **per costruzione** e non
 * per test: spreada lo stesso oggetto costante `PREVIEW_RESPONSE_HEADERS` dei
 * quattro rami qui verificati, sull'unico `writeHead` del file.
 */

/** `server.ts` ha side-effect a livello di modulo: build reale, come negli altri spec HTTP. */
function ensureBuild(): void {
  if (existsSync(distServerPath)) {
    return;
  }
  execFileSync('npm', ['run', 'build', '--workspace=app/public-site'], {
    cwd: repoRoot,
    stdio: 'inherit',
  });
}

/** Porta libera assegnata dal SO (`listen(0)`), per non collidere con altri processi. */
async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createNetServer();
    probe.unref();
    probe.on('error', reject);
    probe.listen(0, () => {
      const address = probe.address();
      if (address && typeof address === 'object') {
        const { port } = address;
        probe.close(() => resolve(port));
      } else {
        probe.close(() => reject(new Error('Impossibile assegnare una porta libera')));
      }
    });
  });
}

const PREVIEW_PREFIX = '/__preview/';
const VALID_TOKEN = 'token-anteprima-valido';
const NOT_FOUND_TOKEN = 'token-scaduto-o-inesistente';
const ERROR_TOKEN = 'token-che-fa-esplodere-il-backend';
const PUBLISHED_PATH = '/pagina-pubblicata';

const PREVIEW_PAGE_PAYLOAD: PagePreviewContentDto = {
  title: 'Chi siamo (bozza)',
  slug: 'chi-siamo',
  locale: 'it-IT',
  content: {
    version: 1,
    blocks: [
      { id: 'b1', type: 'heading', v: 1, props: { level: 'h1', text: 'Bozza in anteprima' }, children: [] },
    ],
  },
  seo: {},
};

const PUBLISHED_PAGE_PAYLOAD: PublicPageDto = {
  title: 'Pagina pubblicata',
  slug: 'pagina-pubblicata',
  locale: 'it-IT',
  content: {
    version: 1,
    blocks: [{ id: 'b1', type: 'heading', v: 1, props: { level: 'h1', text: 'Contenuto' }, children: [] }],
  },
  seo: {},
  translations: [],
};

/**
 * Stub minimale del backend (mock obbligatorio per servizi esterni, CLAUDE.md
 * § Testing): serve i tre esiti del contratto di `resolvePreviewPage` —
 * `200` + DTO, `404` (`kind:'not-found'`), `500` (`kind:'error'`) — più la
 * Pagina pubblicata per la non-regressione. Tema e Sezioni Globali rispondono
 * `200` perché senza di essi il render dell'anteprima degrada.
 */
function startMockApi(): Promise<{ server: HttpServer; port: number }> {
  return new Promise((resolve, reject) => {
    const server = createHttpServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://mock-backend.internal');

      if (url.pathname === `/api/v1/preview/pages/${VALID_TOKEN}`) {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(PREVIEW_PAGE_PAYLOAD));
        return;
      }

      if (url.pathname === `/api/v1/preview/pages/${ERROR_TOKEN}`) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ statusCode: 500, message: 'Errore interno' }));
        return;
      }

      if (url.pathname === '/api/v1/public/pages' && url.searchParams.get('path') === PUBLISHED_PATH) {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(PUBLISHED_PAGE_PAYLOAD));
        return;
      }

      if (url.pathname === '/api/v1/public/settings/theme') {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(DEFAULT_THEME_CONFIG));
        return;
      }

      if (url.pathname === '/api/v1/public/global-sections/active') {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ header: null, footer: null }));
        return;
      }

      // Comprende `/api/v1/preview/pages/<NOT_FOUND_TOKEN>`: token invalido,
      // scaduto o Pagina inesistente danno `404` uniforme (ADR-25 § 3).
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('not found');
    });
    server.on('error', reject);
    server.listen(0, () => {
      const address = server.address();
      if (address && typeof address === 'object') {
        resolve({ server, port: address.port });
      } else {
        reject(new Error('Mock API: impossibile leggere la porta assegnata'));
      }
    });
  });
}

/** Polling su `/healthz` finché il processo figlio non risponde, o timeout. */
async function waitForReady(baseUrl: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${baseUrl}/healthz`);
      if (res.status === 200) {
        return;
      }
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`public-site non pronto entro ${timeoutMs}ms: ${String(lastError)}`);
}

/** Asserzioni comuni a ogni risposta dell'anteprima, qualunque sia lo status. */
function expectPreviewNoStoreHeaders(response: Response): void {
  expect(response.headers.get('cache-control')).toBe('no-store, private');
  expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow, noarchive');
}

describe('anteprima bozza: nessuna cache e nessuna indicizzazione su ogni ramo (ADR-25 § 3-4)', () => {
  let mockApi: HttpServer;
  let siteProcess: ChildProcess;
  let siteBaseUrl: string;

  beforeAll(async () => {
    ensureBuild();

    const { server, port: mockApiPort } = await startMockApi();
    mockApi = server;

    const sitePort = await freePort();
    siteBaseUrl = `http://127.0.0.1:${sitePort}`;

    siteProcess = spawn(process.execPath, [distServerPath], {
      cwd: publicSiteDir,
      env: {
        ...process.env,
        PORT: String(sitePort),
        PUBLIC_API_BASE_URL: `http://127.0.0.1:${mockApiPort}`,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    await waitForReady(siteBaseUrl, 15_000);
  }, 60_000);

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      if (!siteProcess || siteProcess.exitCode !== null) {
        resolve();
        return;
      }
      siteProcess.once('exit', () => resolve());
      siteProcess.kill('SIGTERM');
    });
    await new Promise<void>((resolve, reject) => {
      if (!mockApi) {
        resolve();
        return;
      }
      mockApi.close((error) => (error ? reject(error) : resolve()));
    });
  });

  it(
    '200: la bozza si renderizza ma la risposta non è memorizzabile né indicizzabile',
    async () => {
      const response = await fetch(`${siteBaseUrl}${PREVIEW_PREFIX}${VALID_TOKEN}`);
      const body = await response.text();

      expect(response.status).toBe(200);
      expectPreviewNoStoreHeaders(response);
      expect(body).toContain('Bozza in anteprima');
    },
    15_000,
  );

  it(
    '404 token vuoto: il prefisso senza token non è una scorciatoia per perdere gli header',
    async () => {
      const response = await fetch(`${siteBaseUrl}${PREVIEW_PREFIX}`);

      expect(response.status).toBe(404);
      expectPreviewNoStoreHeaders(response);
    },
    15_000,
  );

  it(
    '404 token non risolto: nemmeno la pagina di errore va trattenuta da una cache',
    async () => {
      const response = await fetch(`${siteBaseUrl}${PREVIEW_PREFIX}${NOT_FOUND_TOKEN}`);

      expect(response.status).toBe(404);
      expectPreviewNoStoreHeaders(response);
    },
    15_000,
  );

  it(
    '500 backend in errore: header presenti anche quando il backend fallisce',
    async () => {
      const response = await fetch(`${siteBaseUrl}${PREVIEW_PREFIX}${ERROR_TOKEN}`);

      expect(response.status).toBe(500);
      expectPreviewNoStoreHeaders(response);
    },
    15_000,
  );

  it(
    'HEAD: header presenti anche senza corpo, dove una cache deciderebbe solo sugli header',
    async () => {
      const response = await fetch(`${siteBaseUrl}${PREVIEW_PREFIX}${VALID_TOKEN}`, { method: 'HEAD' });
      const body = await response.text();

      expect(response.status).toBe(200);
      expectPreviewNoStoreHeaders(response);
      expect(body).toBe('');
    },
    15_000,
  );

  it(
    'non-regressione: una Pagina pubblicata resta cacheabile, il no-store non cola sulla superficie pubblica',
    async () => {
      const response = await fetch(`${siteBaseUrl}${PUBLISHED_PATH}`);
      await response.text();

      expect(response.status).toBe(200);
      // ADR-53 § 2: il contenuto pubblicato è cacheabile. Il server non impone
      // una direttiva propria — l'unico requisito verificabile è che non arrivi
      // il `no-store` dell'anteprima.
      expect(response.headers.get('cache-control') ?? '').not.toContain('no-store');
      expect(response.headers.get('x-robots-tag')).toBeNull();
    },
    15_000,
  );

  it(
    'non-regressione: il CSS con fingerprint continua a portare `public, max-age=31536000, immutable`',
    async () => {
      const pageResponse = await fetch(`${siteBaseUrl}${PUBLISHED_PATH}`);
      const html = await pageResponse.text();

      // Il nome del file è hashato dalla build: si ricava dall'HTML servito,
      // mai cablato, altrimenti il test si rompe al primo cambio di contenuto.
      const cssHref = html.match(/<link[^>]+href="(\/assets\/[^"]+\.css)"/)?.[1];
      expect(cssHref).toBeTruthy();

      const cssResponse = await fetch(`${siteBaseUrl}${cssHref ?? ''}`);
      await cssResponse.text();

      expect(cssResponse.status).toBe(200);
      expect(cssResponse.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    },
    15_000,
  );
});
