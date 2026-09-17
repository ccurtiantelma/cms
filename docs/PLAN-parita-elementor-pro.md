# PLAN — Parità con Elementor Pro (8 round)

> Piano operativo. Ogni round: RFC → firma ADR → task backend/frontend/test → chiusura con aggiornamento `progress-tracker.md`. Dimensionamento in "settimane-persona" (sp) indicativo per un team di 2 dev + 1 test. Le ADR sono numerate `ADR-73+` per continuità con il repo (ultima firmata: ADR-72). Riferimenti: `ELEMENTOR_PRO_GAP_ANALYSIS_v2.md`, `SPEC-propkind-v2.md`.

## Grafo delle dipendenze

```
R0 Decisioni fondative ─┬─ R1 Stile completo (hover, colorRef, typography, spacing)
                        ├─ R2 Container unico + grid + position
                        │       └─ R3 Builder UX (dock, breakpoint, select parent, template server)
                        ├─ R4 Widget base (CSS-only)  ──┐
                        └─ R5 Runtime pubblico (isole JS) ─┴─ R6 Widget Pro + motion + popup
                                                             └─ R7 Collezioni + Dynamic Tags + Loop + Theme Builder
                                                                    └─ R8 Piattaforma (kit, fonts, custom code, ruoli, collaborazione)
```

---

## R0 — Decisioni fondative (2 sp, solo documenti)

Da firmare **prima** di qualunque codice; ribaltabili oggi a costo zero.

| ADR | Decisione | Alternative scartate |
|---|---|---|
| ADR-73 | **Isole JS pubbliche**: bundle unico `public-runtime.js` ≤ 30 KB gzip, incluso solo se necessario, CSP nonce, `prefers-reduced-motion`. Supera "zero-JS" di ADR-53 | JS per widget (N richieste); framework runtime (peso) |
| ADR-74 | **Modificatore `stateful`** + ordine envelope stato→breakpoint→valore | prop duplicate `*Hover` (esplosione registro) |
| ADR-75 | **Breakpoint configurabili** in `app_settings` (7 Elementor-compatible) | restare a 3 |
| ADR-76 | **Global Kit** schema (colori/font N, theme style, layout, lightbox) + `colorRef`/`fontRef` risolti a export via CSS custom properties | risoluzione inline hex (ri-export totale a ogni cambio) |
| ADR-77 | **`css` e `html` kind** sanitizzati (css-tree allowlist; iframe sandbox) — supera il divieto "nessun CSS/HTML utente" | mantenere il divieto (nessun clone possibile) |
| ADR-78 | **Collezioni (Content Types)**: entità con schema campi definibile, righe con stato, slug e locale; base di Dynamic Tags e Loop | tag hard-coded solo su Pagine |
| ADR-79 | Provider mappe (OSM/Leaflet self-hosted tiles vs Google embed), video (YouTube/Vimeo no-cookie), icone (Tabler SVG allowlist) | — |

Output: 7 ADR, aggiornamento `constitution.md` (principio "Public Read is a Different Citizen" → "…con isole JS dichiarate"), `non-functional-requirements.md` (budget JS/CSS).

---

## R1 — Stile completo (6 sp)

**Obiettivo**: ogni blocco raggiunge il pannello Stile di Elementor (Normal/Hover, tipografia, colori globali, spaziatura libera).

Backend
- T1 `prop-spec.types.ts`: `stateful`, `colorRef`, `fontRef`, `typography`, `spacing`, `radius`, `gradient`; validator + sanitizer per ciascuno (100% branch coverage).
- T2 Migrazione `v1→v2` per heading/richText/image/button (SPEC § 6); `section` **non** ancora (R2).
- T3 `settings/global-kit`: schema § 5 (colors/fonts N), endpoint `GET/PUT app/settings/global-kit`, `GET public/global-kit.css` compilato (`:root{--gk-…}`).
- T4 `toCss()` unico per kind, con `@media` per breakpoint attivi e `:hover`; test snapshot dell'HTML/CSS esportato.

Frontend
- T5 `PropField`: controlli `ColorRefPicker` (swatch globali + hex + alpha), `TypographyPopover` (pannello a 9 campi, per-campo responsive), `SpacingBox` (4 lati + unità + link), `RadiusBox`, `GradientEditor` (stop bar).
- T6 **State switcher** Normal/Hover in testa a ogni sezione Stile con prop `stateful`; indicatore "hover impostato".
- T7 `GlobalTokensDrawer` → **Site Settings** drawer a schede: Global Colors (lista editabile, drag, rinomina, "usato in N blocchi"), Global Fonts, Theme Style (h1–h6/link/button/img), Layout.
- T8 Reset per-prop (icona ↺ → default registro) e "Copia/Incolla stile" esteso agli stati.

