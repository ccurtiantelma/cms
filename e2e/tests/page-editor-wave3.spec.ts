import { test, expect, type FrameLocator, type Page } from "@playwright/test";
import { mkdirSync } from "fs";
import { resolve } from "path";
import { ADMIN_STORAGE_STATE } from "./helpers/admin-session";
import {
  addRootBlock,
  blockOfType,
  canvasFrame,
  createPageFromUi,
  deletePageFromUi,
  openContentTab,
  uniqueSlug,
} from "./helpers/page-editor";

/**
 * E2E Wave 3 (scomposizione di `EditorCanvas.tsx` + cornice tema disaccoppiata): verifica in
 * browser reale, con mouse reale e traiettorie deterministiche (`steps` fissi), che
 * `EditorCanvasThemeFrame` sia solo contesto visivo — presente, ma senza alcun contributo a
 * box model, hit-testing, hover o selezione.
 *
 * Screenshot diagnostici in `e2e/artifacts/wave-3/`.
 */

const TITOLO_PAGINA = "Wave 3 — Cornice tema disaccoppiata";
const SHOTS = resolve(__dirname, "../artifacts/wave-3");
const SECTION_BLUE = "rgb(34, 113, 177)"; // #2271b1
const WIDGET_PURPLE = "rgb(164, 53, 192)"; // #a435c0

test.use({ storageState: ADMIN_STORAGE_STATE });

test.beforeAll(() => {
  mkdirSync(SHOTS, { recursive: true });
});

test.afterEach(async ({ page }) => {
  await deletePageFromUi(page, TITOLO_PAGINA).catch(() => undefined);
});

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Bounding box (coordinate del documento iframe) di ogni nodo reale + altezza scrollabile. */
async function snapshotGeometry(
  page: Page,
): Promise<Record<string, Box | number>> {
  const handle = await page.locator("iframe").first().elementHandle();
  const frame = await handle!.contentFrame();
  return frame!.evaluate(() => {
    const out: Record<
      string,
      { x: number; y: number; width: number; height: number } | number
    > = {};
    document.querySelectorAll("[data-block-id]").forEach((el, i) => {
      const r = el.getBoundingClientRect();
      out[`block-${i}-${el.getAttribute("data-block-id")}`] = {
        x: r.x,
        y: r.y + window.scrollY,
        width: r.width,
        height: r.height,
      };
    });
    out.scrollHeight = document.documentElement.scrollHeight;
    return out;
  });
}

/** Rimuove la cornice dal layout (`display:none`) o la ripristina: serve a misurare il suo contributo. */
async function setThemeFrameDisplay(
  page: Page,
  hidden: boolean,
): Promise<void> {
  const handle = await page.locator("iframe").first().elementHandle();
  const frame = await handle!.contentFrame();
  await frame!.evaluate((hide) => {
    document
      .querySelectorAll<HTMLElement>("[data-theme-frame]")
      .forEach((el) => {
        const anchor = el.parentElement as HTMLElement;
        anchor.style.display = hide ? "none" : "";
      });
  }, hidden);
}

/** `true` se un nodo dell'iframe disegna il colore dato come bordo/outline/box-shadow. */
async function frameDrawsColor(page: Page, color: string): Promise<boolean> {
  const handle = await page.locator("iframe").first().elementHandle();
  const frame = await handle!.contentFrame();
  return frame!.evaluate((needle) => {
    return Array.from(document.querySelectorAll<HTMLElement>("body *")).some(
      (el) => {
        const cs = getComputedStyle(el);
        const pseudo = [
          getComputedStyle(el, "::before"),
          getComputedStyle(el, "::after"),
        ];
        return [cs, ...pseudo].some(
          (s) =>
            s.borderTopColor === needle ||
            s.borderLeftColor === needle ||
            s.outlineColor === needle ||
            s.boxShadow.includes(needle),
        );
      },
    );
  }, color);
}

async function themeFrameGeometry(frame: FrameLocator) {
  const header = frame.getByTestId("theme-frame-header");
  const footer = frame.getByTestId("theme-frame-footer");
  await expect(header).toBeVisible();
  await expect(footer).toBeVisible();
  return { header, footer };
}

