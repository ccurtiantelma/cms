import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { createServer as createHttpServer, type Server as HttpServer } from 'node:http';
import { createServer as createNetServer } from 'node:net';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { components } from '@api-types';

type PublicPageDto = components['schemas']['PublicPageDto'];
type PagePreviewContentDto = components['schemas']['PagePreviewContentDto'];

const currentDir = dirname(fileURLToPath(import.meta.url));
const publicSiteDir = join(currentDir, '..');
const repoRoot = join(publicSiteDir, '../..');
const distServerPath = join(publicSiteDir, 'dist', 'server.js');

/**
 * Test di copertura preventivo per il routing nidificato (F03/ADR-24): nessun bug
 * riscontrato con revisione statica di `server.ts`/`public-pages.service.ts` (il
 * pathname completo viene passato a `resolvePublicPage` e risolto per segmenti dal
 * backend), ma nessun test esistente esercitava un percorso a più segmenti né la rotta
 * di anteprima con un token — stesso approccio di `ssr-error.spec.ts`: processo reale
 * (`dist/server.js`), mock HTTP del backend, `waitForReady` su `/healthz`.
 */

/** `server.ts` ha side-effect a livello di modulo: build reale come in `ssr-error.spec.ts`. */
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

/** Pagina valida a percorso nidificato (`/pagina-genitore/home-page`, ADR-24 § 4). */
const NESTED_PAGE_PAYLOAD: PublicPageDto = {
  title: 'Home Page annidata',
  slug: 'home-page',
  locale: 'it-IT',
  content: {
    version: 1,
    blocks: [
      {
        id: 'b1',
        type: 'heading',
        v: 1,
        props: { level: 'h1', text: 'Contenuto della pagina annidata' },
        children: [],
      },
    ],
  },
};

/** Bozza valida servita dalla rotta di anteprima per un token fittizio. */
const PREVIEW_PAGE_PAYLOAD: PagePreviewContentDto = {
  title: 'Bozza in anteprima',
  slug: 'bozza-in-anteprima',
  locale: 'it-IT',
  content: {
    version: 1,
    blocks: [
      {
        id: 'b1',
        type: 'heading',
        v: 1,
        props: { level: 'h1', text: 'Contenuto della bozza in anteprima' },
        children: [],
      },
    ],
  },
};

/** Pagina valida a percorso annidato a tre livelli (`/categoria/sottocategoria/slug-pagina`). */
const DEEPLY_NESTED_PAGE_PAYLOAD: PublicPageDto = {
  title: 'Pagina a tre livelli',
  slug: 'slug-pagina',
  locale: 'it-IT',
  content: {
    version: 1,
    blocks: [
      {
        id: 'b1',
        type: 'heading',
        v: 1,
        props: { level: 'h1', text: 'Contenuto della pagina a tre livelli' },
        children: [],
      },
    ],
  },
};

const NESTED_PATH = '/pagina-genitore/home-page';
const DEEPLY_NESTED_PATH = '/categoria/sottocategoria/slug-pagina';
const PREVIEW_TOKEN = 'token-fittizio-di-test';

/**
 * Stub minimale del backend: risponde `200` su
 * `GET /api/v1/public/pages?path=%2Fpagina-genitore%2Fhome-page` con
 * {@link NESTED_PAGE_PAYLOAD} e su `GET /api/v1/preview/pages/:token` (per
 * {@link PREVIEW_TOKEN}) con {@link PREVIEW_PAGE_PAYLOAD} — sostituisce l'API backend
 * reale (mock obbligatorio per servizi esterni, CLAUDE.md § Testing).
 */
function startMockApi(): Promise<{ server: HttpServer; port: number }> {
  return new Promise((resolve, reject) => {
    const server = createHttpServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://mock-backend.internal');

      if (url.pathname === '/api/v1/public/pages' && url.searchParams.get('path') === NESTED_PATH) {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(NESTED_PAGE_PAYLOAD));
        return;
      }

      if (
        url.pathname === '/api/v1/public/pages' &&
        url.searchParams.get('path') === DEEPLY_NESTED_PATH
      ) {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(DEEPLY_NESTED_PAGE_PAYLOAD));
        return;
      }

      if (url.pathname === `/api/v1/preview/pages/${PREVIEW_TOKEN}`) {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(PREVIEW_PAGE_PAYLOAD));
        return;
      }

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

describe('SSR: percorsi nidificati e anteprima per token (ADR-24, ADR-25 — copertura preventiva)', () => {
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
    'risolve un percorso a più segmenti (genitore/figlio) con 200 e il contenuto atteso',
    async () => {
      const response = await fetch(`${siteBaseUrl}${NESTED_PATH}`);
      const body = await response.text();

      expect(response.status).toBe(200);
      expect(body).toContain('Contenuto della pagina annidata');
      expect(body).not.toBe('');
    },
    15_000,
  );

  it(
    'risolve un percorso a tre segmenti (categoria/sottocategoria/slug-pagina) con 200 e il contenuto atteso',
    async () => {
      const response = await fetch(`${siteBaseUrl}${DEEPLY_NESTED_PATH}`);
      const body = await response.text();

      expect(response.status).toBe(200);
      expect(body).toContain('Contenuto della pagina a tre livelli');
      expect(body).not.toBe('');
    },
    15_000,
  );

  it(
    'risolve la rotta di anteprima per token con 200, il contenuto atteso e X-Robots-Tag',
    async () => {
      const response = await fetch(`${siteBaseUrl}/__preview/${PREVIEW_TOKEN}`);
      const body = await response.text();

      expect(response.status).toBe(200);
      expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow, noarchive');
      expect(body).toContain('Contenuto della bozza in anteprima');
    },
    15_000,
  );
});
