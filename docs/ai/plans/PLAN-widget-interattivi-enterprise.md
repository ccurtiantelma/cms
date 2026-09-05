# Plan — Widget Interattivi Enterprise (accordion, tabs, carousel, modal-trigger)

## Spec di riferimento
`docs/ai/adr/ADR-57-widget-interattivi-css-only-children.md` (Approvata, 2026-09-05)
`docs/ai/rfc/RFC-57-widget-interattivi-enterprise-css-only.md`

---

## Audit strategico

### Falle logiche / Contraddizioni rilevate
- Nessuna residua: la tensione fra il task originario ("quattro widget") e il numero reale
  di tipi necessari (sette, per la composizione a `children` decisa in ADR-57) è stata
  sciolta nella RFC/ADR — il registro passa a diciannove tipi, non sedici.

### Rischi architetturali / Over-engineering
- Componente: Property Inspector — rischio di costruire un nuovo controllo "ripetitore" per
  l'aggiunta/rimozione/riordino delle voci (`accordionItem`/`tabPanel`/`carouselSlide`).
  Rimedio: **non serve** — palette, Editor Structure Navigator e drag & drop sono già
  generici sul registro (`allowedChildTypes`/`canContainType`/`canDropInto`,
  `block-registry.utils.ts`); T5 sotto vieta esplicitamente di costruirne uno nuovo.
- Componente: `children.allow` delle tre voci + `modalTrigger`. Rimedio: limitato per v1 a
  `['heading','richText','image','button','container']`, mai un altro widget interattivo di
  questo gruppo tra loro (ADR-57 § Decisione punto 2) — evita conflitti CSS-only da
  annidamento non richiesto da alcun requisito.

---

## Task operativi (max 8, ordinati per dipendenze)

### T1 — Registro blocchi: sette nuovi tipi + estensione `section`
- **Output atteso**:
  `app/backend/src/blocks/types/accordion.block.ts`,
  `app/backend/src/blocks/types/accordion-item.block.ts`,
  `app/backend/src/blocks/types/tabs.block.ts`,
  `app/backend/src/blocks/types/tab-panel.block.ts`,
  `app/backend/src/blocks/types/carousel.block.ts`,
  `app/backend/src/blocks/types/carousel-slide.block.ts`,
  `app/backend/src/blocks/types/modal-trigger.block.ts`,
  `app/backend/src/blocks/block-registry.ts` (import + `BLOCK_DEFINITIONS` + `ROOT_ALLOWED`
  aggiornati),
  `app/backend/src/blocks/types/section.block.ts` (`children.allow` esteso con i quattro
  tipi contenitore, riga ~240)
- **Dipendenze**: nessuna (ADR-57 approvata)
- **Criterio di Done**: `BLOCK_REGISTRY.size === 19`; `ROOT_ALLOWED` include `accordion`,
  `tabs`, `carousel`, `modalTrigger` e non include `accordionItem`/`tabPanel`/
  `carouselSlide`; ciascuno dei sette `BlockDefinition` ha `v: 1`, nessun `minRole`, schema
  props esatto come da ADR-57 § Decisione punto 2; `npx tsc --noEmit` pulito in
  `app/backend`.
- **Agente**: backend-developer

### T2 — Unit test registry + validator (Jest)
- **Output atteso**: `app/backend/test/unit/blocks/block-registry.spec.ts` e
  `app/backend/test/unit/blocks/validator/block-tree-validator.service.spec.ts` estesi per i
  sette nuovi tipi. Se in fase di scrittura emerge un caso di validazione non coperto dal
  meccanismo generico esistente (`children.allow`/props dichiarative), va segnalato e
  discusso — non implementato di iniziativa fuori da questo task.
- **Dipendenze**: T1
- **Criterio di Done**: per ciascuno dei sette tipi — annidamento ammesso accettato;
  annidamento vietato → `BLOCK_NESTING_NOT_ALLOWED` con `path` del nodo colpevole; prop non
  dichiarata → `BLOCK_PROP_NOT_DECLARED`; prop obbligatoria mancante (`title`/`label`/
  `triggerLabel`) → `BLOCK_PROP_INVALID`/`required`; `accordionItem`/`tabPanel`/
  `carouselSlide` in radice dell'albero → `BLOCK_NESTING_NOT_ALLOWED`; un `accordionItem`
  dentro un `tabs` (e viceversa) → rifiutato. `npm run test --workspace=app/backend` verde.
