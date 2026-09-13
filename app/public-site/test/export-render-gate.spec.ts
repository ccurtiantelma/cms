import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { createServer as createHttpServer, type Server as HttpServer } from 'node:http';
import { createServer as createNetServer } from 'node:net';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { components } from '@api-types';
import { DEFAULT_THEME_CONFIG } from '../../frontend/src/theme';

type PagePreviewContentDto = components['schemas']['PagePreviewContentDto'];
type PublicPageDto = components['schemas']['PublicPageDto'];

const currentDir = dirname(fileURLToPath(import.meta.url));
const publicSiteDir = join(currentDir, '..');
const repoRoot = join(publicSiteDir, '../..');
const distServerPath = join(publicSiteDir, 'dist', 'server.js');

/**
 * ADR-67 (conformità di ADR-53 § 5): con `EXPORT_RENDER_SECRET` configurato,
 * `public-site` rende una Pagina pubblicata solo al worker di export che
 * presenta `X-Export-Render-Token`. Il traffico anonimo riceve `404` senza che
 * il backend venga interrogato; l'anteprima con token e gli asset restano
 * raggiungibili.
 *
 * Server reale (`dist/server.js` via `spawn`), stesso impianto di
 * `preview-cache-control.spec.ts`.
 */

const SECRET = 'segreto-di-export-per-il-test';
const PUBLISHED_PATH = '/pagina-pubblicata';
const PREVIEW_TOKEN = 'token-anteprima-valido';

const PUBLISHED_PAGE: PublicPageDto = {
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

const PREVIEW_PAGE: PagePreviewContentDto = {
  title: 'Bozza',
  slug: 'bozza',
  locale: 'it-IT',
  content: {
    version: 1,
    blocks: [{ id: 'b1', type: 'heading', v: 1, props: { level: 'h1', text: 'Bozza in anteprima' }, children: [] }],
  },
  seo: {},
};

/** Letture di `public/pages` ricevute dal backend finto. */
const pageLookups: (string | null)[] = [];

function ensureBuild(): void {
  if (existsSync(distServerPath)) {
    return;
  }
  execFileSync('npm', ['run', 'build', '--workspace=app/public-site'], { cwd: repoRoot, stdio: 'inherit' });
}

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

function startMockApi(): Promise<{ server: HttpServer; port: number }> {
  return new Promise((resolve, reject) => {
    const server = createHttpServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://mock-backend.internal');
      const json = (body: unknown): void => {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(body));
      };

      if (url.pathname === '/api/v1/public/pages') {
        pageLookups.push(url.searchParams.get('path'));
        if (url.searchParams.get('path') === PUBLISHED_PATH) {
          json(PUBLISHED_PAGE);
          return;
        }
      }
      if (url.pathname === `/api/v1/preview/pages/${PREVIEW_TOKEN}`) {
        json(PREVIEW_PAGE);
        return;
      }
      if (url.pathname === '/api/v1/public/settings/theme') {
        json(DEFAULT_THEME_CONFIG);
        return;
      }
      if (url.pathname === '/api/v1/public/global-sections/active') {
        json({ header: null, footer: null });
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

async function waitForReady(baseUrl: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${baseUrl}/healthz`);
      if (res.status === 200) return;
    } catch {
      // processo non ancora in ascolto
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`public-site non pronto entro ${timeoutMs}ms`);
}

describe('render di Pagine riservato al worker di export (ADR-67, ADR-53 § 5)', () => {
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
        EXPORT_RENDER_SECRET: SECRET,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    await waitForReady(siteBaseUrl, 15_000);
  }, 60_000);

  beforeEach(() => {
    pageLookups.length = 0;
  });

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

  it('visitatore anonimo: 404 su una Pagina pubblicata, senza interrogare il backend', async () => {
    const response = await fetch(`${siteBaseUrl}${PUBLISHED_PATH}`);
    await response.text();

    expect(response.status).toBe(404);
    expect(pageLookups).toEqual([]);
  });

  it('token sbagliato: stesso 404, nessuna informazione in più', async () => {
    const response = await fetch(`${siteBaseUrl}${PUBLISHED_PATH}`, {
      headers: { 'X-Export-Render-Token': 'segreto-sbagliato' },
    });
    await response.text();

    expect(response.status).toBe(404);
    expect(pageLookups).toEqual([]);
  });

  it('worker di export: 200, la Pagina viene risolta sul backend', async () => {
    const response = await fetch(`${siteBaseUrl}${PUBLISHED_PATH}`, {
      headers: { 'X-Export-Render-Token': SECRET },
    });
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain('Contenuto');
    expect(pageLookups).toEqual([PUBLISHED_PATH]);
  });

  it("l'anteprima con token resta raggiungibile senza segreto di export", async () => {
    const response = await fetch(`${siteBaseUrl}/__preview/${PREVIEW_TOKEN}`);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain('Bozza in anteprima');
  });

  it('il CSS con fingerprint resta servito, serve anche ai documenti di anteprima', async () => {
    const page = await fetch(`${siteBaseUrl}${PUBLISHED_PATH}`, {
      headers: { 'X-Export-Render-Token': SECRET },
    });
    const cssHref = (await page.text()).match(/<link[^>]+href="(\/assets\/[^"]+\.css)"/)?.[1];
    expect(cssHref).toBeTruthy();

    const css = await fetch(`${siteBaseUrl}${cssHref ?? ''}`);
    await css.text();
    expect(css.status).toBe(200);
  });
});
