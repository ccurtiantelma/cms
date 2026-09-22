# ADR-97 — Collegamento del CSS dinamico per-nodo (`background`, ADR-96) al sito pubblico/statico

## Status

[ ] In discussione · [x] **Approvata** · [ ] Rifiutata · [ ] Superseded da ADR-XXX

## Data approvazione

2026-09-22 — approvato da: marketing@antelmagroup.net, conferma esplicita in sede di task
(scelta "Fix minimo scope ADR-96" alla domanda posta in questa sessione, stesso pattern di
autorizzazione di ADR-91/92/94/96).

## Contesto

Il task segnalava un bug di rendering: il colore di sfondo impostato in Editor per
Contenitore/Sezione/Colonna (nodo `container` unificato, ADR-82) è salvato nel JSON del blocco
ma non compare mai sulla pagina pubblica/statica (es. `/test-20`).

Diagnosi (nessuna riga di codice toccata prima di questo punto):

- `app/backend/src/blocks/compiler/to-css.ts`/`value-to-declarations.ts` compilano già
  correttamente `background` (`none`/`color`/`gradient`) per ADR-96, ma **`toCss()` non viene
  mai chiamato da nessun percorso che produce la pagina pubblica** — verificato con grep
  sull'intero `app/backend/src`, nessun chiamante fuori dal proprio modulo/test.
- L'export statico (`export.processor.ts`) non genera CSS dal JSON dei blocchi: fa `fetch`
  dell'HTML già renderizzato da `app/public-site` e copia solo il bundle CSS Vite statico
  (`syncCssBundle`), lo stesso per ogni pagina.
- Il selettore che `to-css.ts` genera (`[data-block="<id>"]`, da `SPEC-PROPKIND-V2-DETAILS.md` §
  10, "pensato per il consumer HTML pubblico") non corrisponde a **nessun attributo mai
  renderizzato nel DOM**: `Container.tsx` (condiviso `app/frontend`/`app/public-site` via alias
  `@blocks`) emette `data-canvas-style-id`, non `data-block`.
- L'unico consumatore del CSS per-nodo (via `generateCanvasCss.ts`, il mirror frontend-only già
  corretto per ADR-96) è `IframeCanvas.tsx` — solo l'anteprima live nell'editor, mai la pagina
  pubblica.
- `docs/ai/specs/SPEC-F03-superficie-pubblica.md` § 3.2 documenta già come "non implementato" un
  meccanismo di CSS critico inline per-blocco sulla pagina pubblica, coerente con questo gap.

In sintesi: non un difetto di traduzione nel compilatore, ma l'assenza totale di un collegamento
fra JSON del blocco → CSS compilato → HTML pubblico, per qualunque prop PropKind v2 (non solo
`background`). Colmarlo per intero (image/video/slideshow, tutti gli altri `kind` v2) eccede lo
scope della segnalazione; questa ADR copre solo lo stesso scope di ADR-96 (`background`
`none`/`color`/`gradient` su nodi `container`).

## Decisione

1. **Nuovo endpoint pubblico `GET /api/v1/public/settings/breakpoints`**
   (`public-pages.controller.ts`), mirror esatto di `GET /api/v1/public/settings/theme`: riusa
   `SettingsService.getBreakpoints()` (ADR-76) senza guardia d'autenticazione. Necessario perché
   il compilatore CSS per-nodo normalizza un inviluppo breakpoint anche quando (come per
   `background` oggi) la prop non è essa stessa responsive — serve comunque sapere quali
   breakpoint del sito sono attivi per restare coerenti con l'editor.
2. **`app/public-site/src/block-dynamic-css.ts`** (nuovo modulo): compone il CSS dinamico
   dell'intera Pagina (blocchi + Sezioni Globali header/footer) riusando **`generateCanvasCss()`**
   (`@blocks/generateCanvasCss`, il mirror frontend-only già scope-corretto per ADR-96) — non il
   compilatore backend `to-css.ts` (isolamento di dominio invariato, `app/public-site` non è un
   consumer NestJS) e non un terzo algoritmo duplicato. Selettore quindi
   `[data-canvas-style-id="<id>"]`, coerente con l'attributo realmente renderizzato da
   `Container.tsx`, **non** `[data-block="<id>"]` di `SPEC-PROPKIND-V2-DETAILS.md` § 10 (mai
   emesso da alcun componente — quella parte della SPEC resta descrittiva, non vincolante per
   questo collegamento).
