# ADR-90 — Custom Fonts (validazione upload woff2), Custom Code (algoritmo di iniezione e nonce), Role Manager (profilo `editorProfile`, senza nuovi ruoli)

## Status
[x] **In discussione** · [ ] Approvato · [ ] Rifiutato · [ ] Superseded da ADR-XXX

## Data approvazione
_In attesa di firma umana — vedi "Decisione umana" in fondo a questo documento._

## RFC di riferimento
Nessuna RFC dedicata: round **R8 — Piattaforma** di `docs/PLAN-parita-elementor-pro.md` § R8, righe
"Custom Fonts... Custom Icons", "Custom Code", "Role Manager". Riferimento sostanziale:
`docs/ELEMENTOR_PRO_GAP_ANALYSIS_v2.md` § 3.

## Numerazione
Vedi `ADR-89-import-export-site-kit.md` § "Numerazione": round R8, primo numero libero dopo ADR-89.

## ADR di riferimento (non superate, non modificate)
- `ADR-77-global-kit-schema.md` § "Decisione" punto 6 / `docs/ai/specs/SPEC-GLOBAL-KIT.md` § 1 —
  `customFonts`/`customCode` sono già schematizzati dentro `app_settings.global_kit`; questa ADR non
  ne ridichiara la posizione nello schema, fissa la validazione di upload (§ 1) e l'algoritmo di
  iniezione (§ 2) che quel documento aveva rinviato: *"introducono un job di rigenerazione del CSS
  critico... questa ADR ne fissa solo la posizione nello schema, non l'implementazione del job,
  rinviata al round che la consuma"* (`ADR-77` § "Conseguenze").
- `ADR-78-sanitizzazione-css-e-sandbox-html.md` — `customCode` resta **non sanitizzato**, Admin+ come
  unico controllo (invariato, § 2 punto 5 sotto).
- `ADR-74-isole-js-pubbliche.md` § "Decisione" punto 4 — CSP con nonce per pagina: questa ADR estende
  l'uso del nonce già generato dal worker a un secondo consumer (`customCode`, § 2), senza modificare
  il meccanismo di generazione.
- `docs/ai/specs/SPEC-RUNTIME.md` § 6 — doppia iniezione header/`<meta>` del nonce, invariata.
- `ADR-8-storage-abstraction-files.md` — l'upload dei file `.woff2` riusa `FilesModule` esistente,
  nessuna astrazione di storage nuova.
- `ADR-18-ownership-per-riga.md` — precedente diretto per il principio "una regola non esprimibile
  come sola soglia di ruolo richiede un controllo aggiuntivo nel service", applicato qui al profilo
  `editorProfile` (§ 3) esattamente come applicato lì all'ownership.

