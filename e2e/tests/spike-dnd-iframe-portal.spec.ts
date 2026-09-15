import { test, expect } from '@playwright/test';

/**
 * Verifica supplementare richiesta da `docs/ai/plans/PLAN-F04-dnd-iframe-portal-spike.md`
 * § "Risultato" punto 2 / § "Prossimo passo raccomandato" punto 1: la spike T2 (Portale React,
 * Opzione A di `RFC-F04e-bis-esito-spike-iframe.md`) aveva lasciato inconcludente la chiusura
 * del ciclo drag (`onDragEnd`) perché gli strumenti MCP Puppeteer di quella sessione non
 * esponevano un primitivo di mouse reale — solo `dispatchEvent` sintetico (`isTrusted: false`).
 *
 * Questo test punta sullo stesso PoC isolato (`/dev/dnd-iframe-portal-spike`,
 * `app/frontend/src/spikes/dnd-iframe-portal/`, non linkato dalla navigazione di produzione,
 * nessun guard di autenticazione) usando `page.mouse.move/down/up` di Playwright — eventi reali
 * a livello CDP, non sintetici — per chiudere in modo conclusivo il punto lasciato aperto dal
 * piano, prima di qualunque nuova ADR di superamento di ADR-70.
 *
 * Non è il test E2E "di produzione": i componenti reali del Canvas incapsulato non esistono
 * ancora (nessuna ADR li autorizza). Non usa `ADMIN_STORAGE_STATE`/baseURL della suite admin
 * per lo stesso motivo — naviga direttamente sulla rotta dev-only del PoC.
 */

const SPIKE_BASE_URL = process.env.E2E_SPIKE_BASE_URL || 'http://localhost:55173';

interface SpikeDndEvent {
  ts: number;
  phase: string;
  active?: string;
  over?: string | null;
}

declare global {
  interface Window {
    __SPIKE_PORTAL_DND_EVENTS__?: SpikeDndEvent[];
    __SPIKE_PORTAL_OWNERDOC_OK__?: boolean;
  }
}

async function gotoSpikeAndWaitPortalReady(page: import('@playwright/test').Page): Promise<void> {
  await page.goto(`${SPIKE_BASE_URL}/dev/dnd-iframe-portal-spike`);
  await expect
    .poll(() => page.evaluate(() => window.__SPIKE_PORTAL_OWNERDOC_OK__), { timeout: 10_000 })
    .toBe(true);
}

test.describe('Spike T2 (createPortal) — chiusura punto 2 del piano con mouse reale', () => {
  test('scenario (b): riordino interno al canvas portato nell’iframe emette onDragEnd', async ({
    page,
  }) => {
    await gotoSpikeAndWaitPortalReady(page);

    const frame = page.frameLocator('[data-testid="spike-portal-iframe"]');
    const block = frame.locator('[data-testid="portal-block-portal-block-1"]');
    const box = await block.boundingBox();
    if (!box) throw new Error('bounding box di portal-block-1 non disponibile');

    const startX = box.x + box.width / 2;
    const startY = box.y + box.height / 2;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    // Supera activationConstraint.distance: 5 (identico a PageSpikePortalParent.tsx) con
    // movimenti incrementali, come un vero trascinamento col mouse.
    for (let i = 1; i <= 6; i += 1) {
      await page.mouse.move(startX, startY + i * 6, { steps: 2 });
    }
    await page.mouse.up();

    await expect
      .poll(() => page.evaluate(() => (window.__SPIKE_PORTAL_DND_EVENTS__ ?? []).map((e) => e.phase)), {
        timeout: 5_000,
      })
      .toContain('dragEnd');
  });

  test('scenario (a): drag dalla palette (padre) al canvas nell’iframe emette onDragEnd', async ({
    page,
  }) => {
    await gotoSpikeAndWaitPortalReady(page);

    const tile = page.getByTestId('palette-tile');
    const tileBox = await tile.boundingBox();
    if (!tileBox) throw new Error('bounding box di palette-tile non disponibile');

    const frame = page.frameLocator('[data-testid="spike-portal-iframe"]');
    const dropZone = frame.getByTestId('iframe-portal-canvas-root');
    const dropBox = await dropZone.boundingBox();
    if (!dropBox) throw new Error('bounding box di iframe-portal-canvas-root non disponibile');

    const startX = tileBox.x + tileBox.width / 2;
    const startY = tileBox.y + tileBox.height / 2;
    // Punto vicino al bordo superiore della drop-zone, fuori dalle sotto drop-zone dei singoli
    // blocchi (label + padding prima del primo `PortalBlock`): evita ambiguità di collisione fra
    // il contenitore e i suoi figli, irrilevante per la domanda posta da questo test (se
    // `onDragEnd` viene emesso attraversando il confine dell'iframe), non quale target riceva
    // `over`.
    const endX = dropBox.x + dropBox.width / 2;
    const endY = dropBox.y + 10;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX, startY - 10, { steps: 2 }); // supera la soglia di attivazione
    await page.mouse.move(endX, endY, { steps: 20 });
    await page.mouse.up();

    await expect
      .poll(() => page.evaluate(() => (window.__SPIKE_PORTAL_DND_EVENTS__ ?? []).map((e) => e.phase)), {
        timeout: 5_000,
      })
      .toContain('dragEnd');

    const events = await page.evaluate(() => window.__SPIKE_PORTAL_DND_EVENTS__ ?? []);
    const dragEnd = events.find((e) => e.phase === 'dragEnd');
    // eslint-disable-next-line no-console
    console.log('scenario (a) dragEnd evento:', JSON.stringify(dragEnd));
    expect(dragEnd).toBeDefined();
  });
});