3. **Iniezione nel `<head>`**: `entry-server.tsx` calcola `blockDynamicCss` (stessa forma di
   `criticalCss`/`buildCriticalCss`) e lo passa a `App.tsx`/`PreviewDocument.tsx`, che lo
   rendono come `<style data-block-dynamic-css>` **dopo** `<link rel="stylesheet" href={cssHref}>`
   — a parità di specificità fra il selettore per-nodo e le classi di `Container.module.css`,
   l'ordine nel documento decide, e questo `<style>` deve sempre vincere sul default statico del
   componente.
4. **Nessuna modifica a `export.processor.ts`**: l'export statico si limita già a copiare
   l'HTML SSR di `app/public-site` (`syncCssBundle` + scrittura file) — una volta che l'SSR
   inietta il `<style>` corretto, la pipeline di export lo trasporta senza modifiche, come fa
   già oggi per `criticalCss`/`ThemeStyleTag`.

## Alternative scartate

- **Wiring del compilatore backend `to-css.ts` nell'export** (chiamarlo da
  `export.processor.ts` sul JSON della revisione pubblicata) — più vicino alla lettera di
  `SPEC-PROPKIND-V2-DETAILS.md` § 10 (selettore `data-block`), ma richiede anche di aggiungere
  l'attributo `data-block` a `Container.tsx` (usato oggi solo per `data-canvas-style-id`) e
  duplicherebbe la responsabilità di generazione CSS fra backend (export) e frontend (canvas),
  due algoritmi paralleli da mantenere sincronizzati con due selettori diversi sullo stesso
  attributo del nodo. Riusare `generateCanvasCss()` anche per l'SSR pubblico mantiene un solo
  algoritmo v2 lato client (già testato, già scope-corretto) e un solo attributo DOM.
- **CSS critico "above the fold" esteso a tutta la pagina invece di un modulo dedicato** — il
  contratto di `critical-css.ts` (solo i primi blocchi, per performance) è intenzionalmente
  parziale; il CSS dinamico per-nodo deve invece coprire **tutta** la pagina (un blocco di sfondo
  può stare ovunque nell'albero), quindi un modulo separato con scope diverso, non un'estensione
  di `buildCriticalCss`.

## Conseguenze

**Positive**
- Il colore/gradiente di sfondo di Contenitore/Sezione/Colonna impostato in Editor ora compare
  sulla pagina pubblica/statica (`/test-20` incluso), coerente con quanto già visibile nel Canvas.
- Un solo algoritmo v2 (`generateCanvasCss`) serve sia l'anteprima Canvas sia l'SSR pubblico:
  nessuna divergenza fra le due superfici per lo stesso scope (`background`
  `none`/`color`/`gradient`).

**Negative / costi**
- Ogni render SSR di pagina ora fa una terza chiamata parallela (`fetchBreakpoints`, oltre a
  tema e Sezioni Globali) — tollerante ai guasti per costruzione (fallback
  `DEFAULT_BREAKPOINTS_DTO`), stesso principio di `fetchThemeConfig`/`fetchActiveGlobalSections`.
- Il debito dichiarato da ADR-96 resta identico e non esteso da questa ADR: `background.type:
  'image'|'video'|'slideshow'` e ogni altro `kind` v2 (`link`/`animation`/`motion`/...) restano
  non compilati né sul Canvas né ora sul sito pubblico.
- `to-css.ts`/backend `case 'background'` resta comunque **non wired** a nessun consumer
  reale (dead code lato backend per questo scopo) — non è stato rimosso perché resta l'algoritmo
  di riferimento (§ Conformità di ADR-96) e potenzialmente il punto di partenza per un futuro
  collegamento lato export secondo `SPEC-PROPKIND-V2-DETAILS.md` § 10, fuori scope qui.

## Conformità

1. `public-pages.controller.ts` — nuovo `GET settings/breakpoints`, `docs/openapi.yaml`/
   `app/frontend/src/types/api.types.ts` rigenerati (`npm run openapi:export && npm run
   openapi:types`).
2. `app/public-site/src/block-dynamic-css.ts` — nuovo modulo, nessun test dedicato di unità
   (pura composizione di funzioni già testate: `generateCanvasCss`, `resolveActiveBreakpoints`).
3. `app/public-site/test/block-dynamic-css.spec.ts` — suite SSR end-to-end: container con
   `background.color` produce `<style data-block-dynamic-css>` con `background-color` e
   selettore `data-canvas-style-id` coerente col DOM, dopo il `<link>` esterno; richText resta
   fuori scope; nessun `<style>` emesso quando nessun nodo ha prop di stile libere.