## Assunzione di dominio coinvolta
**Questa ADR non introduce alcun nuovo ruolo RBAC.** `docs/business-rules.md` assunzione A4 (*"Si
riusano le 4 soglie di ruolo esistenti (SuperAdmin/Admin/Manager/User)... [scartata] Introdurre nuovi
ruoli dedicati (Editor, Autore, Revisore)... ✅ Confermata con correzione da ccurti il 2026-08-17:
nessun ruolo nuovo"*) resta **integralmente invariata**. Il § "Contesto" e il § "Decisione" punto 3
sotto spiegano esplicitamente come il requisito "Role Manager" del gap analysis (che nomina "Editor
Contenuti"/"Designer" come se fossero ruoli) sia risolto **senza** contraddire A4.

---

## Contesto

`docs/ELEMENTOR_PRO_GAP_ANALYSIS_v2.md` § 3 raggruppa in questo round tre funzionalità Pro distinte
ma tutte prive, oggi, di un algoritmo concreto oltre alla propria posizione nello schema:

1. **Custom Fonts**: `SPEC-GLOBAL-KIT.md` § 1 ha già dichiarato `CustomFontEntry` (`id, family,
   files: {woff2: mediaRef}[], weights`) e § 3 punto 4 l'emissione di blocchi `@font-face` — ma
   nessun documento ha ancora deciso **cosa succede quando un file caricato come "font" non è
   davvero un WOFF2 valido**, un controllo che l'estensione del nome file da sola non garantisce
   (`FilesModule` accetta oggi upload generici, senza un controllo di forma specifico per font).
2. **Custom Code**: `SPEC-GLOBAL-KIT.md` § 1 ha già dichiarato `CustomCodeEntry` (`location, priority,
   code, conditions`) e § 3 punto 5 ha già escluso la sua emissione dal foglio CSS del kit — ma nessun
   documento ha deciso **come** uno snippet Admin-scritto, non sanitizzato per principio (`ADR-78`),
   convive con la CSP a nonce già introdotta da `ADR-74` per `public-runtime.js`: uno script inline
   incollato da un Admin senza il proprio `nonce` verrebbe bloccato dal browser, un comportamento che
   nessun documento ha ancora previsto o spiegato.
3. **Role Manager**: il gap analysis lo descrive testualmente come *"ruolo 'content editor':
   inspector solo tab Contenuto"* e il piano operativo come *"'Editor contenuti' (solo tab Contenuto,
   nessun drag strutturale), 'Designer' (tutto tranne pubblicazione)"* — una formulazione che, letta
   alla lettera, chiederebbe due **nuovi ruoli**. Questo è in conflitto diretto con l'assunzione A4,
   già confermata con correzione esplicita il 2026-08-17 proprio per escludere ruoli dedicati
   aggiuntivi. Questa ADR risolve il conflitto **non** introducendo i due ruoli come soglie (violerebbe
   A4 senza un fatto nuovo che lo giustifichi — nessuna delle ADR di questo intero piano di parità
   Elementor ha mai proposto di riaprire A4), ma introducendo un **profilo ortogonale** alla soglia di
   ruolo esistente, che restringe le capacità **dentro** la soglia `User`/`Manager` già approvata —
   stesso principio già impiegato da `ADR-18` per l'ownership-per-riga: una regola che il solo
   confronto `authInfo.role <= soglia` non può esprimere non richiede un ruolo nuovo, richiede un
   controllo aggiuntivo nel service.

---

## Decisione

### 1. Custom Fonts — validazione dell'upload

`FilesModule` guadagna un controllo di forma **specifico**, invocato solo quando un upload dichiara
esplicitamente il proprio scopo come font (nuovo parametro `purpose: 'font'` sul multipart di upload
usato dalla UI di Site Settings § "Global Colors/Fonts", non un controllo generico su ogni upload —
un'immagine caricata come media ordinario non deve pagare il costo di un controllo che non le serve):

1. **Verifica magic bytes**, non estensione: un file WOFF2 valido inizia sempre con la firma `wOF2`
   (4 byte). Un upload dichiarato `purpose: 'font'` il cui contenuto non porta questa firma è
   rifiutato `400` — stesso principio "mai fidarsi dell'estensione dichiarata dal client" già
   implicito nella sanitizzazione DOM-based di `ADR-20`/`ADR-78` (mai un controllo puramente
   testuale/di superficie dove un controllo di contenuto è disponibile ed economico).
2. **Nessun altro formato ammesso**: TTF/OTF/WOFF (v1)/EOT sono esplicitamente **non** convertiti né
   accettati — un font "Custom" di questo CMS è sempre e solo WOFF2, coerente con
   `SPEC-GLOBAL-KIT.md` § 1 (`files: {woff2: mediaRef}`, un solo formato dichiarato nel tipo). Un
   operatore con un font in altro formato deve convertirlo prima del caricamento (fuori scope: nessuna
   pipeline di conversione lato server, che introdurrebbe una dipendenza pesante — es. `fonttools` —
   per un caso che l'ecosistema dei font-converter online già risolve senza costo per questo progetto).
3. **Limite di dimensione**: 2 MB per file (costante fissa, stesso principio "un solo uso sensato,
   nessun parametro configurabile" già scelto per i limiti di `kind: 'lottie'`, `ADR-86` § "Decisione"
   punto 4 — un singolo peso WOFF2 di un sottoinsieme di caratteri latini supera raramente qualche
   centinaio di KB; 2 MB copre ampiamente anche famiglie con più script, senza ammettere un file
   sospettosamente grande che potrebbe non essere davvero un font a fini legittimi).
4. **Nessuna sanitizzazione del contenuto oltre la verifica di forma**: a differenza di `kind: 'css'`/
   `kind: 'html'` (`ADR-78`), un file WOFF2 non è markup/codice eseguibile nel senso di quelle due
   superfici — è un formato binario di glifi, interpretato dal motore di rendering dei font del
   browser, non dal motore JS. Nessun parser applicativo del contenuto oltre alla verifica dei magic
   bytes è richiesto o introdotto da questa ADR.
5. **Emissione `@font-face`**: invariata da `SPEC-GLOBAL-KIT.md` § 3 punto 4 (un blocco per peso
   dichiarato in `weights`, `src: url(<path risolto>) format('woff2')`) — questa ADR non ne modifica
   l'algoritmo, ne chiude solo il prerequisito di validazione a monte.

Nessun endpoint nuovo: l'upload resta `POST app/files` esistente, con il parametro `purpose` additivo;
il riferimento al file risultante entra in `global_kit.customFonts[].files.woff2` tramite il `PUT
app/settings/global-kit` già deciso da `SPEC-GLOBAL-KIT.md` § 2.

### 2. Custom Code — algoritmo di iniezione e placeholder di nonce

#### 2.1 Ordine e posizione di iniezione (worker `static-export`)

Per ogni pagina compilata, il worker raccoglie i `customCode` (`app_settings.global_kit.customCode`,
`SPEC-GLOBAL-KIT.md` § 1) le cui `conditions` (`kind: 'conditions'`, riusate identiche, terzo consumer
dopo Popup — `SPEC-POPUP.md` — e Theme Builder — `ADR-88`) corrispondono alla pagina corrente,
raggruppati per `location` (`head`/`bodyStart`/`bodyEnd`), ordinati per `priority` **ascendente**
all'interno dello stesso `location` (valore più basso iniettato per primo — convenzione scelta per
coerenza con l'uso di "priorità" come "quanto presto" già impiegato da `ADR-53`/`ADR-84` per l'ordine
del breadcrumb/dock, non "quanto importante"). Punto di iniezione nel documento: `head` → subito
prima di `</head>`; `bodyStart` → subito dopo l'apertura di `<body ...>`; `bodyEnd` → subito prima di
`</body>` — stessa terminologia già usata da `SPEC-GLOBAL-KIT.md` § 1, qui resa un algoritmo concreto
di stringa (nessun parser HTML del documento ospite: un'iniezione per sostituzione di marker
testuale, il documento pubblico è generato dal CMS stesso, la posizione dei tre marker è nota per
costruzione).

#### 2.2 Nonce — placeholder testuale, mai un parser HTML del contenuto Admin

`code` (la stringa scritta dall'Admin) **non è mai analizzata o riscritta come markup**: nessun
parser HTML applicato al contenuto Admin-trusted, coerente con "nessuna sanitizzazione HTML...
resta Admin+ come unico controllo" (`ADR-77` § "Decisione" punto 6, invariato). Il worker applica una
**singola sostituzione testuale letterale**: ogni occorrenza della stringa `{{cms_nonce}}` dentro
`code` è sostituita col nonce generato per quella specifica pagina (lo stesso valore già usato da
`SPEC-RUNTIME.md` § 6 per `public-runtime.js`, riusato identico — un solo nonce per pagina per build,
mai un secondo nonce per una superficie diversa). L'Admin che scrive un tag `<script>` (inline o con
`src=`) destinato a eseguire sotto la CSP a nonce di quella pagina **deve** includere
`nonce="{{cms_nonce}}"` nel proprio markup:

```html
<script nonce="{{cms_nonce}}">
  console.log('snippet personalizzato');
</script>
```

Uno `<script>` senza questo placeholder viene iniettato **as-is** (invariato, nessuna riscrittura
automatica) e sarà bloccato dal browser sotto la CSP `script-src 'self' 'nonce-<valore>'` già
imposta da `ADR-74` § "Decisione" punto 4 — comportamento **documentato esplicitamente** nell'editor
di Custom Code (un avviso permanente accanto al campo `code`, non un errore di validazione: uno
snippet senza `<script>` — es. un tag `<meta>` di verifica proprietà di un servizio esterno, un
`<link rel="preconnect">` — non ha bisogno del nonce e resta perfettamente valido). Questa è una
scelta di responsabilità deliberata: automatizzare l'iniezione del nonce richiederebbe un parser HTML
del contenuto Admin (fragile su markup malformato, e un parser che modifica silenziosamente un
contenuto che l'Admin ha scritto esplicitamente contraddice il principio "mai persistere/emettere un
valore diverso da quello scritto" già affermato da `ADR-78` § "Decisione" punto 6 per `kind: 'css'`)
— l'Admin resta l'unico controllo su questa superficie (`ADR-77`), inclusa la responsabilità di
rendere il proprio script eseguibile sotto la policy del sito.

`{{cms_nonce}}` è l'unico placeholder introdotto da questa ADR: nessun secondo token per altri
scopi (es. l'URL base del sito, già disponibile all'Admin come testo statico da scrivere a mano — un
Custom Code non ha lo stesso bisogno di portabilità fra ambienti che ha un template di blocco, quindi
non eredita l'elenco di Dynamic Tags di `ADR-87`).

#### 2.3 Nessuna modifica alla generazione del nonce

Il nonce resta generato una volta per pagina per build da `ADR-74`/`SPEC-RUNTIME.md` § 6, indipendente
dalla presenza di `customCode`: una pagina senza alcun `customCode` applicabile non cambia
comportamento rispetto a oggi (il nonce esiste già per `public-runtime.js` quando quel bundle è
incluso, o non esiste affatto quando né `customCode` né alcun modulo runtime sono richiesti — in
quel caso una pagina con `customCode` che referenzia `{{cms_nonce}}` senza alcun modulo runtime
attivo **forza** comunque la generazione del nonce e l'emissione della CSP per quella pagina, anche se
`meta.runtime` è vuoto: § 2.4 sotto).

#### 2.4 Interazione con `meta.runtime` vuoto

`SPEC-RUNTIME.md` § 5.2 punto 5 stabilisce che una pagina senza alcun modulo runtime attivo non riceve
alcun tag `<script>` né, implicitamente, alcuna CSP a nonce. Questa ADR introduce l'unica eccezione a
quella regola: se la pagina ha almeno un `customCode` applicabile con `location`/`code` non vuoti
(indipendentemente da `meta.runtime`), il worker genera comunque un nonce e la relativa CSP —
motivato dal fatto che un Custom Code può contenere script arbitrari indipendenti dal bundle del CMS,
e la pagina deve poter proteggerli con la stessa policy. Il test snapshot "nessuna sottostringa
`<script` per una pagina senza `meta.runtime`" di `SPEC-RUNTIME.md` § 5.3 resta valido **solo** per
pagine senza alcun `customCode` — questa ADR ne dichiara esplicitamente l'eccezione, non lo
contraddice silenziosamente.

### 3. Role Manager — profilo `editorProfile`, nessun nuovo ruolo (A4 invariata)

#### 3.1 Perché un profilo e non un ruolo

Il requisito del gap analysis ("Editor Contenuti" può editare solo Contenuto, mai Stile/struttura;
"Designer" può editare tutto tranne pubblicare) descrive due **restrizioni** applicate a un utente che
altrimenti avrebbe accesso più ampio — non due nuovi livelli di privilegio nella scala
SuperAdmin→Admin→Manager→User (dove numero minore = privilegio maggiore, `business-rules.md` riga
413-420). Un ruolo nuovo dovrebbe inserirsi in quella scala con un proprio numero e una propria
posizione relativa a tutte le 16 righe della matrice di `business-rules.md` § "Permessi editoriali" —
esattamente il costo che A4 ha già rifiutato esplicitamente. Una **restrizione ortogonale**, applicata
sopra `User`/`Manager` esistenti, risolve lo stesso requisito senza toccare quella matrice per le 14
righe che "Editor Contenuti"/"Designer" non riguardano.

```typescript
// schema.ts — colonna aggiunta a userEntity, additiva, nullable
editorProfile: varchar('editor_profile', { length: 20 }), // null | 'content' | 'designer'
```

`null` (default, invariato per ogni utente esistente): nessuna restrizione oltre alla soglia di
ruolo ordinaria — comportamento **identico** a oggi per ogni utente che non ha mai impostato questo
campo, nessuna migrazione di comportamento silenziosa. `editorProfile` è **impostabile solo** su un
utente con `role` `User` o `Manager` (un tentativo di impostarlo su `Admin`/`SuperAdmin` è rifiutato
`400` a livello di DTO — un SuperAdmin/Admin non ha senso "restretto a solo Contenuto", la
restrizione esiste per profilare collaboratori di livello editoriale, non l'amministrazione del
sistema).

#### 3.2 `editorProfile: 'content'` — "Editor Contenuti"

Un utente `User`/`Manager` con questo profilo:
- **Può** modificare il valore di ogni prop di `kind` `plainText`/`richText`/`mediaRef`/`url`/`link`
  di un nodo **già esistente** nell'albero (compilare testo, sostituire un'immagine, cambiare la
  destinazione di un link) — lo stesso sottoinsieme di `kind` già dichiarato "dinamizzabile" da
  `docs/SPEC-propkind-v2.md` § 3.17, riusato qui come "sottoinsieme di contenuto puro" per la stessa
  ragione con cui quel documento li ha scelti (sono le prop il cui significato è editoriale, non di
  design).
- **Non può**: modificare qualunque prop di Stile/Avanzato (colore, spaziatura, tipografia,
  background, `css`, ecc.), aggiungere/rimuovere/spostare/duplicare nodi nell'albero, inserire da
  palette o da libreria Template, modificare Site Settings/Global Kit/Custom Code/Custom Fonts,
  modificare lo schema di una Collezione, creare/modificare Template o Theme Template.
- **Applicazione UI** (advisory, non l'unico controllo — § 3.4): l'inspector monta **solo** il tab
  Contenuto (Stile/Avanzato non compaiono affatto, non semplicemente disabilitati — coerente con
  "un contenuto non editabile non deve sembrare editabile", già il principio scelto da `ADR-84` § 4
  punto 2 per l'anteprima di Revisione), il Navigator/la palette non montano azioni di
  inserimento/rimozione/drag, la Floating Toolbar non mostra "Duplica"/"Elimina"/"Sposta".

#### 3.3 `editorProfile: 'designer'` — "Designer"

Un utente `Manager` (il profilo non ha effetto aggiuntivo su un `User`, che già non può pubblicare
per soglia di ruolo — § 3.1, "restrizione ortogonale sopra un accesso più ampio") con questo profilo:
- Eredita **tutte** le capacità di Contenuto/Stile/struttura di un `Manager` ordinario (nessuna
  restrizione sull'editing) — la differenza rispetto a un `Manager` senza profilo è **solo**
  sottrattiva sulle due righe seguenti.
- **Non può**: "Pubblicare / programmare / archiviare" una Pagina, "Ripristinare una Revisione
  passata" — le due righe che `business-rules.md` § "Permessi editoriali" riga 122/123 riserva a
  Manager+ e che un `Manager` con `editorProfile: 'designer'` perde, tornando al comportamento `❌`
  già definito per `User` su quelle stesse due righe (nessun terzo stato inventato: il `Designer`
  eredita esattamente il valore che la matrice esistente già assegna a `User` per queste due azioni,
  non un nuovo `⚠️`/parziale).

#### 3.4 Enforcement — controllo server-side, non solo UI

Coerente con `ADR-18` (l'ownership-per-riga "non è esprimibile come soglia di ruolo... serve un
controllo... eseguito nel service"), la UI ristretta del § 3.2/3.3 è **advisory**: l'autorità resta
il backend.

1. **Per `'designer'`**: i due endpoint già esistenti (`PATCH .../publish` o equivalente,
   `POST .../revisions/:guid/restore`) guadagnano un predicato aggiuntivo composto dopo il guard di
   soglia esistente — `authInfo.role <= Manager && authInfo.editorProfile !== 'designer'` — stesso
   principio "i guard compongono, non si duplicano" già in uso per `GuardSuperAdmin`/`GuardAdmin`/
   `GuardManager` (`business-rules.md` riga 418-420): nessuna nuova classe di guard, un predicato in
   più nella stessa catena.
2. **Per `'content'`**: introduce un controllo nuovo, perché la restrizione non è "un'azione
   intera vietata" (come publish/restore) ma "una **parte** del payload di una `PATCH` ordinaria
   vietata" — un nuovo servizio, `ContentOnlyDiffGuard`, invocato da `PagesService`/
   `BlockTreeValidatorService` **prima** della validazione ordinaria quando `authInfo.editorProfile
   === 'content'`:
   - Confronta l'albero in arrivo (`draftContent` proposto) con l'albero attualmente persistito,
     nodo per nodo, in un solo attraversamento parallelo (stesso principio "un solo visitatore
     ricorsivo condiviso" già richiesto per `remapGuidReferences`, `ADR-89` § 4 punto 4).
   - **Rigetta `403`** (non `400`: è un'autorizzazione negata, non un errore di forma) se una
     qualunque delle seguenti condizioni è vera in un punto qualsiasi dell'albero: numero di figli
     diverso in un nodo corrispondente, `type` diverso in una posizione corrispondente, ordine dei
     figli diverso, un nodo presente in un albero e assente nell'altro (aggiunta/rimozione).
   - Se la **forma** dell'albero è identica (stesso principio del punto precedente, verificato per
     primo perché è il controllo più economico), confronta `props` nodo per nodo: per ogni chiave la
     cui `PropSpec.kind` registrato **non** appartiene al sottoinsieme del § 3.2 (`plainText|
     richText|mediaRef|url|link`), il valore deve essere **byte-per-byte identico** al valore
     persistito — una differenza produce `403` col `path` della prop colpevole (stesso formato di
     errore con `path` già in uso per gli errori `400`, qui applicato a un `403`).
3. Un `User`/`Manager` con `editorProfile: null` non subisce **alcun** controllo aggiuntivo da questo
   servizio (il controllo si attiva solo se `editorProfile === 'content'`) — nessun costo di
   attraversamento aggiuntivo per la maggioranza degli utenti.

#### 3.5 Matrice riassuntiva

| Azione | `editorProfile: null` (invariato) | `'designer'` (solo su Manager) | `'content'` (User/Manager) |
|---|---|---|---|
| Modificare prop Contenuto (`plainText`/`richText`/`mediaRef`/`url`/`link`) di un nodo esistente | soglia di ruolo esistente | soglia di ruolo esistente | ✅ |
| Modificare prop Stile/Avanzato | soglia di ruolo esistente | soglia di ruolo esistente | ❌ (`403`) |
| Aggiungere/rimuovere/spostare/duplicare blocchi | soglia di ruolo esistente | soglia di ruolo esistente | ❌ (`403`) |
| Creare/modificare Template, Theme Template, schema Collezione, Site Settings/Custom Code/Fonts | soglia di ruolo esistente | soglia di ruolo esistente | ❌ (soglia di ruolo comunque insufficiente per `User`; per un `Manager` con questo profilo, non previsto — § 3.1 nota) |
| Pubblicare / programmare / archiviare una Pagina | soglia di ruolo esistente (Manager+) | ❌ (anche se `role: Manager`) | invariato per soglia (`User` già `❌`) |
| Ripristinare una Revisione passata | soglia di ruolo esistente (Manager+) | ❌ (anche se `role: Manager`) | invariato per soglia |

`editorProfile: 'content'` su un `Manager` non è un caso vietato ma è un profilo pensato
primariamente per `User` (un collaboratore che compila solo testi/immagini): un `Manager` con questo
profilo perde comunque tutte le capacità di Stile/struttura/pubblicazione **proprie del Manager**
oltre a quanto già negato a `User` per soglia — la tabella sopra si legge come "il più restrittivo fra
la soglia di ruolo e il profilo", mai il contrario.

### 4. Endpoint

Nessun endpoint nuovo per Custom Fonts/Custom Code (riuso di `app/files` e `app/settings/global-kit`
già decisi da `SPEC-GLOBAL-KIT.md`). `editorProfile` è un campo additivo su
`PATCH app/admin/users/:guid` (endpoint di gestione utenti esistente) — **Guard**: `GuardAdmin`
(Admin+, stessa soglia già in vigore per ogni altra modifica ai dati di un utente).

---

## Alternative valutate

| Opzione | Pro | Contro | Motivo scarto |
|---|---|---|---|
| Due nuovi ruoli RBAC ("Editor Contenuti"/"Designer") con soglie numeriche proprie | Lettura testuale del gap analysis presa alla lettera | Contraddice A4 (`business-rules.md`), confermata con correzione esplicita 2026-08-17 proprio per escludere questo caso, senza un fatto nuovo che ne giustifichi la riapertura | Violazione diretta di un'assunzione di dominio già chiusa |
| `editorProfile` come terza dimensione dentro il numero di ruolo stesso (es. ruoli 21/22 accanto a 20=Manager) | Nessuna colonna nuova | Rompe l'invariante "numero minore = privilegio maggiore" su una scala pensata per gerarchia verticale, non per varianti orizzontali dello stesso livello; i guard esistenti (`<=` soglia) smetterebbero di funzionare senza riscriverli tutti | Un profilo ortogonale è un concetto diverso da un livello di privilegio, non va forzato nella stessa colonna |
| Enforcement di `'content'` solo lato UI (nessun `ContentOnlyDiffGuard` server-side) | Nessun nuovo servizio da scrivere | Un utente `content` potrebbe comunque inviare una `PATCH` costruita a mano con modifiche di Stile/struttura, bypassando la sola UI — controllo di accesso illusorio | Coerente col principio generale del progetto: l'autorità è sempre server-side (`ADR-56`, `ADR-18`, ogni altro controllo di questo repository) |
| Nonce auto-iniettato via parser HTML del Custom Code | L'Admin non deve ricordarsi il placeholder | Un parser HTML su contenuto Admin-trusted introdurrebbe una riscrittura silenziosa di ciò che l'Admin ha scritto, contraddicendo "mai persistere/emettere un valore diverso da quello scritto" già stabilito per `kind: 'css'` (`ADR-78`); fragile su markup malformato | Il placeholder esplicito è più semplice, più prevedibile, e coerente col principio "l'Admin resta l'unico controllo" già affermato per questa superficie |
| Conversione automatica TTF/OTF→WOFF2 lato server all'upload | Nessuna richiesta di conversione manuale all'operatore | Introduce una dipendenza pesante (libreria di conversione font) per un caso che strumenti esterni già risolvono; fuori dal principio "nessuna libreria pesante senza necessità" | Costo di dipendenza non giustificato da un requisito che chiede solo il supporto WOFF2 |

---

## Conseguenze

- `FilesModule` guadagna un controllo di forma dedicato (`purpose: 'font'` → verifica magic bytes
  `wOF2`, limite 2 MB) — nessuna nuova dipendenza, nessun nuovo endpoint.
- Il worker `static-export` guadagna l'algoritmo di iniezione `customCode` (§ 2.1) e l'eccezione alla
  regola "nessun nonce senza `meta.runtime`" (§ 2.4) — impatto misurabile contro l'NFR di `ADR-53`,
  stesso principio di ogni altro stadio aggiunto al worker in questo round.
- `users` guadagna una colonna additiva (`editorProfile`, nullable, default `null`) — nessuna
  migrazione di comportamento per gli utenti esistenti.
- Un nuovo servizio, `ContentOnlyDiffGuard`, invocato solo per utenti con `editorProfile: 'content'`
  — costo zero per la maggioranza degli utenti (`editorProfile: null`).
- I due guard di pubblicazione/ripristino Revisione guadagnano un predicato aggiuntivo composto
  (`editorProfile !== 'designer'`) — nessuna nuova classe di guard.
- L'inspector frontend guadagna la logica condizionale di montaggio dei tab in base a
  `editorProfile` (dettaglio di implementazione non vincolato oltre al comportamento del § 3.2).
- Nessuna modifica a `docs/business-rules.md` § "Permessi editoriali" (la matrice a 16 righe resta
  identica: il profilo si applica *sopra* di essa, non la modifica).

## Conformità

- Test: un upload `purpose: 'font'` il cui contenuto non inizia con la firma `wOF2` è rifiutato `400`,
  indipendentemente dall'estensione dichiarata dal client.
- Test: un file oltre 2 MB con `purpose: 'font'` è rifiutato `400`.
- Test di iniezione Custom Code: uno snippet con `{{cms_nonce}}` in un `<script>` riceve, nell'HTML
  esportato, lo stesso nonce presente nell'header/`<meta>` CSP di quella pagina; uno snippet senza il
  placeholder è iniettato invariato (nessuna riscrittura).
- Test eccezione § 2.4: una pagina con `customCode` applicabile ma `meta.runtime` vuoto genera
  comunque nonce e CSP, in deroga esplicita al test snapshot di `SPEC-RUNTIME.md` § 5.3 — la
  deroga è verificata con un test dedicato, il test originale resta verde per le pagine senza
  `customCode`.
- Test `editorProfile: 'designer'`: un `Manager` con questo profilo riceve `403` su
  publish/schedule/archive/restore-revision, `200` su ogni altra azione di editing già ammessa a
  Manager.
- Test `editorProfile: 'content'`: una `PATCH` che modifica solo un `plainText`/`mediaRef` di un nodo
  esistente è accettata; una `PATCH` che aggiunge un nodo, ne rimuove uno, ne cambia l'ordine, o
  modifica una prop di Stile è respinta `403` con il `path` del punto di divergenza.
- Test di non regressione: un utente con `editorProfile: null` (ogni utente esistente prima di questa
  ADR) non subisce alcun cambiamento di comportamento su nessuna delle azioni della matrice.
- Test RBAC: un `PATCH app/admin/users/:guid` che tenta di impostare `editorProfile` su un utente
  `Admin`/`SuperAdmin` è rifiutato `400`; lo stesso campo su un `User`/`Manager` è accettato solo da
  un chiamante Admin+.

---

## Decisione umana

**Esito**: [ ] Approvato così com'è · [ ] Approvato con modifiche (vedi note) · [ ] Rifiutato ·
[ ] Rinviato

**Approvato da**: _______________ · **Data**: _______________

**Note**:
