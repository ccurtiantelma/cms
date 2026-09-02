# Spec — F04 Layout a colonne e stile responsive per breakpoint

## Status

[x] Bozza — as-built, redatta a valle dell'implementazione già in corso · [ ] Approvata · [ ] Superseded

> Generata dall'Orchestrator il 2026-09-02 su richiesta esplicita dell'umano (unica deroga
> al divieto di scrittura in `docs/`, `CLAUDE.md` § Documentation Policy; vale per questo
> file e si esaurisce con il task).
>
> **Nota sul nome file**: la richiesta originale indicava `SPEC-F05-grid-responsive-engine.md`.
> F05 è però la Multilingua (`docs/roadmap.md` § F05, `CLAUDE.md` § Identità). Questo lavoro —
> props di stile responsive e layout a colonne sui blocchi contenitore — appartiene a **F04,
> Editor visivo**, coerente con `PLAN-F04c-editor-maturo.md` già citato nei commenti del
> codice esistente (`style-tokens.ts`). Il file è stato nominato di conseguenza.
>
> **Nota sullo schema**: questa spec **non introduce blocchi `columns`/`column`**. La
> richiesta originale del task descriveva un contenitore a colonne con figli assegnati
> esplicitamente a uno slot e uno schema di stile `{ desktop, tablet, mobile }`. Entrambe le
> cose contraddicono decisioni già firmate: ADR-31 § "Alternative scartate" respinge
> esplicitamente "l'assegnazione esplicita di un figlio a una colonna" ("trasforma `section`
> da contenitore a griglia con celle indirizzabili, fuori perimetro"), e ADR-29 § 2 usa
> `default` non `desktop` come nome della chiave base, con motivazione esplicita. Un settimo/ottavo
> tipo di blocco (`columns`/`column`) richiederebbe inoltre una nuova firma ADR dedicata
> (ADR-21 § 5, confermato da ADR-39 § 1 per il sesto tipo `container`), che non esiste. Questa
> spec documenta invece l'architettura **già approvata e già implementata**: layout a colonne
> come props di stile su `section` (ADR-31) e su `container` (ADR-39/41), stile per breakpoint
> come modificatore `responsive` sulle `EnumPropSpec` esistenti (ADR-29). Confermato con
> l'umano prima di procedere.

## Feature di riferimento

Non esiste `docs/ai/features/F04-*.md` dedicato a questo sotto-round. F04 nasce da
`docs/roadmap.md` § F04 (Editor visivo) e dai piani `PLAN-F04-editor-visivo.md` /
`PLAN-F04c-editor-maturo.md`. Questa spec copre l'output as-built di ADR-29/30/31/33/37/38/39/41,
già implementato nel working tree al momento della stesura.

## ADR applicabili

- `ADR-29-proprieta-di-stile-per-breakpoint.md` — **approvata 2026-08-20**: modificatore
  `responsive?: boolean` su `EnumPropSpec`, forma per breakpoint `{ default, tablet?, mobile? }`,
  cascata `mobile → tablet → default` in CSS, classi generate da token, mai `style` inline.
- `ADR-31-layout-colonne-section.md` — **approvata 2026-08-23**: props `columns`/`gap`/`alignItems`
  su `section`, CSS Grid, nessuna assegnazione esplicita di figli a colonne.
- `ADR-39-blocco-container-flex-grid-nesting-ricorsivo.md` — **approvata 2026-08-27**: sesto
  tipo di blocco `container`, layout flex (non grid in questo round), nesting ricorsivo via
  sentinel `children.allow: '*'`.
- `ADR-41-container-spaziatura-per-lato.md` — spaziatura per lato (padding/margin) su `container`,
  stessa forma di ADR-33 su `section`.
- `ADR-30-metadati-editor-registro.md` — `meta.props` obbligatorio per ogni prop dichiarata
  (label, tab, order, help), invariante verificato da `block-registry.spec.ts`.
- `ADR-33-section-boxed-fullwidth-colore-spaziatura.md` — `contentWidth`/`maxWidth`/`columnRatio`
  (scalari, non responsive) e spaziatura per lato su `section`.
- `ADR-37-scheda-avanzato-layer-visibilita.md` — `styleLayer` (scalare) e
  `styleHideDesktop`/`styleHideTablet`/`styleHideMobile` (booleani indipendenti, non
  responsive nel senso di ADR-29 — tre props separate, non un envelope).
- `ADR-38-espansione-schema-stile-libero-parita-elementor.md` — `kind: 'border'`/`'shadow'`/
  `'color'`/`'unitValue'`/`'cssClassName'`/`'htmlId'`, propedeutico alle props non-enum di
  `container`/`section`.

## Outcomes tecnici

Al termine di questo round esistono, nel backend: due tipi contenitore (`section`, `container`)
con props di layout responsive validate da un ramo dedicato del validatore
(`validateResponsiveEnumValue`) e un registro che dichiara `children.allow` sia come lista
chiusa sia come sentinel `'*'`. Nel frontend: componenti di rendering (`Section.tsx`,
`Container.tsx`) che risolvono l'envelope per-breakpoint in classi CSS Module tramite
`resolveResponsiveClassNames`, un pannello proprietà che legge/scrive nell'oggetto del
breakpoint attivo senza mai perdere gli altri due, e un canvas editor con drag-and-drop
annidato dentro `container` (incluso container-in-container).

Nessuna tabella nuova, nessun endpoint nuovo, nessun DTO nuovo: l'intero round vive nello
schema dei blocchi (`jsonb` di `pages.content`) e nel rendering, non nel modello relazionale.

## In scope

- Forma dell'envelope responsive e regola di cascata (§ 1).
- Props di layout a colonne su `section` (§ 2).
- Props di layout flex su `container`, incluso il sentinel di nesting (§ 3).
- Contratto di rendering: risoluzione envelope → classi CSS (§ 4).
- Integrazione editor: stato del breakpoint attivo, pannello proprietà, drag-and-drop annidato (§ 5).
- Stato dei test e gap residui da colmare (§ 6).

## Out of scope

- Un settimo tipo di blocco `columns`/ottavo `column` con assegnazione esplicita di figli a
  colonna: alternativa scartata da ADR-31, nessuna ADR la autorizza (vedi nota in Status).
- `display: 'grid'` su `container`: ADR-39 § 2 punto 1 lo esclude esplicitamente in questo round.
- Anteprima responsive nel canvas editor (mostrare live il rendering tablet/mobile): fuori
  scope per ADR-29 Conseguenza, segnalato come debito verso F04 nell'RFC che ha originato
  ADR-29.
- Navigator come superficie compiuta e schermo intero: debito di governance aperto da ADR-31 § "Decisione 8", non chiuso da questa spec.
- Nuovi `kind` di prop, nuove tabelle, nuovi endpoint: nessuno introdotto da questo round.

## Vincoli e assunzioni

1. **Nessun incremento di `v` sui tipi esistenti, nessuna migrazione.** Tutte le props di
   questo round sono opzionali con `default` dichiarato (ADR-29 § 5, ADR-39 § 7): il token del
   registro cambia solo per l'aggiunta della voce `container` (ADR-23 § 2), non per le props
   responsive su `section`.
2. **La forma per breakpoint è vincolante e unica**: `{ default: string, tablet?: string,
   mobile?: string }`. Nessuna quarta chiave, nessun rinominamento di `default` in `desktop`.
3. **Ogni valore di stile è un token di un `enum` chiuso**, mai una misura libera: il pixel
   vive nel CSS (`style-tokens.module.css`), mai nel contenuto salvato (ADR-29 § 1).
4. **Il rendering non rivalida**: un valore malformato o con token sconosciuto in
   `resolveResponsiveClassNames`/`resolveScalarClassName` produce assenza di classe, mai un
   errore — la validazione è autorità esclusiva del server (`block-tree-validator.service.ts`).

## 1. Forma dell'envelope responsive e cascata

Ogni prop dichiarata `responsive: true` su una `EnumPropSpec` salva un oggetto, non uno
scalare:

```json
{ "default": "md", "tablet": "sm", "mobile": "xs" }
```

- `default` è **obbligatoria** nell'oggetto (chiave chiusa, tre nomi: `default`, `tablet`,
  `mobile` — `RESPONSIVE_BREAKPOINTS` in `prop-spec.types.ts`).
