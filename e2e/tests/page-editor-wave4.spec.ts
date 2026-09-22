import { test, expect, type Locator, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "fs";
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
 * E2E Wave 4 (scomposizione di `PropertyInspector.tsx` + contrasti WCAG AA in Dark Mode):
 * selezione di un blocco, navigazione fra i tab dell'ispettore, apertura/chiusura dei modali
 * media e misura del rapporto di contrasto sui controlli dell'ispettore in Dark Mode.
 *
 * Screenshot e report dei rapporti in `e2e/artifacts/wave-4/`.
 */

const TITOLO_PAGINA = "Wave 4 — Ispettore e contrasti";
const SHOTS = resolve(__dirname, "../artifacts/wave-4");
const AA_TEXT = 4.5;

test.use({ storageState: ADMIN_STORAGE_STATE });

test.beforeAll(() => {
  mkdirSync(SHOTS, { recursive: true });
});

test.afterEach(async ({ page }) => {
  await deletePageFromUi(page, TITOLO_PAGINA).catch(() => undefined);
});

interface Sample {
  name: string;
  fg: string;
  bg: string;
  ratio: number;
}

/**
 * Rapporto di contrasto WCAG 2.1 fra il colore del testo (`color`) e lo sfondo effettivo
 * (primo antenato con `background-color` non trasparente), calcolati nel browser.
 * `mode: "border"` usa `border-top-color` come primo piano (soglia non-text 3:1).
 */
async function contrast(
  locator: Locator,
  name: string,
  mode: "text" | "border" = "text",
): Promise<Sample> {
  return locator.first().evaluate(
    (el, args) => {
      const parse = (value: string): [number, number, number, number] => {
        const m = value.match(/rgba?\(([^)]+)\)/);
        if (!m) return [0, 0, 0, 0];
        const [r, g, b, a = "1"] = m[1].split(/[,\s/]+/).filter(Boolean);
        return [Number(r), Number(g), Number(b), Number(a)];
      };
      const lum = ([r, g, b]: number[]) => {
        const f = (c: number) => {
          const s = c / 255;
          return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
        };
        return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
      };
      const backdrop = (start: Element | null): [number, number, number] => {
        for (let n = start; n; n = n.parentElement) {
          const c = parse(getComputedStyle(n).backgroundColor);
          if (c[3] > 0.99) return [c[0], c[1], c[2]];
        }
        return [255, 255, 255];
      };
      const style = getComputedStyle(el);
      const fgRaw = parse(args.mode === "border" ? style.borderTopColor : style.color);
      // Un input ha sfondo proprio: per il testo si misura contro `el`, per il bordo contro il genitore.
      const bg = args.mode === "border" ? backdrop(el.parentElement) : backdrop(el);
      const fg: [number, number, number] = [
        fgRaw[0] * fgRaw[3] + bg[0] * (1 - fgRaw[3]),
        fgRaw[1] * fgRaw[3] + bg[1] * (1 - fgRaw[3]),
        fgRaw[2] * fgRaw[3] + bg[2] * (1 - fgRaw[3]),
      ];
      const [hi, lo] = [lum(fg), lum(bg)].sort((a, b) => b - a);
      return {
        name: args.name,
        fg: `rgb(${fg.map(Math.round).join(",")})`,
        bg: `rgb(${bg.join(",")})`,
        ratio: Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100,
      };
    },
    { name, mode },
  );
}

async function selectBlock(page: Page, type: string): Promise<void> {
  await blockOfType(page, type).first().click({ position: { x: 6, y: 6 } });
  await expect(inspector(page).getByText(/^Modifica /)).toBeVisible();
}

const inspector = (page: Page) =>
  page.getByRole("complementary", { name: "Proprietà dell'elemento" });