test("cornice tema: presente come contesto, senza toccare box model, drop-zone, hover e selezione", async ({
  page,
}) => {
  test.slow();

  await createPageFromUi(page, {
    title: TITOLO_PAGINA,
    slug: uniqueSlug("wave3-e2e"),
  });
  await openContentTab(page);
  const canvas = canvasFrame(page);

  // ─── 1. Canvas vuoto e rendering iniziale ───────────────────────────────────────────────
  await expect(canvas.getByText("Trascina il widget qui")).toBeVisible();
  const { header, footer } = await themeFrameGeometry(canvas);
  await expect(header).toContainText("THEME - HEADER");
  await expect(footer).toContainText("THEME - FOOTER");
  // Decorazione: nessun id di blocco, nessun nodo dell'albero, non annunciata ai lettori di schermo.
  await expect(canvas.locator("[data-theme-frame][data-block-id]")).toHaveCount(
    0,
  );
  // Una pagina nuova parte con i soli blocchi seed dell'albero: la cornice non ne aggiunge.
  const seedBlocks = await canvas.locator("[data-block-id]").count();
  const seedSections = await blockOfType(page, "section").count();
  const seedHeadings = await blockOfType(page, "heading").count();
  await expect(
    canvas.locator('[aria-hidden="true"] [data-theme-frame]'),
  ).toHaveCount(2);
  await page.screenshot({ path: `${SHOTS}/01-canvas-vuoto.png` });

  // ─── 2. Inserimento di una Sezione e di un Widget ───────────────────────────────────────
  const sections = blockOfType(page, "section");
  await addRootBlock(page, "Sezione");
  await expect(sections).toHaveCount(seedSections + 1);
  const headings = blockOfType(page, "heading");
  await addRootBlock(page, "Titolo");
  await expect(headings).toHaveCount(seedHeadings + 1);
  await expect(canvas.locator("[data-block-id]")).toHaveCount(seedBlocks + 2);
  await page.screenshot({ path: `${SHOTS}/02-sezione-e-widget.png` });

  // ─── 3. Nessun contributo al box model: geometria identica con/senza cornice ────────────
  // Deseleziona (click reale sull'angolo vuoto della topbar + Escape, come nella Wave 2.1).
  await page.getByRole("banner").click({ position: { x: 4, y: 4 } });
  await page.keyboard.press("Escape");
  await page.mouse.move(2, 2);

  const withFrame = await snapshotGeometry(page);
  await setThemeFrameDisplay(page, true);
  const withoutFrame = await snapshotGeometry(page);
  await setThemeFrameDisplay(page, false);
  expect(Object.keys(withFrame).length).toBeGreaterThan(2); // sezione + titolo + scrollHeight
  expect(withFrame).toEqual(withoutFrame);
  await page.screenshot({ path: `${SHOTS}/03-cornice-presente.png` });

  // ─── 4. Hit-testing: il mouse "attraversa" la cornice, nessun hover né selezione ────────
  for (const area of ["header", "footer"] as const) {
    const badge = canvas
      .getByTestId(`theme-frame-${area}`)
      .locator("span")
      .first();
    await badge.scrollIntoViewIfNeeded();
    const box = await badge.boundingBox();
    if (!box) throw new Error(`Badge ${area} senza bounding box`);
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await page.mouse.move(cx - 30, cy - 30);
    await page.mouse.move(cx, cy, { steps: 5 });
    // Nessun overlay di hover per la cornice…
    await expect(canvas.locator('[class*="hoverBadgeLabel"]')).toHaveCount(0);
    // …e l'elemento sotto il puntatore non è la cornice.
    const hitIsFrame = await canvas.locator("body").evaluate(
      (_, p) => {
        const el = document.elementFromPoint(p.x, p.y);
        return !!el?.closest("[data-theme-frame]");
      },
      { x: cx, y: cy },
    );
    expect(hitIsFrame).toBe(false);
  }
  await page.screenshot({ path: `${SHOTS}/04-hover-su-cornice.png` });

  // ─── 5. Hover con mouse reale: sezione poi widget, sulla geometria dei nodi reali ───────
  const section = sections.last();
  await section.scrollIntoViewIfNeeded();
  const sectionBox = await section.boundingBox();
  if (!sectionBox) throw new Error("Sezione senza bounding box");
  await page.mouse.move(
    sectionBox.x + 2,
    sectionBox.y + sectionBox.height / 2,
    { steps: 5 },
  );
  const hoverBadge = (label: string) =>
    canvas.locator('[class*="hoverBadgeLabel"]').filter({ hasText: label });
  await expect(hoverBadge("Sezione")).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/05-hover-sezione.png` });

  const heading = headings.last();
  const headingBox = await heading.boundingBox();
  if (!headingBox) throw new Error("Titolo senza bounding box");
  await page.mouse.move(
    headingBox.x + headingBox.width / 2,
    headingBox.y + headingBox.height / 2,
    {
      steps: 5,
    },
  );
  await expect(hoverBadge("Titolo")).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/06-hover-widget.png` });

  // ─── 6. Selezione con click reale: bordi #a435c0 (widget) / #2271b1 (sezione) ───────────
  await heading.click();
  await expect(
    page.getByRole("complementary", { name: "Proprietà dell'elemento" }),
  ).toBeVisible();
  expect(await frameDrawsColor(page, WIDGET_PURPLE)).toBe(true);
  await page.screenshot({ path: `${SHOTS}/07-selezione-widget.png` });

  await page.mouse.move(
    sectionBox.x + 2,
    sectionBox.y + sectionBox.height / 2,
    { steps: 5 },
  );
  await page.mouse.click(
    sectionBox.x + 2,
    sectionBox.y + sectionBox.height / 2,
  );
  expect(await frameDrawsColor(page, SECTION_BLUE)).toBe(true);
  await page.screenshot({ path: `${SHOTS}/08-selezione-sezione.png` });

  // Un click sulla cornice non è una selezione: il blocco resta quello di prima (o nessuno),
  // mai un "blocco cornice" — la selezione si legge dal breadcrumb, che parte da "Pagina".
  const crumbs = canvas.getByTestId("canvas-breadcrumb").locator("button");
  await expect(crumbs.first()).toHaveText("Pagina");
  await expect(crumbs).not.toContainText(["THEME"]);

  // ─── 7. La cornice non altera la geometria nemmeno con selezione attiva ─────────────────
  const selWith = await snapshotGeometry(page);
  await setThemeFrameDisplay(page, true);
  const selWithout = await snapshotGeometry(page);
  await setThemeFrameDisplay(page, false);
  expect(selWith).toEqual(selWithout);
  await expect(header).toBeVisible();
  await expect(footer).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/09-cornice-con-selezione.png` });
});