- `tablet`/`mobile` sono opzionali. Se assenti, la cascata CSS ricade: `mobile` assente →
  eredita `tablet`; `tablet` assente → eredita `default`. La cascata è implementata **in un
  solo punto**: le media query `max-width` di `style-tokens.module.css` (soglie: tablet
  ≤768px, mobile ≤480px).
- Il renderer emette **una classe per ogni breakpoint presente nel valore salvato**, mai solo
  `default` — vincolo esplicito di ADR-29 Conseguenza / ADR-31 Conseguenza: un renderer che
  ignora `tablet`/`mobile` produce perdita silenziosa di contenuto già salvato.

Validazione server-side (`block-tree-validator.service.ts`, `validateResponsiveEnumValue`):
valore non oggetto o `default` mancante → `reason: 'type'` sul path della prop; chiave fuori
dai tre nomi chiusi → stesso `reason: 'type'`; token fuori dalla lista `values` dichiarata →
`reason: 'enum'` sul path della **singola voce** (es. `…props.gap.tablet`), non sull'intera
prop.

## 2. `section` — props di layout a colonne (ADR-31)

Tre props aggiuntive, tab `style`, tutte `kind: 'enum'`, `responsive: true`:

| Prop | Valori | Default | Note |
|---|---|---|---|
| `columns` | `1` `2` `3` `4` | `{ default: '1' }` | numero di colonne della griglia |
| `gap` | `none` `sm` `md` `lg` | `{ default: 'none' }` | stessa scala di `container.gap` |
| `alignItems` | `stretch` `flex-start` `center` `flex-end` | `{ default: 'stretch' }` | allineamento verticale delle celle |