- **Agente**: backend-developer

### T3 — Rigenerazione artefatto tipi frontend
- **Output atteso**: esecuzione di `npm run blocks:export` poi `npm run blocks:types` →
  `app/frontend/src/types/blocks.types.ts` rigenerato con i sette nuovi
  `BlockTypeDescriptor`.
- **Dipendenze**: T1
- **Criterio di Done**: `blocks.types.ts` riflette `childrenAllow`/props/`v` coerenti col
  backend per tutti e diciannove i tipi; rieseguire i due comandi produce diff vuoto (nessun
  drift); `npx tsc --noEmit` pulito in `app/frontend` con l'artefatto aggiornato.
- **Agente**: backend-developer

### T4 — Componenti condivisi CSS-only (editor + public-site) e registrazione in `BlockRenderer`
- **Output atteso**: `app/frontend/src/components/blocks/blocks/AccordionBlock.tsx`,
  `AccordionItemBlock.tsx`, `TabsBlock.tsx`, `TabPanelBlock.tsx`, `CarouselBlock.tsx`,
  `CarouselSlideBlock.tsx`, `ModalTriggerBlock.tsx` (+ rispettivi `.module.css`);
  `app/frontend/src/components/blocks/BlockRenderer.tsx` con sette nuovi `case` sul modello
  di `navMenu`/`navMenuItem` (contenitori che ricorrono su `node.children`, voci che
  ricevono le proprie prop).
- **Dipendenze**: T3
- **Criterio di Done**: zero `onClick`/handler React, zero `useState`/`useEffect` nei sette
  componenti — solo markup semantico + CSS Modules (`<details>/<summary>` con `name`
  condizionale per `accordion`; `<input type=radio>` + `<label>` + pannelli per `tabs`;
  contenitore `scroll-snap` + ancore `#slide-N` per `carousel`, classi `fade-loop`/
  `slide-loop` solo se `transition` lo richiede; `<a href="#modal-{id}">` + pannello
  `id="modal-{id}"` per `modalTrigger`), stesso principio zero-JS già rispettato da
  `Container.tsx`/`Section.tsx`; `npx tsc --noEmit` pulito in `app/frontend`.
- **Agente**: frontend-developer

### T5 — Property Inspector: campi prop dei sette tipi (nessuna nuova infrastruttura di children editing)
- **Output atteso**: `app/frontend/src/pages/pages/editor/inspector/ContentTab.tsx`,
  `AdvancedTab.tsx`, `PropField.tsx` estesi con il mapping `meta.props` dei sette
  `block-definition` (etichette/help per `title`/`label`/`exclusive`/`autoplay`/
  `transition`/`triggerLabel`/`animation`).
- **Dipendenze**: T3
- **Criterio di Done**: l'Inspector mostra i campi corretti per ciascuno dei sette tipi
  usando i controlli già esistenti per `plainText`/`boolean`/`enum` (nessun nuovo tipo di
  controllo introdotto); **verificato che nessun nuovo componente "ripetitore" è stato
  scritto** — l'aggiunta/rimozione/riordino delle voci passa dalla palette e dal drag & drop
  già generici (`block-registry.utils.ts`); nessuna regressione sui tipi esistenti (test
  Vitest pre-esistenti restano verdi).
- **Agente**: frontend-developer

### T6 — Test Vitest componenti + Inspector
- **Output atteso**: `*.test.tsx` per i sette componenti di T4 (accanto ai file, stesso
  pattern di `NavMenuBlock.test.tsx`/`Container.test.tsx`) + aggiornamento di
  `PropertyInspector.test.tsx` per i nuovi campi.
- **Dipendenze**: T4, T5
- **Criterio di Done**: `npm run test --workspace=app/frontend` verde. Copertura minima:
  `accordion` con `exclusive:true` produce `name` uguale su tutti i figli, `exclusive:false`
  nessun `name`; `tabs` produce `name` del gruppo radio univoco per istanza e primo pannello
  `checked` di default; `carousel` con `transition:'manual-scroll'` non emette classi di
  animazione anche se `autoplay:true` (no-op verificato); `modalTrigger` emette
  `href="#modal-{id}"` e pannello con lo stesso `id` derivato dal nodo.
- **Agente**: frontend-developer

