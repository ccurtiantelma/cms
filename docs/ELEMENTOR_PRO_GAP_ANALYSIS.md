# Gap Analysis — Visual Builder EAIDOS vs Elementor Pro 3.x/4.x

> Documento di analisi comparativa, non normativo. Non introduce business rules, non autorizza implementazioni: ogni voce "da colmare" richiede RFC/ADR/spec secondo la gerarchia decisionale di `CLAUDE.md`. Scritto su richiesta umana esplicita del 2026-08-26; il contenuto sull'implementazione EAIDOS è tratto dal codice attuale (`app/backend/src/blocks/`, `app/frontend/src/pages/pages/editor/`), il contenuto su Elementor Pro è conoscenza generale del prodotto (non verificabile su `docs/` di questo repo — dichiarato come tale).

## Legenda priorità

- **P0 — Critico per il Look&Feel**: senza questo, i blocchi EAIDOS non possono replicare visivamente un layout Elementor comune (colori liberi, bordi, font-size libero, ombre).
- **P1 — Funzionale**: gap che limita la produttività editoriale o la parità di workflow (navigator, history, page settings).
- **P2 — Avanzato**: feature di fascia "Pro" avanzata (animazioni, dynamic tags, motion effects, breakpoint custom).

Stato: `[ ]` mancante · `[x]` presente in EAIDOS.

---

## 1. Widget & Controls Gap

Il modello EAIDOS ha **5 tipi di blocco** (`section`, `heading`, `richText`, `image`, `button`), tutti `v: 1`, definiti in `app/backend/src/blocks/types/*.block.ts` (ADR-21). Ogni tipo espone un sotto-insieme statico e chiuso di prop; il pannello (`PropertyInspector.tsx`) genera i controlli **a partire dal `PropKind`**, non da un widget dedicato per tipo. Elementor Pro, al contrario, ha controlli liberi (px/%/em/vw), color picker RGBA/gradiente, e decine di controlli per widget.

Di seguito la mappa Contenuto / Stile / Avanzato per i 4 blocchi richiesti. "Container" è mappato su `section`, l'unico blocco EAIDOS con `children.allow` non vuoto.

### 1.1 Heading

| Tab | Controllo Elementor Pro | EAIDOS | Priorità | Stato |
|---|---|---|---|---|
| Contenuto | Testo (rich, con tag dinamici) | `text` plainText max 200 | P1 (dynamic tags) | [x] testo semplice / [ ] dynamic tags |
| Contenuto | Livello HTML (H1–H6) | `level` enum h2–h6 | P0 | [ ] **manca H1** (esclusione esplicita nel registro) |
| Contenuto | Link sull'intero titolo | — | P2 | [ ] |
| Stile | Colore testo (color picker libero + stati hover) | `styleTextColor` enum chiuso (default/muted/accent/inverse) | P0 | [ ] |
| Stile | Tipografia: famiglia (Google Fonts), peso, dimensione px/em/vw responsive, transform, decoration, line-height, letter-spacing | `styleFontSize` enum sm/md/lg/xl · `styleFontWeight` enum regular/medium/bold · `styleFontFamily` enum chiuso a 6 valori (default/inter/roboto/playfair/montserrat/monospace) | P0 | [ ] font libero · [ ] Google Fonts picker · [ ] line-height/letter-spacing/transform/decoration |
| Stile | Text shadow, blend mode | — | P2 | [ ] |
| Stile | Spaziatura prima/dopo con unità libera | `styleSpaceBefore/After` (scala px fissa) | P1 | [x] parziale (solo scala predefinita, non valore libero) |
| Avanzato | Margin/Padding libero con unità (px/%/em) + link ai lati | `stylePadding/MarginTop/Right/Bottom/Left` scala 0–96px, per-breakpoint | P0 | [x] parziale (no unità %/em, no valori arbitrari) |
| Avanzato | Border (width/style/color/radius), box-shadow | — | P0 | [ ] |
| Avanzato | CSS ID / CSS Classes custom | — | P0 | [ ] |
| Avanzato | Visibilità responsive (nascondi su desktop/tablet/mobile) | `styleHideDesktop/Tablet/Mobile` | P1 | [x] |
| Avanzato | Custom CSS per-widget | — | P2 | [ ] |
| Avanzato | Motion effects (entrance animation, scrolling effects) | — | P2 | [ ] |
| Avanzato | Attributi custom (data-*) | — | P2 | [ ] |

### 1.2 RichText (≈ Elementor "Text Editor")

| Tab | Controllo Elementor Pro | EAIDOS | Priorità | Stato |
|---|---|---|---|---|
| Contenuto | Editor WYSIWYG (TinyMCE) con toolbar estesa (tabelle, liste, allineamento, colore inline) | `html` richText, profilo di sanitizzazione `basic` (Tiptap), max 20000 char | P1 | [x] parziale — toolbar ridotta al profilo `basic` (ADR-20/21) |
| Contenuto | Drop cap | — | P2 | [ ] |
| Stile | Colore testo/link (con stato hover) | `styleTextColor` enum chiuso | P0 | [ ] |
| Stile | Tipografia libera + line-height/spacing paragrafi | `styleFontSize/Weight/Family` enum chiuso | P0 | [ ] |
| Stile | Text-shadow, blend mode, column count | — | P2 | [ ] |
| Avanzato | Margin/padding liberi, border, box-shadow, CSS ID/classi | come Heading | P0 | [ ] (identico gap) |
| Avanzato | Responsive visibility | `styleHideDesktop/Tablet/Mobile` | P1 | [x] |
| Avanzato | Motion effects / custom CSS / attributi custom | — | P2 | [ ] |

> Nota di dominio: la sanitizzazione HTML server-side pre-persistenza (ADR-20) è un vincolo di sicurezza non negoziabile e **non va confuso con un gap** — un ampliamento del profilo di allowlist richiede una nuova ADR (CLAUDE.md, "Schema dei blocchi e versionamento").

### 1.3 Image

| Tab | Controllo Elementor Pro | EAIDOS | Priorità | Stato |
|---|---|---|---|---|
| Contenuto | Scelta immagine da libreria media | `mediaRef` (guid-only, no URL libero) | P0 | [x] |
| Contenuto | Alt text | `alt` plainText, `nonEmpty:true`, max 300 | P0 | [x] (bloccante, coerente con regola frontend "alt-text bloccante") |
| Contenuto | Caption (nessuna/testo attaccato/didascalia personalizzata) | — | P1 | [ ] |
| Contenuto | Link (nessuno/media/custom URL/lightbox) | — | P0 | [ ] |
| Contenuto | Dimensione immagine (thumbnail/medium/large/full/custom) + object-fit/position | — | P1 | [ ] |
| Contenuto | Larghezza/altezza custom | — | P1 | [ ] |
| Stile | Border/border-radius, box-shadow, opacity, CSS filters (hover incluso) | — | P0 | [ ] |
| Stile | Max width, alignment | — | P1 | [ ] |
| Avanzato | Spaziatura prima/dopo | `styleSpaceBefore/After` | P1 | [x] |
| Avanzato | Margin/padding, CSS ID/classi, motion effects | — | P0/P2 | [ ] |

> Nota: `image` in EAIDOS ha **solo 2 prop di stile** (`styleSpaceBefore/After`) contro le ~20 di Elementor Pro (border, shadow, filtri, hover state, dimensioni, allineamento). È il blocco con il gap percentuale più ampio.

### 1.4 Container (≈ blocco `section` EAIDOS)

Elementor Pro 3.6+ ha sostituito Section+Column con **Container** unico (flexbox/grid nativo). EAIDOS ha solo `section`, nessun blocco "colonna" separato — le colonne sono una prop numerica (`columns: 1-4`) del contenitore stesso, non nodi figli indipendenti.