Nessun figlio riceve un indice di colonna: l'ordine nella griglia segue l'ordine dei figli
nell'albero (`ADR-31 § 7`). Il wrap a 1 colonna sotto 768px è comportamento del *default*
quando l'editor non sovrascrive `mobile`/`tablet` — non una regola CSS incondizionata,
resta sovrascrivibile. `Section.module.css` usa `display: grid`,
`grid-template-columns` derivato dalle classi generate da token.

Coesistono su `section` (invarianti, non responsive, ADR-33): `contentWidth`
(`boxed`/`full-width`), `maxWidth` (`sm`/`md`/`lg`/`xl`), `columnRatio`
(`equal`/`33-66`/`66-33`, significativa solo con `columns: '2'`).

## 3. `container` — props di layout flex (ADR-39/41)

Sesto tipo del registro (`v: 1`, `migrations: []`), `children: { allow: '*' }` — sentinel di
nesting ricorsivo, incluso container-in-container. Sei props di layout:

| Prop | Valori | `responsive` | Default |
|---|---|---|---|
| `display` | `flex` (solo) | no | `'flex'` |
| `flexDirection` | `row` `row-reverse` `column` `column-reverse` | sì | `{ default: 'row' }` |
| `justifyContent` | `flex-start` `flex-end` `center` `space-between` `space-around` `space-evenly` | sì | `{ default: 'flex-start' }` |
| `alignItems` | `stretch` `flex-start` `center` `flex-end` | sì | `{ default: 'stretch' }` |
| `wrap` | `nowrap` `wrap` | sì | `{ default: 'nowrap' }` |
| `gap` | `none` `sm` `md` `lg` | sì | `{ default: 'none' }` |

`display` **non** è `responsive` e accetta solo `'flex'`: ADR-39 § 2 punto 1 esclude `'grid'`
in questo round (senza `gridTemplateColumns`/`gridTemplateRows` produrrebbe un'etichetta che
promette una capacità assente). Più `styleFlexBasis` (`kind: 'unitValue'`, unità `%`, 0–100:
larghezza della singola colonna quando `container` è figlio di un altro `container`), colore
(`styleBackgroundColor`/`styleColor`, `kind: 'color'`), otto props di spaziatura per lato
(ADR-41, stessa scala 10 valori di `section`), `customCssClass`/`customElementId` (ADR-38 § 6).

`container` è ammesso a `ROOT_ALLOWED` e in `section.children.allow`
(conseguenza dichiarata di ADR-39 § 4: senza questo, `container` sarebbe annidabile solo a
radice o dentro sé stesso). `MAX_DEPTH: 5` / `MAX_NODES: 500` restano invariati (ADR-39 § 5).

## 4. Contratto di rendering (frontend)

`app/frontend/src/components/blocks/style-tokens.ts` espone tre funzioni pure, senza
validazione (tollerante a valori malformati, mai un errore):

- `resolveResponsiveClassNames(styles, slot, value)` — per props responsive: itera
  `RESPONSIVE_BREAKPOINTS`, emette una classe `${slot}_${breakpoint}_${token}` per ogni
  breakpoint presente nell'envelope.
- `resolveScalarClassName(styles, slot, value)` — per props scalari non responsive
  (`contentWidth`/`maxWidth`/`columnRatio`, `styleLayer`).
- `resolveHideClassName` / `resolveLayerClassName` — varianti dedicate rispettivamente alle
  tre props booleane di visibilità (ADR-37 § 3) e a `styleLayer` (ADR-37 § 2).

`style-tokens.module.css` dichiara, per ogni combinazione (prop, breakpoint, token), una
classe con la media query corrispondente — mai `style` inline (ADR-29 § 6). L'alias `@blocks`
porta lo stesso componente e lo stesso CSS Module identici in admin (`app/frontend`) e sul
sito pubblico (`app/public-site`, ADR-22): un solo contratto di rendering, due consumer.

## 5. Integrazione editor

- **Stato del breakpoint attivo**: `useBlockEditorStore.ts` espone `activeViewport:
  'desktop' | 'tablet' | 'mobile'`. La conversione al nome di chiave dell'envelope
  (`'default' | 'tablet' | 'mobile'`) passa per `breakpointKey()` in `inspector.utils.ts` —
  **non** un accesso diretto a `activeViewport` come chiave, perché il nome del viewport
  desktop (`'desktop'`) e il nome della chiave base dell'envelope (`'default'`) sono
  deliberatamente diversi (ADR-29 § 2).
