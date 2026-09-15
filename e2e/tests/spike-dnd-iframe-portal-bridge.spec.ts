import { test, expect } from '@playwright/test';

/**
 * Verifica del fix di Spike T3 (`app/frontend/src/spikes/dnd-iframe-portal/
 * PageSpikePortalBridgeParent.tsx`, vedi il commento di testa di quel file per la diagnosi
 * completa): lo scenario (a) di `spike-dnd-iframe-portal.spec.ts` (drag dalla palette esterna
 * al canvas portato nell'iframe) risolveva sempre `over: null` perché il rettangolo dei nodi
 * droppable dentro l'iframe viene misurato di default nel sistema di riferimento locale
 * dell'iframe, mentre il puntatore di un drag iniziato nel padre riporta coordinate nel sistema
 * di riferimento della pagina padre — due sistemi di riferimento incompatibili confrontati come
 * fossero lo stesso. Questo test verifica, con `page.mouse` reale, che sostituire
 * `measuring.droppable/draggable.measure` di `DndContext` con una funzione che traduce
 * l'offset dell'iframe risolve il problema, senza reintrodurre la regressione di T1 (nessun
 * secondo root, nessun Sensor custom, nessuna nuova dipendenza).
 *
 * Punta sulla rotta dev-only `/dev/dnd-iframe-portal-bridge-spike`, non linkata dalla
 * navigazione di produzione, nessun guard di autenticazione — stesso perimetro isolato dei PoC
 * precedenti (T1, T2).
 */

const SPIKE_BASE_URL = process.env.E2E_SPIKE_BASE_URL || 'http://localhost:55173';

interface SpikeDndEvent {
  ts: number;
  phase: string;
  active?: string;
  origin?: string;
  over?: string | null;
}

declare global {
  interface Window {
    __SPIKE_BRIDGE_DND_EVENTS__?: SpikeDndEvent[];
    __SPIKE_BRIDGE_OWNERDOC_OK__?: boolean;
  }
}

async function gotoSpikeAndWaitPortalReady(page: import('@playwright/test').Page): Promise<void> {
  await page.goto(`${SPIKE_BASE_URL}/dev/dnd-iframe-portal-bridge-spike`);
  await expect
    .poll(() => page.evaluate(() => window.__SPIKE_BRIDGE_OWNERDOC_OK__), { timeout: 10_000 })
    .toBe(true);
}

test.describe('Spike T3 (measure cross-frame) — scenario (a) palette → iframe risolve un target valido', () => {
  test('drag dalla palette (padre) al canvas nell’iframe: onDragEnd con over=iframe-bridge-canvas-root', async ({
    page,
  }) => {
    await gotoSpikeAndWaitPortalReady(page);

    const tile = page.getByTestId('palette-tile');
    const tileBox = await tile.boundingBox();
    if (!tileBox) throw new Error('bounding box di palette-tile non disponibile');

    const frame = page.frameLocator('[data-testid="spike-bridge-iframe"]');
    const dropZone = frame.getByTestId('iframe-bridge-canvas-root');
    const dropBox = await dropZone.boundingBox();
    if (!dropBox) throw new Error('bounding box di iframe-bridge-canvas-root non disponibile');

    const startX = tileBox.x + tileBox.width / 2;
    const startY = tileBox.y + tileBox.height / 2;
    const endX = dropBox.x + dropBox.width / 2;
    const endY = dropBox.y + 10;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX, startY - 10, { steps: 2 });
    await page.mouse.move(endX, endY, { steps: 20 });

    // La drop-zone deve mostrare `isOver=true` PRIMA del rilascio — non solo un `onDragEnd`
    // che si concluda per caso: verifica che la traduzione di coordinate risolva la collisione
    // durante il trascinamento, non solo al termine.
    await expect(dropZone.locator('p').first()).toContainText('isOver=true', { timeout: 5_000 });

    await page.mouse.up();

    await expect
      .poll(() => page.evaluate(() => (window.__SPIKE_BRIDGE_DND_EVENTS__ ?? []).map((e) => e.phase)), {
        timeout: 5_000,
      })
      .toContain('dragEnd');

    const events = await page.evaluate(() => window.__SPIKE_BRIDGE_DND_EVENTS__ ?? []);
    const dragEnd = events.find((e) => e.phase === 'dragEnd');
    expect(dragEnd?.over).toBe('iframe-bridge-canvas-root');
  });

  test('scenario (b) — riordino interno al canvas nell’iframe resta funzionante (nessuna regressione dal fix di misura)', async ({
    page,
  }) => {
    await gotoSpikeAndWaitPortalReady(page);

    const frame = page.frameLocator('[data-testid="spike-bridge-iframe"]');
    const block = frame.locator('[data-testid="portal-block-portal-block-1"]');
    const box = await block.boundingBox();
    if (!box) throw new Error('bounding box di portal-block-1 non disponibile');

    const startX = box.x + box.width / 2;
    const startY = box.y + box.height / 2;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    for (let i = 1; i <= 6; i += 1) {
      await page.mouse.move(startX, startY + i * 6, { steps: 2 });
    }
    await page.mouse.up();

    await expect
      .poll(() => page.evaluate(() => (window.__SPIKE_BRIDGE_DND_EVENTS__ ?? []).map((e) => e.phase)), {
        timeout: 5_000,
      })
      .toContain('dragEnd');

    const events = await page.evaluate(() => window.__SPIKE_BRIDGE_DND_EVENTS__ ?? []);
    const dragEnd = events.find((e) => e.phase === 'dragEnd');
    // Lo spostamento di 36px porta il blocco 1 a ridosso del confine con il blocco 2 (dropzone
    // impilate a ~41-44px l'una): quale delle due risolva la collisione è un dettaglio di
    // geometria del PoC, non la domanda posta da questo test — qui interessa solo che il
    // riordino interno all'iframe risolva SEMPRE un target di reorder valido (non `null`),
    // nessuna regressione rispetto a T2 dovuta al fix di misura cross-frame.
    expect(dragEnd?.over).toMatch(/^drop:portal-block-[123]$/);
  });
});