| Tab | Controllo Elementor Pro (Container) | EAIDOS (`section`) | Priorità | Stato |
|---|---|---|---|---|
| Layout | Direzione flex (row/column), wrap, justify/align content | `alignItems`, `columnRatio` (equal/33-66/66-33) — solo per 2 figli | P0 | [x] parziale — no flex-wrap, no justify-content libero, no colonne >2 con ratio custom |
| Layout | Grid nativo (righe/colonne/gap indipendenti) | `columns` (1-4) + `gap` | P1 | [ ] no modalità grid |
| Layout | Larghezza contenuto (boxed/full width) + max-width custom | `contentWidth` (boxed/full-width), `maxWidth` (sm/md/lg/xl enum) | P0 | [x] parziale (no valore px libero) |
| Layout | Min-height, overflow | — | P1 | [ ] |
| Stile | Background: colore/gradiente/immagine/video/slideshow, overlay | `styleBackgroundColor` (color libero, unico caso nel registro) | P0 | [x] solo colore piatto, [ ] gradiente/immagine/video |
| Stile | Border/box-shadow, shape divider (top/bottom) | — | P0 | [ ] |
| Avanzato | Margin/padding per lato, responsive | `stylePadding/MarginTop/Right/Bottom/Left` (px scale) | P1 | [x] parziale |
| Avanzato | Z-index/stacking | `styleLayer` (base/raised/overlay/top, enum) | P1 | [x] parziale (enum chiuso, non z-index libero) |
| Avanzato | CSS ID/classi, custom CSS, attributi | — | P0/P2 | [ ] |
| Avanzato | Responsive visibility | `styleHideDesktop/Tablet/Mobile` | P1 | [x] |
| Avanzato | Motion effects, sticky, shape dividers | — | P2 | [ ] |

**Osservazione trasversale ai 4 blocchi**: nessuno dei 5 tipi EAIDOS ha `kind: 'color'` disponibile su Heading/RichText/Image (solo `section.styleBackgroundColor` usa `ColorInput` libero) — tutti gli altri colori sono enum chiusi a 4 token semantici. Manca del tutto un `kind` per border, box-shadow, CSS custom class/ID: introdurne di nuovi è esplicitamente soggetto ad ADR (CLAUDE.md, decisione chiusa ADR-21: "Un sesto tipo o un nuovo `kind` richiede una nuova firma").

---

## 2. UI/UX & Canvas Handles Gap

Componente EAIDOS: `app/frontend/src/pages/pages/editor/EditorBlockWrapper.tsx` + `EditorBlockWrapper.module.css` (rifattorizzato di recente, commit `6782a0b`).