### T7 — Bruno + integration test backend (Supertest)
- **Output atteso**: collezioni `bruno/pages/*.yml` aggiornate se l'endpoint di salvataggio
  albero non ha già copertura generica sufficiente; nuovi casi in
  `app/backend/test/e2e` o `test/unit` di integrazione per `PagesService`/validator con un
  albero che contiene tutti e sette i tipi annidati correttamente.
- **Dipendenze**: T1, T2
- **Criterio di Done**: happy path (albero valido con i sette tipi → salvataggio riuscito);
  1 errore (un `accordionItem` in radice, o dentro un `tabs` → `400` con `details.path` del
  nodo colpevole); 1 RBAC (utente `User` che salva sulla bozza altrui contenente questi tipi
  → `403`, riuso della regola di ownership esistente, nessuna nuova regola introdotta da
  questi sette tipi). Verifica che `title`/`label`/`triggerLabel` (`plainText`) non
  permettano HTML (nessuno escaping richiesto alla persistenza, ma nessun tag interpretato
  in lettura pubblica).
- **Agente**: test-engineer

### T8 — Gate CI zero-JS/zero-`<img>`-fuori-contratto sull'export statico
- **Output atteso**: estensione del test/e2e già esistente per l'escaping `plainText` su
  HTML generato dal job di export (ADR-53 § Conformità), con una pagina di fixture che
  contiene tutti e sette i tipi annidati.
- **Dipendenze**: T4, T6
- **Criterio di Done**: il gate fallisce se l'HTML prodotto contiene `<script>`, un
  attributo `on*`, o un attributo di hydration; verifica positiva della presenza degli
  elementi CSS-only attesi (`<details>`, `<input type=radio>`, ancora `#modal-*`) per la
  pagina di fixture; il test è di regressione (deve fallire deliberatamente se un commit
  futuro reintroduce uno script/handler in uno di questi sette componenti).
- **Agente**: test-engineer

---

## Matrice dei rischi

| Rischio | Probabilità | Impatto | Mitigazione |
|---|---|---|---|
| Parità visiva Canvas React ↔ output statico CSS-only | Media | Medio | T6 copre i quattro comportamenti lato componente; verifica manuale in review per il WYSIWYG |
| `<details name>` non supportato su browser vecchi | Bassa | Basso | Degrado esplicito ad apertura multipla, documentato in ADR-57, non trattato come bug |
| Accessibilità limitata di `modalTrigger` (`:target`) | Media | Medio | Limite dichiarato in ADR-57; T8 verifica solo l'esclusione dall'albero di accessibilità quando non `:target`, non la piena conformità WCAG |
| Validator con caso non coperto dal meccanismo generico | Bassa | Alto | T2 istruito a segnalare, non inventare, se emerge un caso scoperto |

---

## Definition of Done — Checklist globale

### Implementazione
- [ ] T1–T8 implementati
- [ ] Nessun `any` TypeScript senza commento
- [ ] Nessun `console.log` rimasto
- [ ] Ogni funzione pubblica con JSDoc

### Test
- [ ] Unit test backend scritti e superati (Jest, T2)
- [ ] Integration test scritti e superati (Supertest, T7)
- [ ] Collezioni Bruno aggiornate se necessario (T7)
- [ ] Test Vitest frontend scritti e superati (T6)
- [ ] Gate CI zero-JS sull'export statico esteso (T8)
- [ ] Nessun test placeholder

### Build e qualità
- [ ] `npx tsc --noEmit` pulito su `app/backend` (T1)
- [ ] `npx tsc --noEmit` pulito su `app/frontend` (T3, T4)
- [ ] `npm run build --workspace=app/backend` superata
- [ ] `npm run build --workspace=app/frontend` superata
- [ ] Lint superato

### Contratti e documentazione
- [ ] `npm run blocks:export` + `npm run blocks:types` eseguiti senza drift (T3)
- [ ] `npm run openapi:export`/`openapi:types` eseguiti se l'endpoint di salvataggio pagine
      cambia forma (verificare: probabilmente invariato, l'albero resta `jsonb` opaco al
      DTO esterno)
- [ ] RFC/ADR non modificate post-approvazione (ADR-57 resta come approvata; eventuali
      deviazioni emerse in implementazione vanno in una nuova ADR, mai in una riscrittura)

### Commit
- [ ] Commit atomico per task con messaggio Conventional Commits
- [ ] `git rm docs/ai/adr/ADR-57-widget-interattivi-css-only-itemlist.md` (file segnaposto
      lasciato dall'Orchestrator, che non ha accesso al terminale per eliminarlo)
