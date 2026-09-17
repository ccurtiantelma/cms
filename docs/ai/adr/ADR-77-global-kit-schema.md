# ADR-77 — Schema `app_settings.global_kit` e compilazione dei token in CSS Custom Properties

## Status
[x] **In discussione** · [ ] Approvato · [ ] Rifiutato · [ ] Superseded da ADR-XXX

## Data approvazione
_In attesa di firma umana — vedi "Decisione umana" in fondo a questo documento._

## RFC di riferimento
Nessuna RFC dedicata (round R0, vedi ADR-74 § "RFC di riferimento"). Riferimento sostanziale:
`docs/SPEC-propkind-v2.md` § 3.1/§ 3.2/§ 5, `docs/ELEMENTOR_PRO_GAP_ANALYSIS_v2.md` riga 98.

## Numerazione
Vedi ADR-74 § "Numerazione": questo round occupa ADR-74–ADR-80.

## ADR di riferimento (non superate, non modificate)
`GlobalTokensDrawer` (introdotto in un round precedente non numerato in questo documento, citato
in `ELEMENTOR_PRO_GAP_ANALYSIS_v2.md` riga 18: "4 colori, font, spacing") resta il componente UI di
partenza, esteso da questa ADR a schema aperto — nessuna ADR di UI viene riscritta, solo lo schema
dati che quel componente legge/scrive cambia forma.

---

## Contesto