| Aspetto | Elementor Pro (nativo) | EAIDOS | Priorità | Stato |
|---|---|---|---|---|
| Colore bordo hover | `#2271b1` (blue) | `#2271b1` — **identico** | — | [x] |
| Colore bordo/handle selezione | `#93003c` (magenta/pink in Elementor 3.x) o accent tema in 4.x | Handle bar `#2271b1` fisso anche da selezionato; drop-zone/drag usa `#a333c8` (magenta) — palette diversa da Elementor per lo stato "selected" | P1 | [ ] colore selezione non distinto da hover |
| Posizione handle bar | Sopra il blocco, offset tipico ~2-4px dal bordo, altezza ~24-30px | `top: -22px; left: 0`, altezza 22px — **comparabile** (±2-8px) | — | [x] vicino allo standard |
| Contenuto handle bar | Icona widget + nome + drag handle (icona "sposta") + eventuali azioni rapide (duplica/elimina in versioni recenti) | Icona tipo + label + Drag/Duplica/Elimina | P1 | [x] sostanzialmente equivalente |
| Toolbar azioni estesa (edit/duplicate/delete/copy-style/paste-style) | Sì, su hover del widget stesso (non solo handle bar) | Toolbar integrata sotto il blocco: drag, sposta su/giù, indent/outdent, duplica, elimina, cambio livello (solo Heading), inserisci sopra/sotto, aggiungi dentro (solo container) | P1 | [x] copertura funzionale ampia, ma **UI a due barre separate** (handle + toolbar) invece dell'unica handle bar contestuale di Elementor |
| Menu tasto destro | Sì: Edit, Duplicate, Copy, Paste, Copy Style, Paste Style, Delete, Save as Template, Navigator | Sì: Duplica, Sposta su/giù, Copia stile, Incolla stile, Elimina | P1 | [x] parziale — [ ] manca "Salva come template", [ ] manca "Copia/Incolla" nodo intero (solo stile), [ ] manca link diretto al Navigator dal menu |
| Navigator "seleziona genitore" dalla handle bar | Sì (icona freccia-su nella handle bar che risale l'albero) | **Rimossa esplicitamente** nel refactor (commento in codice, righe 711-720): nessun equivalente diretto in-canvas; sostituita da pannello laterale `EditorStructureNavigator.tsx` separato | P0 | [ ] **regressione rispetto a Elementor** — richiede click extra fuori dal contesto canvas |
| Drag & drop — indicatore drop-zone | Linea blu sottile con "+" al punto di inserimento | Punti/linea magenta `#a333c8` con glow — palette non allineata a Elementor (blue) ma funzionalmente equivalente | P2 | [x] funzionale, [ ] colore non Elementor-consistent |
| Drag & drop — contenitore target (drop-inside) | Overlay evidenziato blu translucido | `border-color: #a333c8; background: rgba(163,51,200,0.08)` | P2 | [x] funzionale, colore diverso |
| Colonna: resizer drag tra colonne | Sì (handle centrale, snap libero a %) | Sì, ma **snap a sole 3 ratio fisse** (equal/33-66/66-33), solo per esattamente 2 figli | P1 | [x] parziale — [ ] no resize libero, [ ] no supporto 3+ colonne |
| Toolbar inline per rich text selezionato | Sì (bold/italic/link/align/list) | `InlineFloatingToolbar.tsx`: Bold/Italic/Link/Align/clear — solo per `richText` | — | [x] equivalente |
| Blocco con errore validazione | Overlay rosso + messaggio | `.invalid` — bordo rosso + sfondo `red-light` | — | [x] |
| Responsive preview del canvas | Sì, con breakpoint custom editabili | Sì, 3 breakpoint **fissi** (`VIEWPORT_OPTIONS`: desktop/tablet/mobile), non ridefinibili | P2 | [x] parziale, vedi §3 |

**Sintesi §2**: l'infrastruttura di interazione (hover/selezione/drag/menu contestuale) è sorprendentemente matura e vicina a Elementor nei colori chiave (`#2271b1` combacia esattamente), ma manca il **"select parent" diretto dalla handle bar** (P0 — regressione consapevole, non equivalente sostituito) e la palette di stato "selected vs hover" non è distinta come in Elementor.

---

## 3. Bottom Dock & Global Navigation

**Differenza architetturale principale**: Elementor Pro usa un **bottom bar fisso** (breadcrumb strutturale + responsive switcher + history + preview + salva/pubblica) *oltre* al pannello laterale sinistro. EAIDOS concentra tutto in una **top bar unica** (`FullScreenEditorLayout.tsx`, 60px) e in un pannello laterale a 2 tab (Widgets/Proprietà) — **non esiste un bottom dock**.

| Componente Elementor Pro | Dove vive in EAIDOS | Priorità | Stato |
|---|---|---|---|
| Breadcrumb struttura blocco corrente (bottom-left) | Assente in canvas; solo `EditorStructureNavigator.tsx` come pannello laterale destro opzionale | P1 | [ ] |
| Responsive breakpoint switcher | **Presente**, ma in top bar (`IconDeviceDesktop/Tablet/Mobile`) invece che in bottom dock | — | [x] (posizione diversa, funzione equivalente) |
| **History drawer** (log completo azioni undo/redo con timestamp, click-to-restore) | **Assente**. Esiste solo Undo/Redo puntuale in top bar (Zustand in-memory, nessun log navigabile) | P0 | [ ] |
| **Revisions panel** (elenco versioni pubblicate, restore) | Esiste ma **fuori dal builder**: tab "Revisioni" in `PagePageDetail.tsx` (fuori canvas, richiede uscire dall'editor full-screen) | P1 | [x] equivalente funzionale ma non integrato nel bottom dock dell'editor |
| **Page Settings** (modale: layout pagina, hide title, favicon, CSS custom, body classes) | **Assente come modale nel builder**. Config pagina (titolo/slug/SEO/GEO) vive in tab separate su `PagePageDetail.tsx`, fuori dal contesto canvas | P0 | [ ] |
| **Global Colors picker** (palette di sistema riusabile, 4+ colori nominati, propagazione automatica) | **Assente**. Esiste `PageThemeEditor.tsx` (SuperAdmin, tema Mantine dell'intera admin UI) ma **non collegato** alle prop di stile dei blocchi (`styleTextColor` resta enum chiuso, non bindabile a un colore globale) | P0 | [ ] |
| **Global Fonts** (tipografia di sistema riusabile) | Assente — `styleFontFamily` è enum chiuso a 6 valori statici, nessun collegamento a un sistema di font globali | P1 | [ ] |
| Pulsante Pubblica/Salva bozza | **Presente**: "Salva bozza" in top bar con lock ottimistico (version-based, 409 su conflitto) | — | [x] |
| Anteprima | **Presente**: "Anteprima" apre link tokenizzato (ADR-25) | — | [x] |
| Libreria template/sezioni | **Presente**: "Libreria sezioni" → `TemplateLibraryModal`, ma preset statici da JSON, non libreria cloud/salvabile dall'utente | P1 | [x] parziale — [ ] no "salva come mio template" |
| Keyboard shortcuts overlay (?) | — | P2 | [ ] |
| Exit-to-dashboard con conferma modifiche non salvate | Badge "Modifiche non salvate" presente, ma da verificare se il click su "Torna alla Dashboard" mostra conferma bloccante | P2 | [ ] da verificare (non confermato in esplorazione) |

**Osservazione**: i 3 gap P0 di questa sezione (History drawer, Page Settings modal, Global Colors) sono tutti "decisioni aperte non costruirci sopra" nel senso di CLAUDE.md — nessuno ha una ADR dedicata. Un eventuale Global Colors/Fonts picker impatterebbe direttamente lo schema dei blocchi (nuovo `PropKind` tipo `colorRef`/`fontRef` con referenza a una tabella di token) e richiederebbe ADR secondo la regola "nuovo `kind` richiede una nuova firma".

---

## 4. Struttura DTO/JSON — EAIDOS vs `elementor_data`

### 4.1 Formato Elementor (`elementor_data`, per riferimento)

```json
[
  {
    "id": "a1b2c3d",
    "elType": "container",
    "settings": {
      "flex_direction": "row",
      "background_background": "classic",
      "background_color": "#ffffff",
      "_css_classes": "my-custom-class",
      "custom_css_pro": ".selector{color:red;}"
    },
    "elements": [
      {
        "id": "e5f6a7b",
        "elType": "widget",
        "widgetType": "heading",
        "settings": {
          "title": "Titolo",
          "header_size": "h2",
          "title_color": "#333333",
          "typography_typography": "custom",
          "typography_font_size": {"unit": "px", "size": 32},
          "_animation": "fadeInUp",
          "_element_id": "hero-title"
        },
        "elements": []
      }
    ]
  }
]
```

### 4.2 Formato EAIDOS (`ContentTree`, ADR-21)

```json
{
  "version": 1,
  "blocks": [
    {
      "id": "a1b2c3d4",
      "type": "section",
      "v": 1,
      "props": { "columns": "2", "gap": { "default": "md" }, "contentWidth": "boxed" },
      "children": [
        {
          "id": "e5f6a7b8",
          "type": "heading",
          "v": 1,
          "props": { "level": "h2", "text": "Titolo", "styleFontSize": { "default": "lg" } },
          "children": []
        }
      ]
    }
  ]
}
```

### 4.3 Confronto strutturale

| Aspetto | Elementor `elementor_data` | EAIDOS `ContentTree` | Nota |
|---|---|---|---|
| Nodo radice | Array di elementi top-level | Oggetto `{version, blocks[]}` con envelope versionato | EAIDOS ha un envelope esplicito (`ENVELOPE_VERSION`), Elementor no |
| Discriminante tipo | `elType` (`container`/`widget`/`section`/`column`) + `widgetType` separato per i widget | `type` unico, piatto (`section`/`heading`/`richText`/`image`/`button`) | EAIDOS non distingue "contenitore" vs "widget" a livello di campo — è implicito in `children.allow` del registro |
| Versionamento per nodo | Assente (Elementor versiona per plugin/DB globale, non per nodo) | `v` **per nodo**, migrazioni dichiarate nel registro (ADR-21) | Gap a favore di EAIDOS: rollback/migrazione più granulare |
| Proprietà | `settings: Record<string, any>` — **schema aperto**, ogni widget aggiunge liberamente chiavi, unità miste (`{unit,size}`) | `props: Record<string, unknown>` ma **validato contro whitelist chiusa per tipo** (`PropKind`), 400 con path colpevoli su violazione | Differenza filosofica: Elementor è schema-on-read permissivo, EAIDOS è schema-on-write rigido (coerente con "validazione albero blocchi integrale" di CLAUDE.md) |
| Responsive values | Suffisso `_tablet`/`_mobile` per chiave (es. `title_font_size_tablet`) | Oggetto `{default, tablet, mobile}` esplicito come valore della prop (`RESPONSIVE_BREAKPOINTS`) | EAIDOS più pulito strutturalmente, ma copre solo le prop marcate come responsive nel registro |
| CSS custom / classi / ID | `_css_classes`, `_element_id`, `custom_css_pro` come settings riservati (prefisso `_`) | **Assenti** — nessun campo equivalente nel registro attuale | Gap diretto — vedi §1 |
| Figli annidati | `elements: []` ricorsivo, nesting illimitato de facto | `children: []` ricorsivo, **`MAX_DEPTH = 5`**, **`MAX_NODES = 500`**, **`MAX_PAYLOAD_BYTES = 524288`** (512 KiB) per intero albero | EAIDOS impone limiti hard espliciti (difesa da DoS/payload abuse) assenti in Elementor |
| Rich text | Stringa HTML libera nel widget "Text Editor" | `html` con `PropKind: 'richText'`, sanitizzato server-side con profilo nominato (`basic`) pre-persistenza | Differenza di sicurezza voluta (ADR-20), non un gap da colmare |
| Dynamic tags | Supportati su quasi ogni settings (valore = riferimento a un tag risolto runtime) | **Assenti** — ogni prop è un valore statico persistito | Gap P2, implica un nuovo `PropKind` e un motore di risoluzione — richiede ADR |
| Global widgets / template ref | I widget possono referenziare un "Global Widget" salvato altrove | Assente — nessun concetto di blocco riusabile per riferimento (solo preset statici via Section Library) | Gap P1 |

---

## Sintesi numerica

| Priorità | Voci totali | Presenti (`[x]`, incl. parziali) | Assenti (`[ ]`) |
|---|---|---|---|
| P0 | 19 | 6 (parziali) | 13 |
| P1 | 21 | 11 (incl. parziali) | 10 |
| P2 | 14 | 2 (parziali) | 12 |

**Aree con maggiore concentrazione di gap P0**: controlli di stile libero (colore/font/border/shadow) su Heading/RichText/Image (§1), assenza di CSS ID/classi custom su tutti i blocchi (§1, §4), "select parent" da handle bar rimosso senza sostituto in-canvas (§2), History drawer / Page Settings modal / Global Colors assenti dal builder (§3).

**Nessuna voce di questo documento autorizza implementazione diretta**: ogni gap P0 che tocca lo schema blocchi (nuovo `PropKind`, sesto tipo di blocco, campo CSS custom) richiede una ADR dedicata secondo CLAUDE.md; ogni gap P1/P2 sulla UI (History drawer, Page Settings modal, Global Colors/Fonts) richiede almeno una spec approvata prima di essere pianificato come task.