- **Pannello proprietà**: `PropField.tsx` (case `'enum'`) scrive **solo** la chiave del
  breakpoint attivo, preservando le altre due — `{ ...envelope, [breakpointKey]: next }`, mai
  una sovrascrittura dell'intero oggetto. Due varianti di controllo: `Slider` per le props di
  spaziatura a scala chiusa, `SegmentedControl` per le quattro props flex-oriented di
  `container` (`flexDirection`/`justifyContent`/`alignItems`/`wrap`).
- **Drag-and-drop annidato**: `EditorBlockWrapper.tsx` riconosce il sentinel
  `childrenAllow === '*'` e consente il drop di qualunque tipo dentro `container`, incluso
  `container` stesso; gestisce drop-zone per indice colonna e maniglia di ridimensionamento
  per `container.styleFlexBasis`.
- **Box model visivo**: il widget di spaziatura per lato riconosce le props per **nome**
  (`stylePadding*`/`styleMargin*`), non per `block.type`: si applica a `container` senza
  modifiche (ADR-41 § 5).

## 6. Stato dei test e gap residui

Verificato con l'esecuzione della suite al momento della stesura:

- Backend: `npx jest test/unit/blocks` → **122/122 verdi**. `block-tree-validator.service.spec.ts`
  copre sia il ramo enum responsive (forma envelope, cascata, `reason: 'enum'` sulla singola
  voce) sia il sentinel `'*'` (nesting ricorsivo profondo, `enabled`/`minRole` non bypassati).
  `block-registry.spec.ts` verifica l'invariante ADR-30 § 4. **Nessun gap rilevato.**
- Frontend: `PropertyInspector.test.tsx` (47), `EditorBlockWrapper.test.tsx` (18),
  `Section.test.tsx` (1) → **66/66 verdi**. Gap residui, da colmare (§ Task breakdown T4):
  1. `Section.test.tsx` copre solo `styleBackgroundColor`: manca il test T8 di ADR-29/31
     Conseguenza — render con `columns`/`gap`/`alignItems` su tutti e tre i breakpoint
     contemporaneamente, verifica che tutte e tre le classi compaiano nell'HTML prodotto.
  2. Nessun `Container.test.tsx`: il componente non ha copertura di componente dedicata
     (gestisce `styleFlexBasis` come `unitValue`, colori, classi responsive).
  3. Nessun test isolato per `resolveResponsiveClassNames`/`resolveScalarClassName` in
     `style-tokens.ts`: oggi la copertura è solo indiretta tramite gli altri componenti.
  4. Il lato "scrittura" del T8 (modificare il breakpoint attivo lascia intatti gli altri due)
     è verificato in `PropertyInspector.test.tsx` solo su `styleSpaceBefore`: manca lo stesso
     test sul ramo `SegmentedControl` di `container` (`flexDirection`/`gap`/ecc.) e su
     `section.columns`/`gap`/`alignItems`.

Nessuna lacuna architetturale o di schema: il debito è interamente di copertura di test
mirata, non di implementazione.

## Task breakdown

- [x] T1 — Backend: schema `section.columns`/`gap`/`alignItems` (ADR-31) — già implementato.
- [x] T2 — Backend: sesto tipo `container` + validator sentinel `'*'` (ADR-39/41) — già implementato.
- [x] T3 — Frontend: rendering `Section.tsx`/`Container.tsx`, pannello proprietà responsive,
      drag-and-drop annidato — già implementato.
- [ ] T4 — Test Engineer: colmare i quattro gap di § 6 (`Container.test.tsx`, estensione
      `Section.test.tsx` per T8, unit test `style-tokens.ts`, estensione
      `PropertyInspector.test.tsx` per `container`/`section.columns`).
- [ ] T5 — Verifica finale: `npm run test` (backend + frontend) e `tsc --noEmit` su entrambi
      i pacchetti, zero errori.

## Criteri di verifica

- Un valore salvato con tutti e tre i breakpoint (`default`+`tablet`+`mobile`) su
  `section.columns`/`gap`/`alignItems` e su `container.flexDirection`/`gap` produce, nell'HTML
  reso, tutte e tre le classi corrispondenti — mai solo `default`.
- Modificare il controllo del breakpoint attivo nel pannello proprietà non altera i valori
  salvati degli altri due breakpoint (asserzione diretta sull'oggetto envelope dopo l'update).
- Un tipo non registrato o oltre `minRole` resta escluso dal drop dentro `container` anche con
  il sentinel `'*'` attivo (già coperto lato backend, da verificare anche lato editor in T4 se
  in scope).
- `npm run test` e `tsc --noEmit` senza errori su `app/backend` e `app/frontend`.
