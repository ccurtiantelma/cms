import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { createServer as createHttpServer, type Server as HttpServer } from 'node:http';
import { createServer as createNetServer } from 'node:net';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { components } from '@api-types';
import { DEFAULT_THEME_CONFIG } from '../../frontend/src/theme';

type PublicPageDto = components['schemas']['PublicPageDto'];

const currentDir = dirname(fileURLToPath(import.meta.url));
const publicSiteDir = join(currentDir, '..');
const repoRoot = join(publicSiteDir, '../..');
const distServerPath = join(publicSiteDir, 'dist', 'server.js');

/**
 * Copertura degli header di sicurezza centralizzati in `security-headers.ts`
 * (`securityHeaders`/`createNonce`): server reale (`dist/server.js`), stesso
 * approccio di `nested-slug.spec.ts`/`ssr-error.spec.ts` — questi header
 * dipendono da side-effect a livello di modulo (`loadCss`, `server.listen`),
 * non sono osservabili importando `server.ts` direttamente.
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

const EXISTING_PATH = '/pagina-esistente';
const REDIRECT_FROM_PATH = '/percorso-non-canonico';
const REDIRECT_TO_PATH = '/percorso-canonico';
const MISSING_PATH = '/pagina-che-non-esiste';

const EXISTING_PAGE_PAYLOAD: PublicPageDto = {
  title: 'Pagina esistente',
  slug: 'pagina-esistente',
  locale: 'it-IT',
  content: {
    version: 1,
    blocks: [{ id: 'b1', type: 'heading', v: 1, props: { level: 'h1', text: 'Contenuto' }, children: [] }],
  },
};

/**
 * Stub minimale del backend: `200` sul percorso esistente, `308` con
 * `Location` verso il percorso canonico sul percorso non canonico (stesso
 * contratto di `resolvePublicPage`, ADR-24 § 4), `404` su ogni altro
 * percorso — sostituisce l'API backend reale (mock obbligatorio per servizi
 * esterni, CLAUDE.md § Testing).
 */
function startMockApi(): Promise<{ server: HttpServer; port: number }> {
  return new Promise((resolve, reject) => {
    const server = createHttpServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://mock-backend.internal');

      if (url.pathname === '/api/v1/public/pages' && url.searchParams.get('path') === EXISTING_PATH) {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(EXISTING_PAGE_PAYLOAD));
        return;
      }

      if (url.pathname === '/api/v1/public/pages' && url.searchParams.get('path') === REDIRECT_FROM_PATH) {
        res.writeHead(308, {
          Location: `/api/v1/public/pages?path=${encodeURIComponent(REDIRECT_TO_PATH)}`,
        });
        res.end();
        return;
      }

      // Tema valido: senza questo `fetchThemeConfig` fallisce (mock risponde
      // 404 a ogni altra rotta) e `ThemeStyleTag` non emette alcun <style> —
      // qui serve invece per verificare che porti il nonce.
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

/** Asserzioni comuni a ogni risposta, indipendentemente da status/rotta. */
function expectBaselineSecurityHeaders(response: Response): void {
  expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  expect(response.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
  expect(response.headers.get('x-frame-options')).toBe('DENY');

  const csp = response.headers.get('content-security-policy');
  expect(csp).toBeTruthy();
  expect(csp).toContain("default-src 'none'");
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).toContain("script-src 'self'");
  expect(csp).toMatch(/style-src 'self' 'nonce-[^']+'/);
}

describe('header di sicurezza su ogni risposta (X-Content-Type-Options, Referrer-Policy, clickjacking, CSP)', () => {
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
    'successo (200): header presenti e il nonce della CSP combacia con quello nei <style> del documento',
    async () => {
      const response = await fetch(`${siteBaseUrl}${EXISTING_PATH}`);
      const body = await response.text();

      expect(response.status).toBe(200);
      expectBaselineSecurityHeaders(response);

      const csp = response.headers.get('content-security-policy') ?? '';
      const [, nonce] = csp.match(/style-src 'self' 'nonce-([^']+)'/) ?? [];
      expect(nonce).toBeTruthy();

      // Ogni <style> inline (CSS critico + tema, ADR-22 § 7) deve portare lo
      // stesso nonce dell'header, altrimenti il browser lo scarterebbe.
      expect(body).toContain(`<style data-critical-css="true" nonce="${nonce}"`);
      expect(body).toContain(`<style id="eaidos-theme-vars" nonce="${nonce}"`);
    },
    15_000,
  );

  it(
    '404: header presenti anche quando la Pagina non esiste',
    async () => {
      const response = await fetch(`${siteBaseUrl}${MISSING_PATH}`);

      expect(response.status).toBe(404);
      expectBaselineSecurityHeaders(response);
    },
    15_000,
  );

  it(
    '308: header presenti sul redirect di canonicalizzazione, prima ancora di un corpo HTML',
    async () => {
      const response = await fetch(`${siteBaseUrl}${REDIRECT_FROM_PATH}`, { redirect: 'manual' });

      expect(response.status).toBe(308);
      expect(response.headers.get('location')).toBe(REDIRECT_TO_PATH);
      expectBaselineSecurityHeaders(response);
    },
    15_000,
  );

  it(
    '405: header presenti anche sul metodo non consentito',
    async () => {
      const response = await fetch(`${siteBaseUrl}${EXISTING_PATH}`, { method: 'POST' });

      expect(response.status).toBe(405);
      expect(response.headers.get('allow')).toBe('GET, HEAD');
      expectBaselineSecurityHeaders(response);
    },
    15_000,
  );

  it(
    'un nonce diverso a ogni richiesta: due risposte distinte non condividono lo stesso valore',
    async () => {
      const [first, second] = await Promise.all([
        fetch(`${siteBaseUrl}${EXISTING_PATH}`),
        fetch(`${siteBaseUrl}${EXISTING_PATH}`),
      ]);

      const nonceOf = (response: Response) => {
        const csp = response.headers.get('content-security-policy') ?? '';
        return csp.match(/style-src 'self' 'nonce-([^']+)'/)?.[1];
      };

      const firstNonce = nonceOf(first);
      const secondNonce = nonceOf(second);
      expect(firstNonce).toBeTruthy();
      expect(secondNonce).toBeTruthy();
      expect(firstNonce).not.toBe(secondNonce);
    },
    15_000,
  );
});