Lo stato attuale (`GlobalTokensDrawer`) espone 4 colori, 1 font e 1 spacing fissi, sufficienti per
un tema minimo ma non per "Site Settings completo" richiesto da Elementor Pro
(`ELEMENTOR_PRO_GAP_ANALYSIS_v2.md` riga 98: "Global Colors N, Global Fonts N, theme style per
h1-h6/link/button/form/image, layout, lightbox, background"). Due gap dipendono direttamente da
questa ADR prima di poter esistere:

1. `kind: 'colorRef'`/`kind: 'fontRef'` (`SPEC-propkind-v2.md` § 3.1/3.2) hanno bisogno di un
   `GlobalColorId`/`GlobalFontId` risolvibile — un identificatore che oggi non esiste perché i 4
   colori non hanno un id stabile, sono posizionali.
2. Il cambio di un colore globale deve propagarsi a **tutte** le pagine che lo referenziano senza
   ri-pubblicarle una per una (`ELEMENTOR_PRO_GAP_ANALYSIS_v2.md` riga 29: "cambio palette →
   propagazione"). Con ADR-53 (SSG puro, build-on-publish), "propagazione" non può significare "letto
   a runtime dal pubblico" — il pubblico non ha API né database. Deve significare "un solo file
   rigenerato copre ogni pagina", non "ogni pagina rigenerata".

Il problema architetturale è quindi la risoluzione dei riferimenti sotto il vincolo air-gapped:
dove vive il valore finale di un `colorRef`, e chi lo scrive.

---

## Decisione

1. **Un'unica riga `app_settings` (`key: 'global_kit'`)**, stesso pattern di `app_settings.
   breakpoints` (ADR-76): nessuna tabella nuova, `value: jsonb` con lo schema di
   `SPEC-propkind-v2.md` § 5:
   ```ts
   {
     colors: [{ id, label, value: hex|hexA }],            // 4 system (primary/secondary/text/accent) + ≤30 custom
     fonts:  [{ id, label, typography: TypographyValue }], // 4 system + ≤20 custom
     themeStyle: { body, h1..h6, link, button, image, formFields },
     layout: { contentWidth, widgetSpace, pageTitleSelector, defaultContainerPadding },
     lightbox: { enabled, bgColor, uiColor, showTitle, showDescription, zoom, share },
     customFonts: [{ id, family, files: { woff2: mediaRef }[], weights }],
     customIcons: [{ id, svgMediaRef, label }],
     customCode: [{ id, location, priority, code, conditions }],  // Admin+, vedi § "Conformità"
   }
   ```
   `breakpoints` **non** vive qui: resta la propria riga `app_settings.breakpoints` (ADR-76),
   perché ha un ciclo di vita e un livello di privilegio di scrittura diverso (i breakpoint toccano
   la validazione dell'albero blocchi, il kit tocca solo la risoluzione di riferimenti) — due
   impostazioni di sito, due righe, stesso principio "Single Source of Truth" applicato senza
   fonderle artificialmente in un solo blob.

2. **I 4 colori e i 4 font "system" non sono eliminabili, ma sono rinominabili e ri-valorizzabili.**
   Il loro `id` (`primary|secondary|text|accent`) è stabile e riservato: nessun colore/font custom
   può riusare uno di questi 4 id. Questo garantisce che un blocco esistente che referenzia
   `{ ref: 'primary' }` non perda mai la risoluzione — l'id sopravvive anche se l'utente rinomina
   l'etichetta visibile ("Primario" → "Blu principale") o ne cambia il valore esadecimale. I
   colori/font custom ricevono un `id` guid a 16 caratteri esadecimali (stesso formato di
   `mediaRef`/`pageRef`, `GUID_PATTERN` del validator), generato alla creazione e mai riusato.

3. **`colorRef`/`fontRef` non portano mai il valore finale nel `jsonb` del blocco** —
   `SPEC-propkind-v2.md` § 1 principio 3, "riferimenti a token risolti a export": un blocco salva
   `{ ref: 'accent-3f9a1b2c4d5e6f70' }` o un hex diretto (superset ammesso, § 3.1), mai una
   copia del valore risolto. La risoluzione avviene in due punti distinti e non intercambiabili:
   - **A build-time del CSS del kit**: `GET public/global-kit.css` (endpoint pubblico di sola
     lettura, coerente con `docs/constitution.md` § Convenzioni API "Controller di lettura pubblica
     dei contenuti") compila l'intero `global_kit` in un blocco `:root { --gk-color-primary: #...;
     --gk-font-primary-family: '...'; ... }`, un file per sito, servito e cacheato come ogni altro
     asset statico dell'edge (ADR-53 § 4).
   - **A build-time di ogni pagina**: il worker `static-export`, incontrando `{ ref: 'primary' }`
     nell'albero, emette nel CSS critico della pagina `var(--gk-color-primary)`, **non** il valore
     esadecimale letterale. La risoluzione del nome simbolico è quindi immediata e non richiede
     leggere `global_kit` per generare quella pagina — solo il file `global-kit.css` deve essere
     rigenerato quando cambia un colore, mai le pagine.

4. **Conseguenza diretta del punto 3: cambiare un Global Color rigenera un solo file, non N
   pagine.** Questo è il meccanismo di "propagazione senza ri-pubblicare" richiesto dal gap
   analysis, reso compatibile con l'air-gap: non c'è risoluzione a runtime (nessun JS, nessuna API
   pubblica coinvolta, coerente con ADR-74), c'è **ri-compilazione mirata di un solo artefatto** a
   ogni salvataggio di Site Settings. Il job che rigenera `global-kit.css` è distinto e più leggero
   del job `enqueueFullSiteExport` di ADR-45/ADR-53 § "Conseguenze" (che resta necessario solo
   quando cambia `themeStyle`/`layout` in modi che alterano il markup, non solo i valori dei
   token).

5. **`themeStyle` copre i default per elemento (h1–h6, link, button, image, formFields) come
   fallback, non come override.** Un blocco che non dichiara esplicitamente una prop di stile
   eredita dal `themeStyle` corrispondente al proprio tag semantico (coerente con l'analogia
   Elementor: "Site Settings" governa cosa succede quando nessuna scelta locale è stata fatta). Il
   meccanismo di fallback è nel CSS (regola di selettore generica sovrascritta da una più specifica
   per-blocco), non nel validator: un blocco senza `typography` esplicita è valido lo stesso
   (nessuna prop diventa obbligatoria), il CSS applicato dipende dalla cascata.

6. **`customFonts`/`customIcons`/`customCode` vivono nello stesso `jsonb` ma sono gestiti da
   endpoint e ruoli distinti** (`customCode` è Admin+, coerente con la soglia RBAC di
   `ELEMENTOR_PRO_GAP_ANALYSIS_v2.md` riga 95 e con ADR-78 per la sanitizzazione del codice), non
   perché lo schema li imponga uniti, ma perché appartengono alla stessa unità di configurazione di
   sito e non giustificano tre tabelle separate per tre liste piccole (≤20/≤30 voci attese).

---

## Alternative valutate

| Opzione | Pro | Contro | Motivo scarto |
|---|---|---|---|
| Risoluzione inline hex nel blocco a ogni cambio (ri-scrivere ogni nodo che referenzia il colore) | Nessun meccanismo di riferimento da mantenere | Ri-export totale di ogni pagina a ogni cambio palette — il costo esplicitamente scartato in `PLAN-parita-elementor-pro.md` § R0 riga ADR-77(76 nel piano originale) | Contraddice il requisito "propagazione senza ri-pubblicare" |
| Tabella `global_tokens` dedicata invece di riga `app_settings` | Schema relazionale più esplicito | Duplica il pattern già esistente e approvato per impostazioni singleton di sito (`app_settings.key/value`); nessun vantaggio di query, il kit si legge sempre per intero | Nessun beneficio, un pattern in più da mantenere |
| Risoluzione dei riferimenti a runtime pubblico (JS legge `global-kit.json` e riscrive gli stili) | Aggiornamento "istantaneo" percepito | Reintroduce JS pubblico per un caso già risolto meglio da CSS custom properties statiche; viola ADR-74 § 6 (zero chiamate di rete oltre le due eccezioni chiuse) | CSS var() risolve lo stesso problema senza JS |
| Colori/font system eliminabili come i custom | Modello uniforme, nessuna eccezione | Un blocco esistente con `{ref:'primary'}` perderebbe la risoluzione se l'id venisse cancellato, senza un meccanismo di fallback dichiarato | Rischio di rottura silenziosa del contenuto salvato |
| Un `kind` unico `token` invece di `colorRef`/`fontRef` separati | Un solo `kind` da validare | Colore e font hanno forme di valore e vincoli (`allowAlpha`, `google_allowlist`) sufficientemente diversi da giustificare due `kind`, coerente con la distinzione già presente fra `kind: 'color'` e altri kind di valore singolo | Nessun risparmio reale, perdita di specificità del validator |

---

## Conseguenze

- Endpoint nuovi: `GET/PUT app/settings/global-kit` (superficie amministrativa), `GET
  public/global-kit.css` (superficie pubblica, sola lettura, nessuna autenticazione — stesso
  regime di ogni asset CSS statico dell'edge).
- `fonts[].typography.fontFamily.source: 'google'` richiede un elenco allowlist
  (`fonts.google_allowlist`) sincronizzato in DB, mai un fetch a runtime verso Google Fonts né in
  admin né sul pubblico (coerente con l'air-gap e con l'assenza di chiamate di terze parti a build
  non controllata) — le famiglie disponibili sono quelle che un Admin ha esplicitamente
  sincronizzato, non l'intero catalogo Google.
- `customFonts`/`customCode` introducono un job di rigenerazione del CSS critico che include
  `@font-face` (PLAN R8): questa ADR ne fissa solo la posizione nello schema, non l'implementazione
  del job, rinviata al round che la consuma.
- Il worker `static-export` guadagna una dipendenza di lettura in più (`global_kit` per risolvere i
  `ref`) al momento della generazione di ogni pagina — sola lettura, nessuna scrittura, nessun
  impatto sull'air-gap del pubblico (la lettura avviene nel piano di gestione, non sul pubblico).
- Nessuna modifica allo schema PostgreSQL oltre alla riga singleton in `app_settings`.

## Conformità

- Un colore/font system non è mai cancellabile via API (`DELETE`/rimozione dall'array rifiutata con
  `409` o validazione DTO, a scelta dell'implementazione — vincolo verificato da un test dedicato).
- Un `{ref: <id inesistente>}` scritto in un blocco non fa fallire la validazione dell'albero (il
  riferimento è verificato in forma, non in esistenza, stesso principio di `mediaRef`/`pageRef` nel
  validator attuale) ma il worker di export lo risolve a un fallback esplicito (colore/font
  `primary`) con un warning nel report di build, mai un crash silenzioso o un colore mancante.
- `GET public/global-kit.css` non richiede autenticazione ed è escluso da `AuthMiddleware`
  (`docs/constitution.md` § Convenzioni API), verificato da un test di integrazione.
- Un cambio di un solo Global Color rigenera solo `global-kit.css`, mai le pagine: asserito da un
  test che salva una modifica del kit e verifica che nessun job `static-export` per pagina venga
  accodato in conseguenza.

---

## Decisione umana

**Esito**: [ ] Approvato così com'è · [ ] Approvato con modifiche (vedi note) · [ ] Rifiutato ·
[ ] Rinviato

**Approvato da**: _______________ · **Data**: _______________

**Note**:
