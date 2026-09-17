# Gap Analysis v2 — Visual Builder EAIDOS vs Elementor Pro

> Sostituisce `ELEMENTOR_PRO_GAP_ANALYSIS.md` (2026-08-26), superato dalle ADR 33–72. Stato letto dal codice il 2026-09-16 (`app/backend/src/blocks/`, `app/frontend/src/pages/pages/editor/`). Obiettivo dichiarato dal committente: **clone funzionale completo di Elementor Pro**, vincoli di sicurezza rinegoziabili. Documento comparativo: le implementazioni passano comunque da RFC/ADR (`CLAUDE.md`).

Legenda: ✅ presente · ◐ parziale · ✗ assente. Priorità: **P0** look&feel, **P1** produttività/parità workflow, **P2** Pro avanzato.

---

## 0. Chiuso dal 26/08 (non più gap)

| Area | Cosa | ADR |
|---|---|---|
| Stile libero | colore hex, font-size con unità, bordo, ombra, classe/ID CSS su tutti i blocchi | 33, 38 |
| Container | flex direction/wrap/justify/align/gap, width/height, padding/margin per lato | 39, 41 |
| Section | sfondo colore / immagine+overlay / gradiente | 47, 50 |
| Image | preset dimensioni, width/height, object-fit, align | 58 |
| Widget | accordion, tabs, carousel, modalTrigger, nav-menu, form/form-field/form-submit, globalRef | 55, 57, RFC-46 |
| Editor | History panel click-to-restore, Page Settings in sidebar, Global Tokens drawer (4 colori, font, spacing), Navigator, iframe canvas, resize colonne, box model visuale, preset salvabili, copia/incolla stile, menu contestuale, sezioni globali header/footer | 40, 54, 72 |

---

## 1. Schema blocchi e controlli

### 1.1 PropKind — cosa manca

| Necessità Elementor | Oggi | Gap | Pri |
|---|---|---|---|
| Stato **Normal/Hover** (+ transition) su colore/bg/bordo/ombra/trasform | nessuna prop ha stato | ✗ `stateful` modifier | P0 |
| **Global Color / Global Font** bindabili (cambio palette → propagazione) | `GlobalTokensDrawer` esiste; `kind:'color'` accetta solo hex | ✗ `colorRef` / `fontRef` (valore `{ref:'primary'}` oppure hex) | P0 |
| **Tipografia composita**: family (Google Fonts), size, weight, transform, style, decoration, line-height, letter-spacing, word-spacing | 3 enum chiusi + `styleFontSizeCustom` | ✗ `typography` kind | P0 |
| Spaziatura con **unità libera e link lati** su section/container | enum 0–96px | ◐ migrare a `spacing` kind (`{top,right,bottom,left,unit,linked}`) | P0 |
| Border-radius per angolo | `border.radius` scalare | ◐ `radius: {tl,tr,br,bl}` | P1 |
| Colore RGBA/gradiente libero | hex 3/6 | ◐ estendere `color` a `#RRGGBBAA` + `gradient` kind (angolo, N stop) | P1 |
| **Dynamic Tag** (valore = riferimento risolto a build/runtime) | ✗ | `dynamic` wrapper: `{ $tag:'page.title', fallback:'…' }` | P2 |
| Attributi custom `data-*` | ✗ | `attributes` kind (lista chiave/valore allowlist) | P2 |
| Custom CSS per elemento | ✗ (vietato) | `css` kind con sanitizer (allowlist proprietà, no `url()`, no `@import`, scope `selector` auto) | P1* |
| Motion: entrance animation, duration, delay | ✗ | `animation` kind (enum preset + ms) | P1 |
| Scrolling/mouse effects, sticky, parallax | ✗ | `motion` kind + JS pubblico | P2 |
| Position absolute/fixed + offset, z-index numerico | `styleLayer` enum 4 | ✗ `position` kind | P1 |
| Transform (rotate/scale/skew/translate), opacity, CSS filters, blend | ✗ | `transform`/`filter` kind, `opacity` number | P1 |

\* richiede rimozione del vincolo "nessun CSS utente" (constitution).

### 1.2 Blocchi esistenti — prop mancanti

**heading**: H1 (oggi vietato), link intero titolo, blend mode, text-shadow (kind `shadow` già c'è, non montato), hover color.
**richText**: colore link + hover, drop cap, column count, toolbar Tiptap estesa (tabelle, colore inline, sub/sup, code).
**image**: link (none/media/custom/lightbox), caption (none/attachment/custom), hover (opacity, filters, transform, transition), max-width, border-radius per angolo.
**button**: icona + posizione + spacing, size preset, variant (fill/outline/ghost), border-radius, padding libero, hover bg/text/border, full-width, `target/rel/nofollow`, id/attrs.
**section/container**: grid (`display:grid`, template columns/rows, auto-flow, justify/align items, gap XY), min-height (vh), overflow, HTML tag semantico (`section/header/footer/article/aside/nav/div`), sfondo video/slideshow, shape divider top/bottom, sticky, background hover, link su intero container, position/z-index numerico. Unificare `section` → `container` (Elementor 3.6+ ha un solo contenitore).
**nav-menu**: layout (horizontal/vertical/dropdown), hamburger breakpoint, indicator, stile item normal/hover/active, submenu stile.
**form**: step multipli, campi condizionali, azioni post-invio (email, redirect, webhook, CRM), messaggi custom, reCAPTCHA/hCaptcha, upload, honeypot già c'è.

### 1.3 Widget assenti (richiesti)

| Categoria | Widget | Note tecniche |
|---|---|---|
| Base | divider, spacer, icon, icon-list, icon-box, image-box, video (YouTube/Vimeo/self-hosted, lightbox, poster), gallery (grid/masonry/justified, lightbox), HTML/embed, alert, text-path | `icon` richiede una libreria icone (Tabler già in bundle admin; per il pubblico servono SVG inline nel file statico — allowlist di nomi) |
| Pro | testimonial + carousel, counter, progress bar, star rating, social icons, share buttons, mappa (OSM/Leaflet o Google embed), pricing table, countdown (evergreen + fixed), table of contents, breadcrumbs, search form, call-to-action, flip box, animated headline, price list, blockquote, hotspot, lottie, media carousel, review/testimonial carousel, sitemap, author box, post info | `countdown`, `search`, `map`, `lottie`, `hotspot`, `carousel autoplay reale` richiedono **JS pubblico** — oggi zero-JS (ADR-53) |
| Dinamici | posts/loop grid, loop carousel, archive title, post title/excerpt/featured image, portfolio, nav menu multilivello | richiedono **Loop Builder** e un modello "collezione/CPT" che il CMS non ha |
| WooCommerce | tutti | fuori scope (dichiarato in roadmap) |

---

## 2. UX del builder

| Elementor Pro | EAIDOS | Gap | Pri |
|---|---|---|---|
| Handle "seleziona genitore" in canvas | rimosso | ✗ reintrodurre freccia-su nella handle bar + breadcrumb in bottom dock | P0 |
| Stato selected ≠ hover (colore distinto) | entrambi `#2271b1` | ◐ selected `#93003c` o accento tema | P1 |
| **Bottom dock**: breadcrumb, responsive switcher, history, revisioni, page settings, keyboard shortcuts | topbar 48px + sidebar | ✗ dock 40px | P1 |
| **Breakpoint custom** (7 predefiniti attivabili + min/max px editabili) | 3 fissi (100%/768/375) | ✗ `RESPONSIVE_BREAKPOINTS` chiuso → configurabile in settings, envelope estende chiavi | P1 |
| Revisioni **dentro** il builder con anteprima/restore | `RevisionDiffModal`, restore fuori | ◐ | P1 |
| Copia/Incolla **nodo** (anche cross-pagina via clipboard), Paste Style già c'è | solo stile | ✗ | P1 |
| Salva come template dal menu contestuale + libreria template utente (cloud) | preset locali + JSON statici | ◐ template come entità server (`templates` table) con categorie, anteprima, import/export JSON | P1 |
| Finder (Ctrl+E) e overlay scorciatoie (?) | ✗ | ✗ | P2 |
| Navigator con rinomina elemento, hide/show, drag nel tree | parziale | ◐ | P1 |
| Editing inline testo su heading/button (rich) | plainText solo | ◐ RFC-45 | P1 |
| Colonne 3+ con resize libero e ratio % | 5 ratio fissi, solo 2 col | ◐ superato dal grid container | P1 |
| Full-width canvas con zoom / "wireframe view" | ✗ | ✗ | P2 |
| Notes/commenti collaborativi, presenza multi-utente | ✗ | ✗ | P2 |
| Dark mode UI editor | Mantine dark c'è | ✅ | — |

---

## 3. Funzioni Pro di piattaforma

| Funzione | Stato | Gap architetturale | Pri |
|---|---|---|---|
| **Theme Builder** (header/footer/single/archive/404 con **display conditions**: intero sito, tipo, singola pagina, escludi) | sezioni globali header/footer fisse | tabella `theme_templates` + `display_conditions` valutate a export | P1 |
| **Popup Builder** (trigger: on load, scroll %, exit intent, click, inactivity; condizioni; frequenza) | `modalTrigger` in-page CSS-only | JS pubblico + storage locale per frequenza | P2 |
| **Dynamic Tags** (page/site/user/media/custom fields/ACF-like) | ✗ | custom fields per pagina (`page_fields` JSON schema) + risolutore a export + fallback | P2 |
| **Loop Builder** (template item + query: collezione, ordinamento, filtri, paginazione, load more) | ✗ | modello **Collezioni/Content Types** (schema definibile), query builder, paginazione statica pre-renderizzata, filtri client JS | P2 |
| **Motion Effects** (scroll, mouse, sticky, entrance) | ✗ | libreria JS pubblica leggera + `prefers-reduced-motion` | P2 |
| **Custom Code** (head/body snippets con location/priority) | ✗ | `site_code_snippets`, solo Admin+, CSP nonce | P2 |
| **Custom Fonts / Icons upload** | 6 font fissi | tabella `fonts` + `@font-face` in CSS critico, SVG sprite icone | P1 |
| **Role Manager** (chi può editare cosa: contenuto-only, no design) | 4 soglie + ownership | ruolo "content editor": inspector solo tab Contenuto | P2 |
| **Site Settings** completo (Global Colors N, Global Fonts N, theme style per h1-h6/link/button/form/image, layout, lightbox, background) | 4 colori + 1 font + 1 spacing | estendere `global_tokens` schema | P0 |
| Import/Export kit (JSON del sito) | ✗ | export `pages+templates+tokens+media manifest` | P1 |
| Maintenance mode / coming soon | ✗ | flag in settings → export sostitutivo | P2 |
| Form submissions manager, integrazioni (Mailchimp, webhook, Zapier) | Invii + email | connettori | P2 |

---

## 4. Conflitti con l'identità attuale del CMS

Il clone completo tocca quattro principi della constitution; ogni punto va deciso con ADR **prima** dei round che lo consumano.

1. **Zero-JS pubblico (ADR-53)** → servono isole JS: countdown, popup, motion, carousel autoplay, form multi-step, lightbox, filtri loop. Proposta: bundle unico ≤ 30 KB, caricato solo se la pagina contiene almeno un blocco che lo richiede, CSP con nonce, `prefers-reduced-motion`.
2. **Nessun CSS/HTML utente** → `css` kind sanitizzato + widget `html` in sandbox `<iframe srcdoc sandbox>` o sanitizzazione allowlist.
3. **Content is Data / schema chiuso** → `dynamic` e `loop` introducono valutazione a export-time (non runtime): compatibile con SSG se il risolutore gira nel worker `static-export`.
4. **Un sito, pagine** → Collezioni/CPT sono un'entità nuova; senza di esse Loop Builder e Dynamic Tags restano vuoti.

---

## 5. Sintesi numerica (voci aperte)

| Priorità | Voci | Note |
|---|---|---|
| P0 | 9 | hover, colorRef/fontRef, typography, spacing libera, select parent, site settings, H1/link/caption/button variant, grid, container unificato |
| P1 | 24 | dock, breakpoint custom, revisioni in-builder, copy node, template server, position/transform/filter, animation, css kind, theme builder, custom fonts, kit import/export, widget base |
| P2 | 16 | dynamic tags, loop builder, popup, motion, custom code, role manager, finder, collaborazione |
| Widget | 45+ | vedi § 1.3 |

Il piano operativo è in `PLAN-parita-elementor-pro.md`; la spec dei nuovi `PropKind` in `SPEC-propkind-v2.md`.