Test: unit validator (~120 casi), Playwright: hover applicato in anteprima, cambio Global Color propagato senza ri-salvare le pagine.

Rischi: dimensione CSS critico → soglia split (SPEC § 7).

---

## R2 — Container unico, grid, position (5 sp)

- T1 `container` `v2` (SPEC § 4.1): `display: grid`, `gridTemplateColumns/Rows`, gap XY, tag semantico, `minHeight`, `overflow`, `background` unificato (color/gradient/image + overlay; video/slideshow flag ma render in R5), `position`, `transform`, `filter`, `opacity`, `link`, `shapeDivider`.
- T2 Migrazione `section→container` con test su 40 alberi reali (fixture dal DB demo); `section` disabilitato in palette (`enabled:false`), leggibile.
- T3 Mixin "Avanzato" comune a ogni widget (§ 4.2) + `hideOn[]` che sostituisce `styleHide*`.
- T4 Frontend: **Grid editor** visuale (preset 1/2/3/4/6 col, 12-col custom, colonne trascinabili in canvas con snapping a fr/px/%); handle di resize per larghezza container in canvas (già presente `ContainerResizeHandle` → estendere a min-height e gap).
- T5 Position: overlay in canvas per drag di elementi `absolute` con snap a bordi/centro (guide); `sticky` preview nel canvas iframe.
- T6 Shape divider picker con 20 SVG allowlist.
- T7 `MAX_DEPTH` 8 / `MAX_NODES` 1500 + benchmark validator (< 50 ms su 1500 nodi).

---

## R3 — UX del builder (5 sp)

- T1 **Bottom dock** 40px: breadcrumb strutturale cliccabile (ogni antenato), responsive switcher con breakpoint attivi + "gestisci breakpoint", pulsanti History, Revisioni, Impostazioni pagina, Navigator, Finder, Shortcuts (?). Topbar resta per titolo/undo/salva/pubblica.
- T2 **Select parent** nella handle bar (freccia ↑) + colore *selected* distinto (`#93003c` o accento) da *hover* (`#2271b1`).
- T3 **Revisioni in-builder**: drawer con lista, anteprima nel canvas (modo read-only con banner), "Ripristina" (già `restoreRevision` API), diff visuale di blocchi aggiunti/rimossi/modificati.
- T4 **Copia/Incolla nodo**: clipboard interno + `navigator.clipboard` JSON firmato (HMAC per ambiente) per cross-pagina/cross-tab; "Incolla" in menu contestuale e Ctrl+V su selezione.
- T5 **Template server**: tabella `templates` (guid, name, category, kind: page|section|container|popup|loop-item, tree jsonb, thumbnail mediaRef, createdBy, version); `TemplateLibraryModal` → schede "Miei template / Blocchi / Pagine", ricerca, anteprima, import/export JSON; "Salva come template" dal menu contestuale e dalla handle bar.
- T6 Navigator: rinomina (`meta.title` per nodo, opaco al validator), hide/show (`hideOn` rapido), drag nel tree con drop-inside, evidenzia nodo hover del canvas.
- T7 **Finder** (Ctrl+E): comando palette con pagine, template, azioni, site settings.
- T8 Editing inline rich su heading/button (chiude RFC-45) con toolbar fluttuante ridotta.
- T9 Breakpoint custom: settings UI (attiva/disattiva, edita px), canvas frame che si adegua, envelope validato sulle chiavi attive.

---

## R4 — Widget base CSS-only (5 sp)

Registro + renderer + inspector per: `divider`, `spacer`, `icon`, `iconList`, `iconBox`, `imageBox`, `alert`, `starRating`, `progress` (statico), `testimonial`, `socialIcons`, `shareButtons` (link statici), `pricingTable`, `cta`, `flipBox` (hover CSS), `breadcrumbs`, `tableOfContents` (statico da heading a export), `html` (embed allowlist), `map` (embed provider R0), `video` (embed no-cookie, poster + click-to-load senza JS: `<a>` → pagina embed), `gallery` (grid/masonry CSS, lightbox R5).

Per ogni widget: definizione (Contenuto/Stile/Avanzato), thumbnail palette, test di render escape, e2e inserimento+salvataggio. Palette riorganizzata per categorie Elementor: Layout · Base · Pro · Form · Dinamici · Sito.

---

## R5 — Runtime pubblico (4 sp)

- T1 `app/public-runtime/` (Vite lib, ESM, no deps): moduli `observer` (entrance), `lightbox`, `carousel` (autoplay/arrows/dots/touch), `countdown`, `toc` (scroll-spy), `formSteps`, `motion` (scroll/mouse), `popup`, `search` (index statico JSON), `loopPagination`.
- T2 Export: include il bundle + `data-runtime` solo se l'albero dichiara `meta.runtime`; CSP header con nonce; `check-air-gap.js` esteso (nessuna chiamata di rete dal runtime salvo `search-index.json` e form endpoint).
- T3 `animation` kind + inspector (preview on hover del nome, "riproduci"); `motion` kind + inspector.
- T4 Lightbox globale (site settings); gallery/image/video lightbox.
- T5 Budget test: Lighthouse CI su pagina demo con tutti i moduli ≤ 30 KB gzip, TBT < 50 ms.