test("ispettore: tab, modali media e contrasto WCAG AA in Dark Mode", async ({
  page,
}) => {
  test.slow();
  await page.emulateMedia({ colorScheme: "dark" });
  await page.addInitScript(() =>
    window.localStorage.setItem("color_scheme", "dark"),
  );

  await createPageFromUi(page, {
    title: TITOLO_PAGINA,
    slug: uniqueSlug("wave4-e2e"),
  });
  await openContentTab(page);
  await expect(page.locator("html")).toHaveAttribute(
    "data-mantine-color-scheme",
    "dark",
  );

  // Stato vuoto invariato (Wave 2.1): nessuna selezione ⇒ Impostazioni Pagina.
  await expect(inspector(page).getByText("Titolo").first()).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/01-dark-nessuna-selezione.png` });

  await addRootBlock(page, "Sezione");
  await addRootBlock(page, "Titolo");
  await addRootBlock(page, "Immagine");

  // ─── Tab: Contenuto → Stile → Avanzato ─────────────────────────────────────────────────
  await selectBlock(page, "heading");
  const panel = inspector(page);
  const tabs = panel.getByRole("tab");
  await expect(tabs).toHaveCount(3);
  for (const [i, name] of ["Contenuto", "Stile", "Avanzato"].entries()) {
    await tabs.filter({ hasText: name }).click();
    await expect(tabs.filter({ hasText: name })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(panel.getByRole("tabpanel")).toBeVisible();
    await page.screenshot({
      path: `${SHOTS}/0${i + 2}-dark-tab-${name.toLowerCase()}.png`,
    });
  }

  // ─── Misure di contrasto (Dark Mode) ───────────────────────────────────────────────────
  const samples: Sample[] = [];
  await tabs.filter({ hasText: "Contenuto" }).click();
  samples.push(
    await contrast(panel.getByText(/^Modifica /), "titolo intestazione"),
    await contrast(
      panel.locator(".mantine-InputWrapper-label").first(),
      "etichetta input",
    ),
    await contrast(
      panel.locator("input, textarea").first(),
      "testo campo (sfondo campo)",
    ),
    await contrast(
      panel.locator("input, textarea").first(),
      "bordo campo (non-text 3:1)",
      "border",
    ),
    await contrast(
      tabs.filter({ hasText: "Contenuto" }),
      "tab attivo",
    ),
    await contrast(tabs.filter({ hasText: "Stile" }), "tab inattivo"),
  );
  await tabs.filter({ hasText: "Stile" }).hover();
  samples.push(await contrast(tabs.filter({ hasText: "Stile" }), "tab hover"));
  const dimmed = panel.locator("[class*=Text-root][data-c=dimmed], .mantine-InputWrapper-description");
  if ((await dimmed.count()) > 0)
    samples.push(await contrast(dimmed, "testo informativo/descrizione"));
  const dimmedBreadcrumb = panel.locator("p").filter({ hasText: "›" });
  if ((await dimmedBreadcrumb.count()) > 0)
    samples.push(await contrast(dimmedBreadcrumb, "percorso (dimmed)"));
  await page.screenshot({ path: `${SHOTS}/05-dark-tab-hover.png` });

  // ─── Modali media ──────────────────────────────────────────────────────────────────────
  await selectBlock(page, "image");
  await panel.getByRole("button", { name: "Scegli Immagine" }).click();
  const library = page.getByRole("dialog", { name: "Libreria Media" });
  await expect(library).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/06-dark-modale-media-aperta.png` });
  await page.keyboard.press("Escape");
  await expect(library).toBeHidden();
  await page.screenshot({ path: `${SHOTS}/07-dark-modale-media-chiusa.png` });

  // Switch/select nella scheda Stile del titolo.
  await selectBlock(page, "heading");
  await tabs.filter({ hasText: "Stile" }).click();
  const select = panel.locator("input[readonly], [role=combobox]").first();
  if ((await select.count()) > 0)
    samples.push(await contrast(select, "select (testo su sfondo)"));

  writeFileSync(
    `${SHOTS}/contrast-report.json`,
    JSON.stringify(samples, null, 2),
  );
  console.log(samples.map((s) => `${s.ratio}\t${s.name}\t${s.fg} on ${s.bg}`).join("\n"));
  for (const s of samples) {
    const min = s.name.includes("bordo") ? 3 : AA_TEXT;
    expect.soft(s.ratio, `${s.name} (${s.fg} su ${s.bg})`).toBeGreaterThanOrEqual(min);
  }
});
