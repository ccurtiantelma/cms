import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { createServer as createHttpServer, type Server as HttpServer } from 'node:http';
import { createServer as createNetServer } from 'node:net';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const publicSiteDir = join(currentDir, '..');
const repoRoot = join(publicSiteDir, '../..');
const distServerPath = join(publicSiteDir, 'dist', 'server.js');

/**
 * `server.ts` ha side-effect a livello di modulo (`loadCss()` legge
 * `dist/assets/*.css`, `server.listen(...)` parte subito): non è importabile
 * direttamente nei test, va eseguito come processo reale (ADR-22 § 5, T6).
 * Nel job CI `public-site` lo step "Unit test" gira PRIMA dello step "Build"
 * (`.github/workflows/ci.yml`), quindi `dist/` potrebbe non esistere ancora:
 * si builda qui se manca, non si assume una build già fatta.
 */
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

/**
 * Pagina il cui albero contiene un blocco `section` privo di `children`.
 * Non è un albero che il backend potrebbe mai persistere (ADR-21 § 3.7 lo
 * respinge a monte con `400`): serve a simulare, in modo controllato, la
 * condizione che ADR-22 § 2 dichiara "un bug" — un componente-blocco che
 * solleva durante `renderToStaticMarkup` — perché `PageView.tsx` fida sui
 * dati del backend e non revalida la forma di ogni nodo (nessuna guardia
 * `Array.isArray(node.children)` prima di `node.children.map(...)` in
 * `BlockRenderer.tsx`, la riga che qui deve sollevare `TypeError`).
 */
const BROKEN_PAGE_PAYLOAD = {
  title: 'Pagina con blocco corrotto',
  slug: 'pagina-con-blocco-corrotto',
  locale: 'it-IT',
  content: {
    version: 1,
    blocks: [{ id: 'b1', type: 'section', v: 1, props: {} }],
  },
};

/**
 * Stub minimale di `GET api/v1/public/pages?path=` (ADR-24 § 4): risponde
 * sempre `200` con `BROKEN_PAGE_PAYLOAD`, qualunque `path`. Sostituisce
 * l'API backend reale (mock obbligatorio per servizi esterni, CLAUDE.md §
 * Testing Policy) — questo test verifica solo il comportamento del server
 * SSR quando la risposta a monte, per qualunque motivo, contiene un albero
 * non renderizzabile.
 */
function startMockApi(): Promise<{ server: HttpServer; port: number }> {
  return new Promise((resolve, reject) => {
    const server = createHttpServer((req, res) => {
      if (req.url?.startsWith('/api/v1/public/pages')) {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(BROKEN_PAGE_PAYLOAD));
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

describe('SSR: blocco che solleva durante il rendering (ADR-22 § 2, PLAN-F03 T6)', () => {
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
    'risponde 500 e mai una pagina HTML parziale quando un blocco solleva in rendering',
    async () => {
      const response = await fetch(`${siteBaseUrl}/pagina-con-blocco-corrotto`);
      const body = await response.text();

      // Invariante ADR-22 § 2: un'eccezione durante `renderToStaticMarkup`
      // (nessun Error Boundary gira in SSR) deve dare `500`, mai la pagina
      // mutilata che si otterrebbe se gli header `200` fossero già stati
      // scritti prima che il rendering fallisse.
      expect(response.status).toBe(500);

      // Un documento parziale sarebbe un `<html>` aperto e mai chiuso (gli
      // header 200 sono scritti, poi il corpo si tronca a metà markup) o,
      // nel caso limite, un corpo vuoto con status 200: nessuna delle due
      // forme è un "500 pulito".
      expect(body).not.toBe('');
      expect(body).toMatch(/<html[\s\S]*<\/html>/i);
      expect(body).not.toContain('<section');
    },
    15_000,
  );
});