---

## R6 — Widget Pro dinamici + Popup (5 sp)

- `counter` (animato), `countdown` (fixed/evergreen), `testimonialCarousel`, `mediaCarousel`, `animatedHeadline`, `hotspot`, `lottie` (json da media, sanitizzato), `search` (indice statico generato a export), `nav-menu` completo (dropdown/hamburger/mega), `form` multi-step + condizionali + azioni (email, redirect, webhook) + reCAPTCHA/hCaptcha.
- **Popup Builder**: tipo di template `popup` (R3 T5), `trigger` + `conditions` kind, Builder Popup (riuso `FullScreenEditorLayout`), export come frammento HTML + regole JSON per il runtime, frequenza in `localStorage`, anteprima trigger nel builder.

---

## R7 — Collezioni, Dynamic Tags, Loop, Theme Builder (8 sp)

- T1 **Collezioni** (ADR-78): `collections` (schema campi: text, richText, number, boolean, date, media, ref, select), `collection_items` (jsonb validato dallo schema, stato, slug, locale, revisioni come pagine), CRUD + UI admin (lista, form generato dallo schema, import CSV).
- T2 **Dynamic Tags**: `dynamic` wrapper (SPEC § 3.17); risolutore nel worker `static-export` con contesto `{page, site, item, loop}`; UI: icona ⚡ accanto a ogni prop dinamizzabile → popover tag/argomenti/fallback/before-after; badge "dinamico" nel campo.
- T3 **Loop Builder**: tipo `loop` + `query` kind; editor "Loop item template" (canvas con item fittizio dalla collezione, contesto `loop.item`); export N pagine `?page=N` statiche + `loadMore` via runtime; filtri client su indice JSON.
- T4 **Theme Builder**: `theme_templates` (kind: header|footer|single|archive|404|search) con `conditions`; risoluzione a export per ogni pagina/item; Builder con "Display Conditions" modal; supera le sezioni globali fisse header/footer (migrazione: le due globalSection diventano theme_templates con condizione `site`).
- T5 Pagine speciali: 404, archivio collezione, risultati ricerca, sitemap HTML.
- T6 SEO: dynamic tags in `metaTitle/description/og`; JSON-LD per item collezione.

---

## R8 — Piattaforma (5 sp)

- **Kit import/export** (JSON: pagine, template, collezioni, tokens, manifest media) + wizard import con conflitti.
- **Custom Fonts** (upload woff2, `@font-face` nel CSS critico) e **Custom Icons** (SVG sprite).
- **Custom Code** (head/body snippets, priority, conditions, Admin+, nonce).
- **Role Manager**: ruolo "Editor contenuti" (solo tab Contenuto, nessun drag strutturale), "Designer" (tutto tranne pubblicazione), matrice permessi per template/collezioni.
- **Maintenance / Coming soon** mode (export sostitutivo con template dedicato).
- **Collaborazione**: presenza multi-utente (Socket.io già in roadmap F04), lock soft per blocco, Notes/commenti ancorati a nodo (`block_comments`), notifiche già esistenti.
- **Zoom canvas** e vista wireframe; **Shortcuts overlay** completo.

---

## Riepilogo

| Round | Focus | sp | ADR |
|---|---|---|---|
| R0 | Decisioni | 2 | 73–79 |
| R1 | Stile completo | 6 | 80 (migrazione v2 widget) |
| R2 | Container/grid/position | 5 | 81 (container v2) |
| R3 | Builder UX | 5 | 82 (templates), 83 (clipboard) |
| R4 | Widget base | 5 | 84 (registro widget base) |
| R5 | Runtime JS | 4 | — (consuma 73) |
| R6 | Widget Pro + Popup | 5 | 85 (popup) |
| R7 | Collezioni/Dynamic/Loop/Theme | 8 | 86 (dynamic), 87 (loop), 88 (theme builder) |
| R8 | Piattaforma | 5 | 89 (custom code), 90 (ruoli) |
| **Totale** | | **45 sp** (~6 mesi a 2 dev) | |

Ordine non negoziabile: R0 → R1 → R2; R3 e R4 in parallelo; R5 prima di R6; R7 dopo R5; R8 in coda. Ogni round chiude con: tutte le suite verdi, gate `blocks-sync`, `check-air-gap.js` (aggiornato per il runtime), aggiornamento `progress-tracker.md`/`roadmap.md` su richiesta umana.
