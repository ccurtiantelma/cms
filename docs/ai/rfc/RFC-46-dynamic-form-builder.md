# RFC-46 — Dynamic Form Builder: blocchi form nel Canvas, Invii e superficie pubblica compatibile SSG

## Status
[ ] In discussione · [x] Approvato → genera ADR-46 · [ ] Rifiutato

## Proposto da
AI Orchestrator (ruolo: Senior Backend & System Architect EAIDOS) · Data: 2026-09-01

---

## Problema

Un task esterno chiede il motore di creazione Form (composizione visiva nel Canvas: campi
`text`/`email`/`select`/`textarea`/`checkbox`/pulsante di invio) e l'elaborazione sicura
degli Invii, con un endpoint pubblico disaccoppiato `/api/public/forms/:formId/submit`
compatibile con siti esportati staticamente, protetto da CORS, rate limiting e una difesa
anti-spam "headless" (Honeypot + HMAC).

Il controllo documentale preliminare (`CLAUDE.md` § Anti-hallucination) mostra che questa
**non è una feature isolata**: tocca direttamente cinque decisioni già scritte, non di
striscio.

1. **`docs/roadmap.md` § F10** dipende da F02 (registro blocchi) e F03 (superficie
   pubblica) — entrambe chiuse — ed è l'unica feature del pilastro 3 ancora "Da avviare".
   `docs/business-rules.md` § Moduli di contatto e § Entità di contenuto definiscono già
   **Modulo di contatto** e **Invio** come entità di dominio, con sette regole vincolanti
   (validazione sempre server-side, persistenza dell'Invio prima di qualsiasi notifica,
   email solo da coda BullMQ con destinatari **mai** dal payload client, honeypot +
   rate-limit IP + marca temporale minima, dati personali mai loggati per intero, Invio
   cancellabile solo con soft delete, Modulo con Invii non eliminabile — solo disattivato).

2. **`ADR-21` § 5 ha già nominato questo momento**: *"Il blocco form è di F10"* — il tipo
   `form` è dichiarato fuori scope del primo rilascio ma non imprevisto. Ne segue che
   introdurlo qui è la naturale settima approvazione del registro (dopo `container`,
   ADR-39), non un'eccezione: si applica lo stesso § 5, *"Un sesto tipo è nuovo tipo di
   blocco ai fini di `CLAUDE.md` § Ask first: entra solo con una nuova firma"* — e questa
   RFC ne propone più di uno, quindi più firme nello stesso ADR conseguente (§ Decisione
   umana).

3. **`ADR-22` § Conseguenza ha già scritto, per nome, il vincolo che rende questo task
   diverso da un CRUD qualunque**: *"Il sito pubblico non ha JavaScript: ogni interattività
   futura (**form di F10**, chatbot di F11) è un'isola da introdurre con la sua decisione,
   non un'aggiunta naturale."* Il task esterno non menziona questo vincolo, ma la
   Constitution è tassativa: `app/public-site` (e per estensione l'export statico di
   ADR-45) non idrata nulla e non esegue script. Una "marca temporale minima di
   compilazione" (business rules § Moduli di contatto, punto 5) presuppone un timestamp
   catturato **per visita**: su una pagina SSR quel timestamp può essere iniettato dal
   server a ogni richiesta, ma su una pagina **esportata staticamente** (ADR-45, ora il
   percorso di produzione per il traffico pubblico) l'HTML è identico per ogni visitatore
   fino al prossimo export — un timestamp di render non misura più nulla di significativo.
   Questa RFC non lo ignora né lo aggira in silenzio: lo tratta come punto di firma (§
   Decisione umana, N6).

4. **`ADR-45`/`RFC-44` hanno appena spostato il traffico pubblico di produzione fuori da
   Node/Nginx-diretto verso file statici serviti da Nginx/CDN, potenzialmente su un dominio
   diverso da `PUBLIC_SITE_URL`.** L'endpoint di submit, per definizione, resta
   un'eccezione — è l'unico punto in cui il sito esportato deve tornare a parlare con
   `app/backend` — e la policy CORS attuale (`main.ts:36`, allowlist fissa
   `[frontendUrl, publicSiteUrl]` + host di sviluppo locale) non contempla un dominio di
   pubblicazione statica arbitrario. Va deciso esplicitamente, non esteso per inerzia (§
   Decisione D5).

5. **`docs/non-functional-requirements.md`** ha già previsto la voce (riga 85): *"rate
   limiting... separato e più stringente... sull'invio dei moduli di contatto"* — questa
   RFC eredita quel target, non ne propone uno nuovo.

**Le premesse del task sono corrette**: un CMS "a pagine" senza moduli di contatto non
compete con l'obiettivo dichiarato di "super clone Elementor/WordPress" (`CLAUDE.md` §
Identità). Il problema non è se costruirlo, ma che il task lo descrive come se la
superficie pubblica fosse ancora quella SSR di F03/ADR-22 — quando F03 e la sua evoluzione
SSG (ADR-45) hanno già cambiato le regole del gioco per qualunque endpoint pubblico nuovo.

---

## Obiettivi

- Composizione visiva di un Form nel Canvas (blocchi di campo + pulsante di invio),
  riusando il registro di ADR-21/ADR-39, zero rottura dei cinque tipi + `container` già
  approvati.
- Elaborazione sicura di un Invio: persistenza sempre prima della notifica, validazione
  server-side integrale contro la composizione realmente pubblicata (mai contro un payload
  che il client dichiara di rispettare).
- Endpoint pubblico disaccoppiato, funzionante sia dal preview SSR (ADR-25) sia da un sito
  esportato staticamente (ADR-45), senza introdurre una seconda verità sui campi ammessi.
- Difesa anti-spam adeguata all'assenza di sessione/CSRF classico di un consumer statico.
- Nessuna tabella di stato per la definizione del Modulo — solo `form_submissions`, come
  esplicitamente delimitato dal task; la configurazione operativa (destinatari, notifica)
  riusa `app_settings`, già presente.

---

## Soluzione proposta

### D1 — Schema blocchi: tre tipi nuovi, non sei

Il task elenca sei "campi" (`text`, `email`, `select`, `textarea`, `checkbox`, pulsante di
invio) come se fossero sei tipi di blocco. `ADR-21` § Conseguenza è esplicita sul costo:
*"un tipo di troppo va mantenuto e migrato per sempre"*. Sei tipi quasi identici (stesso
scheletro `name`/`label`/`required`/`placeholder`, solo `fieldType` cambia) pagherebbero
sei catene di migrazione per una sola differenza di enum. Si propone il pattern già in uso
per `container` (ADR-39, un tipo flessibile invece di N tipi di layout specifici):

| Tipo nuovo | Ruolo | Props principali |
|---|---|---|
| `form` | Contenitore, `children.allow: ['form-field', 'form-submit']` | `formKey` (`plainText`, obbligatoria, stabile — vedi D2) |
| `form-field` | Un singolo campo di input | `fieldType` (`enum`: `text`\|`email`\|`textarea`\|`select`\|`checkbox`), `name` (`plainText`, identificatore stabile del campo nel payload), `label` (`plainText`), `required` (`boolean`), `placeholder` (`plainText`, opzionale), `options` (array di `plainText`, usato solo se `fieldType: 'select'`) |
| `form-submit` | Pulsante di invio | `label` (`plainText`, default "Invia") |

`form-submit` resta un tipo a sé e **non** riusa `button` (che ha `href` obbligatoria,
ADR-21 § 5 — un submit non collega a nessuna URL): riusarlo forzando `href` opzionale
significherebbe incrementare il `v` di un tipo già approvato e usato in produzione,
obbligando alla migrazione di ogni nodo `button` esistente in ogni Pagina e Revisione mai
scritta (ADR-21 § 1, *"un incremento di `v` è un deploy a senso unico"*) per un beneficio
nullo. Un tipo nuovo isolato costa meno del rischio.

`form` non contiene `section`/`container`/altro `form` (nessun form annidato — un
`children.allow` chiuso a soli `form-field`/`form-submit`, stesso principio "profondità 1
per costruzione" di `section` in ADR-21 § 5).

### D2 — Modulo di contatto: composizione pubblica nel block tree, configurazione privata in `app_settings`

Le business rules definiscono il Modulo come *"riusabile in più Pagine"* e con
*"destinatari... definiti nella configurazione del Modulo"*. Qui c'è un vincolo di
sicurezza che il testo del task non nomina: la composizione di un blocco `form` vive dentro
`draftContent`/`publishedContent` (`jsonb` della Pagina), che l'endpoint pubblico di
lettura (`GET public/pages`, F03) **serve integralmente al client per il rendering**. Se i
destinatari delle notifiche fossero una prop del blocco `form`, sarebbero esposti nella
risposta JSON pubblica della Pagina — una fuga di indirizzi email, non ipotetica: è
esattamente la superficie che la regola *"mai presi da un campo del payload client"* vuole
escludere dal lato client, ma quella regola parla della sottomissione, non copre la lettura
pubblica del contenuto se il dato finisse per sbaglio in una prop.

Si separano quindi due piani, mai mescolati:

- **Composizione visiva** (campi, etichette, obbligatorietà) — dati pubblici per
  costruzione (servono a renderizzare il form), vivono nei blocchi `form`/`form-field`/
  `form-submit` della Pagina, copiati per Pagina come ogni altro blocco (nessun
  meccanismo di riferimento condiviso come le Sezioni globali: se lo stesso form compare
  su più Pagine, oggi se ne ricompone la struttura in ciascuna, esattamente come un
  Template — F06 — viene copiato e non referenziato). Se in futuro servirà un Modulo
  davvero condiviso fra Pagine con un solo punto di modifica, è lo stesso pattern di
  Sezione globale (F06) applicato a `form`: fuori scope qui, per non introdurre due
  meccanismi di condivisione diversi nella stessa RFC.
- **Configurazione operativa** (destinatari, oggetto email di notifica) — **mai** in una
  prop di blocco. Riusa `app_settings` (tabella già presente, `appSettingEntity`,
  `app/backend/src/db/schema.ts:103`), chiave `form:<formKey>:settings`, valore `jsonb`:
  `{ recipients: string[], notifySubject: string }`. Nessuna tabella nuova oltre
  `form_submissions` — coerente con l'ambito che il task stesso delimita nella sezione
  "Modello Dati & Schemi". `formKey` (prop `plainText` obbligatoria su `form`, D1) è
  l'identificatore editoriale stabile: **non** l'`id` del nodo nell'albero (che
  `duplicateSubtree`, F04c § T7, rigenera a ogni duplicazione — usarlo romperebbe il
  collegamento a `app_settings` e agli Invii storici alla prima duplicazione del blocco).
  Un `formKey` duplicato su due blocchi `form` diversi della stessa Pagina o di Pagine
  diverse è **ammesso** e intenzionale in questo round: significa "stessa configurazione di
  invio, stesso raggruppamento di Invii" — è la forma minima di riuso senza costruire il
  meccanismo di riferimento di F06. Un `formKey` mai configurato in `app_settings` fa
  fallire l'invio con errore esplicito in fase di editing (avviso, non blocco a
  salvataggio — coerente con "editor non blocca mai sulla configurazione operativa", stesso
  principio della checklist SEO consultiva).

### D3 — `form_submissions`: forma ibrida, non l'entità mutabile completa

Le business rules richiedono soft delete dell'Invio (quindi serve `isActive`, a differenza
di `audit_log`/`page_revisions` append-only) ma il "creatore" è un **visitatore anonimo**,
mai un utente autenticato — lo stesso problema già risolto da `analytics_events`
(`app/backend/src/db/schema.ts:469`, `createdBy` nullable, scrittura da middleware
pubblico). Si applica lo stesso pattern:

```ts
export const formSubmissionEntity = pgTable('form_submissions', {
  id: serial().notNull().primaryKey(),
  guid: char('guid', { length: 16 }).notNull().$defaultFn(() => Utils.randomString(16)),
  formKey: varchar('form_key', { length: 100 }).notNull(),
  pageId: integer('page_id').references(() => pageEntity.id, { onDelete: 'restrict', onUpdate: 'restrict' }).notNull(),
  payload: jsonb('payload').notNull(),
  ipHash: char('ip_hash', { length: 64 }).notNull(),
  userAgent: varchar('user_agent', { length: 500 }),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy: integer('created_by').references(() => userEntity.id, { onDelete: 'restrict', onUpdate: 'restrict' }), // sempre null: scrittura pubblica anonima
  updatedBy: integer('updated_by').references(() => userEntity.id, { onDelete: 'restrict', onUpdate: 'restrict' }), // valorizzato solo dal soft delete editoriale
}, (t) => [
  index('form_submissions_form_key_idx').on(t.formKey, t.createdAt),
  index('form_submissions_page_idx').on(t.pageId),
  uniqueIndex('form_submissions_guid_idx').on(t.guid),
]);
```

`ipHash` **mai** l'IP grezzo: riuso letterale del pattern già approvato in
`app/backend/src/analytics/visitor-hash.util.ts` (SHA-256, salt che ruota ogni giorno UTC
da `AppConstants.analyticsSaltSecret`), non un meccanismo nuovo — stessa motivazione GDPR/
zero-cookie. `payload` è il JSON dei valori sottomessi, chiave = `form-field.name`; nessun
campo del payload è mai eseguito, interpretato o usato per instradare l'email (i
destinatari vengono solo da `app_settings`, D2). `pageId` (non lo slug, che può cambiare)
ancora l'Invio alla Pagina che lo ha generato, per la vista "Invii per Pagina" di F12.

### D4 — Endpoint pubblico: `POST api/v1/public/forms/:formId/submit`, validazione ri-derivata dal pubblicato

`:formId` nell'URL **è** `formKey` (D2) — il task lo chiama `formId`, qui si dichiara
esplicitamente l'equivalenza per evitare un secondo identificatore. Handler, in ordine:

1. Anti-spam (D6) — honeypot, HMAC, rate limit — **prima** di qualunque accesso al
   database: uno spammer non deve costare una query.
2. Risoluzione: cerca fra le Pagine `published` un blocco `form` con quel `formKey`
   (indicizzabile: il registro dei form attivi si ricalcola a ogni pubblicazione, non a
   ogni submit — dettaglio di implementazione per il piano, non per questa RFC). Nessun
   match → `404`, mai `403` (stessa regola generale della superficie pubblica,
   `constitution.md` § Security Policy specifica del CMS).
3. **Validazione contro la composizione realmente pubblicata**, non contro uno schema
   dichiarato dal client: si estrae l'elenco `form-field` figli del blocco `form` trovato
   (dalla stessa pipeline migrazione→validazione di F02, mai un parsing parallelo), si
   verifica che il payload contenga esattamente i `name` attesi, i `required` rispettati,
   `select`/`checkbox` nei valori ammessi. Un campo in più o mancante → `400`. Questo è
   ciò che rende impossibile per un bot inventare un `formId` con campi arbitrari: il
   server non si fida mai della forma dichiarata dal client, solo di quella che l'editor ha
   davvero pubblicato — stesso principio dell'albero blocchi (business rules § Blocchi,
   punto 4).
4. Persistenza dell'Invio (D3) — **sempre**, prima di qualunque tentativo di notifica
   (business rules § Moduli di contatto, punto 3): un fallimento SMTP non deve mai perdere
   la sottomissione.
5. `EmailQueueService.enqueueEmail(...)` (D8) con i destinatari letti da `app_settings`
   (D2), mai dal payload.
6. Risposta generica di successo, senza echo del payload (coerente con "dati personali mai
   loggati per intero" — lo stesso principio si applica alla risposta).

### D5 — CORS: eccezione scoped alla sola rotta di submit

La policy globale (`main.ts:40`, `app.enableCors(...)`) resta **invariata** — allowlist
fissa `[frontendUrl, publicSiteUrl]` + host di sviluppo, `credentials: true` per i cookie di
sessione admin. Estenderla a `origin: '*'` per accogliere un sito esportato staticamente
(ADR-45, dominio di pubblicazione non necessariamente noto a build time del backend)
indebolirebbe CORS su **ogni** rotta autenticata, non solo su questa.

Si propone un middleware dedicato, applicato **solo** al path
`api/v1/public/forms/:formId/submit`, che risponde `Access-Control-Allow-Origin: *` e
**`Access-Control-Allow-Credentials` mai impostato** (la sottomissione è anonima, nessun
cookie httpOnly di sessione attraversa questa rotta — un wildcard con credenziali sarebbe
respinto dagli stessi browser per specifica, ma va comunque dichiarato per iscritto che non
si tenta). Questo isola l'apertura a un solo endpoint pubblico anonimo, senza toccare la
policy delle rotte `app/*`.

### D6 — Anti-spam headless: honeypot derivato + firma HMAC + rate limit, mai un timestamp di render

Tre meccanismi indipendenti, nessuno dei quali presuppone JavaScript lato client (§
Decisione umana N6 per l'eventuale quarto, opzionale):

1. **Honeypot a nome derivato.** Un campo nascosto via CSS (mai `display:none` letterale
   riconoscibile a euristica — dettaglio di implementazione del renderer), il cui `name`
   **non** è una stringa fissa (`"website"`/`"honeypot"`, i primi nomi che un bot scarta
   per euristica nota) ma `HMAC-SHA256(formKey, FORM_ANTISPAM_SECRET)` troncato — stabile
   per lo stesso `formKey` finché il secret non cambia, diverso da form a form. Un bot che
   compila alla cieca ogni campo del form lo valorizza; il server lo scarta silenziosamente
   (`200` generico, mai un errore che riveli il meccanismo).
2. **Firma HMAC del form**, iniettata come campo nascosto nell'HTML esportato/renderizzato
   (sia dall'export statico di ADR-45 sia dal preview SSR di ADR-25): `HMAC-SHA256(formKey,
   FORM_ANTISPAM_SECRET)` — **stesso secret e stesso schema del punto 1** (un solo segreto
   nuovo in `AppConstants`, non due), verificata a submit ricalcolandola server-side. Non è
   un token di sessione (nessuno stato, nessuna scadenza): autentica *"questa sottomissione
   punta a un form che questo backend ha davvero esportato/renderizzato"*, respingendo il
   grosso del traffico di bot generici che colpiscono l'endpoint senza aver mai caricato la
   pagina reale. Non protegge da uno scraper mirato che legge l'HTML pubblicato e replica il
   valore — nessun meccanismo stateless può, per uno **stesso** sito esportato staticamente:
   il compromesso è dichiarato, non nascosto (§ Rischi).
3. **Rate limiting** — `ThrottlerGuard` sulla rotta, per IP **e** per `(ip, formKey)`,
   eredita il target NFR già scritto (`non-functional-requirements.md:85`). Stesso pattern
   di `ADR-1` (decoratore `@Throttle`, non un guard globale nuovo), applicato qui al
   controller `public/forms`.

**Non incluso**: la "marca temporale minima di compilazione" (business rules § Moduli di
contatto, punto 5) nella sua forma classica, perché presuppone un timestamp di render
per-visita che una pagina esportata staticamente non ha (§ Problema, punto 3). Ometterla è
uno scarto dichiarato dalla regola scritta, non un'omissione silenziosa: resta un punto di
firma umana esplicito (N6), con tre opzioni alternative discusse lì.

### D7 — La "prima isola JS": non introdotta da questa RFC

`ADR-22` § Conseguenza riserva esplicitamente questa decisione al momento in cui F10 arriva
— cioè ora. Questa RFC **non** propone di introdurla: le tre difese di D6 non ne hanno
bisogno per funzionare, e introdurre uno script (anche esterno, anche minimo, anche solo
per un timestamp reale di compilazione) è — per la stessa ADR-22 — una decisione a sé, con
il proprio impatto su CSP (`non-functional-requirements.md`: *"nessun `unsafe-inline` né
`unsafe-eval`"* — uno script esterno non violerebbe questo vincolo, ma resta una superficie
nuova da dichiarare, non da introdurre di riflesso dentro una RFC sui form). Si lascia come
opzione esplicita in § Decisione umana (N6, opzione c), non come parte della proposta
principale.

### D8 — Notifica: riuso della coda `email-queue` esistente

`EmailQueueService.enqueueEmail(...)` (`app/backend/src/queues/email-queue/
email.queue.service.ts:35`) accetta già `{ to, subject, html }` — sufficiente per una
notifica di Invio. Nessuna coda nuova: il task menziona `email-queue` per nome ed è già
esattamente questo modulo. Il corpo dell'email è un template minimo (campo → valore, senza
markup arbitrario dal payload — i valori vanno interpolati come testo, mai come HTML,
stesso principio di `plainText` escaping-a-carico-del-renderer di ADR-21 § 4 applicato qui
al renderer email).

---

## Alternative valutate

- **Sei tipi di blocco distinti (uno per `fieldType`), come suggerisce alla lettera il
  task.** Scartata (D1): stesso costo di migrazione per sempre di ADR-21 § Conseguenza,
  moltiplicato per sei, per una differenza che un singolo `enum` già esprime — lo stesso
  ragionamento che ha prodotto `container` invece di N tipi di layout (ADR-39).
- **Modulo di contatto come entità DB propria** (`forms`/`form_definitions`, referenziata
  dal blocco come le Sezioni globali referenziano `global_sections`). Più vicina al
  significato letterale di "riusabile in più Pagine" delle business rules, ma introduce una
  tabella non richiesta dal task (che delimita esplicitamente lo schema a
  `form_submissions`) e duplica il registro-blocchi con un secondo registro-campi in DB.
  Scartata per questo round; resta l'estensione naturale se F06 (Sezioni globali) arriva
  prima e si vuole un form davvero condiviso — vedi D2.
- **Destinatari come prop del blocco `form`.** Scartata: fuga di indirizzi email nella
  risposta JSON pubblica di `GET public/pages` (D2) — non un dettaglio, una violazione
  diretta dello spirito della regola "destinatari mai lato client".
- **CORS globale a `origin: '*'` per accogliere qualunque dominio di export statico.**
  Scartata (D5): indebolirebbe ogni rotta `app/*` autenticata, non solo il submit.
- **Timestamp di compilazione lato server, invariato dal design SSR classico.** Scartata
  per la sola superficie statica di produzione (ADR-45): non misura nulla senza un render
  per-visita. Resta valida sulla rotta di anteprima SSR (ADR-25), dove un render per-visita
  esiste davvero — nota per il piano di implementazione, non per questa RFC.

---

## Impatto

- **`ADR-21`/registro blocchi**: tre tipi nuovi (`form`, `form-field`, `form-submit`),
  approvati insieme in un solo ADR conseguente — stesso precedente di ADR-21 § 5 (cinque
  tipi in un'unica ADR) piuttosto che di ADR-39 (un tipo, una ADR): la scelta fra le due
  forme è un punto di firma (N1).
- **`app/backend/src/blocks/`**: tre nuovi file `types/*.block.ts`, registrazione in
  `block-registry.ts` (`ROOT_ALLOWED` **non** include `form` come radice ammessa — un form
  fuori da una Pagina strutturata non ha senso quanto un `button` isolato ce l'ha; resta
  dentro `section`/`container` come ogni altro blocco di contenuto).
- **Schema DB**: una tabella nuova, `form_submissions` (D3). Nessuna colonna aggiunta ad
  `app_settings` (si riusa lo schema chiave/valore esistente).
- **Nuovo modulo backend**: `app/backend/src/forms/` (`forms.module.ts`/`.controller.ts`/
  `.service.ts`/`dto/`), territorio Backend Developer. Controller pubblico separato da
  quello amministrativo (lettura/gestione Invii, RBAC + ownership pattern di ADR-18 riusato
  per "Leggere gli Invii dei moduli" — Manager+, business rules § Permessi editoriali).
- **`AppConstants`**: un solo secret nuovo, `FORM_ANTISPAM_SECRET` (D6), stesso pattern di
  `pagePreviewTokenSecret`/`analyticsSaltSecret` — dedicato, mai riusato da altri scopi.
- **`app/public-site` e l'export statico (ADR-45)**: il renderer del blocco `form` deve
  iniettare honeypot e firma HMAC (D6) a ogni render/export — stesso principio "Critical
  CSS già iniettato da ADR-42" di RFC-44 Decisione 7: è un'aggiunta al renderer esistente,
  non un secondo motore di rendering.
- **`openapi:export`/`openapi:types`** dopo l'endpoint nuovo, come da Constitution.
- **Test Engineer**: gli 8 scenari di dominio già previsti dalle business rules (validazione
  server-side sempre, persistenza prima della notifica, honeypot/HMAC/rate-limit
  verificati, destinatari mai dal payload, redazione dati personali nei log, soft delete
  dell'Invio, Modulo con Invii non eliminabile — solo disattivabile in `app_settings`) più
  un test dedicato che il campo honeypot **non** compare con un nome prevedibile fisso.

---

## Rischi

| Rischio | Probabilità | Impatto | Mitigazione |
|---|---|---|---|
| La firma HMAC (D6.2) non protegge da uno scraper mirato che legge l'HTML pubblicato e ne replica il valore, essendo stateless per costruzione | Alta per un attaccante mirato, bassa per spam generico | Medio — resta comunque un filtro efficace contro il traffico di bot non mirato, che è la maggioranza | Dichiarato esplicitamente come limite noto, non nascosto; rate limiting (D6.3) resta la difesa contro il traffico ripetuto anche con firma valida |
| Omissione della marca temporale minima (D6, non incluso) lascia scoperto uno scenario esplicitamente richiesto dalle business rules | Certa se N6 non approva un'alternativa | Basso-medio — le altre tre difese restano attive | Punto di firma esplicito N6, tre opzioni presentate, nessuna scelta nascosta |
| `formKey` duplicato fra Pagine diverse per errore editoriale (non malizia) fa confluire Invii di form semanticamente diversi nello stesso `app_settings`/stessa vista | Media, errore umano plausibile in editor | Medio — email di notifica sbagliate, Invii mescolati in vista Invii | Avviso in editor se `formKey` già usato da un'altra Pagina con configurazione diversa (dettaglio UI per il piano, non per questa RFC) |
| Endpoint di submit raggiungibile da un dominio di export statico non ancora noto al deploy del backend, se D5 non è implementato correttamente (wildcard applicato per errore all'intera app invece che alla sola rotta) | Bassa se il middleware resta scoped, alta se il pattern viene generalizzato per comodità | Alto — indebolirebbe CORS su rotte autenticate | Gate di CI/test che verifica `Access-Control-Allow-Origin` sulle rotte `app/*` resta l'allowlist fissa, mai `*` |
| Tre tipi di blocco nuovi approvati insieme, in stile ADR-21, invece che uno per uno in stile ADR-39: se la scelta risulta poi sbagliata, tutti e tre condividono lo stesso ADR e lo stesso rollback a senso unico (ADR-21 § 1) | Bassa | Medio | Punto di firma N1 — la scelta fra ADR unica o tre ADR separate è esplicita, non di default |

---

## Decisione umana

**Esito**: [x] Approvato · [ ] Rifiutato · [ ] Modificato

**Punti che richiedono una firma esplicita, singolarmente:**

- [x] **N1** — Unica ADR-46 per i tre tipi insieme (precedente ADR-21).
- [x] **N2** — Confermato il set minimo di tre tipi (D1): `form`, `form-field` (`fieldType`
  enum), `form-submit` come tipo a sé (non riuso di `button`).
- [x] **N3** — Confermato D2: nessuna tabella `forms` separata in questo round;
  composizione nel block tree (copiata per Pagina, non referenziata), destinatari e oggetto
  notifica in `app_settings` con chiave `form:<formKey>:settings`.
- [x] **N4** — Confermato lo schema `form_submissions` (D3): `ipHash` riusa lo stesso
  meccanismo di `visitor-hash.util.ts`/`analyticsSaltSecret` (nessun terzo secret per
  l'hashing IP); `FORM_ANTISPAM_SECRET` resta dedicato solo a honeypot/firma HMAC (D6).
- [x] **N5** — Confermato D5: CORS scoped alla sola rotta `public/forms/:formId/submit`,
  `origin: '*'` senza credenziali, policy globale invariata.
- [x] **N6** — Opzione **(a)**: marca temporale minima di compilazione omessa sulla
  superficie statica di produzione, mantenuta solo sul preview SSR (ADR-25). Nessuna
  "prima isola JS" introdotta da questa RFC.
- [x] **N7** — Confermato il riuso della coda `email-queue` esistente per la notifica
  (D8), nessuna coda dedicata `form-notifications-queue`.
- [x] **N8** — Confermata l'assegnazione: `app/backend/src/forms/` + registro blocchi +
  `AppConstants` a Backend Developer; renderer del blocco `form` (Canvas admin) e
  iniezione honeypot/HMAC nel renderer di `app/public-site`/export statico a Frontend
  Developer, come task separato.

**Note**: Approvazione raccolta in sessione interattiva (AskUserQuestion), un punto per
volta, tutte e otto le opzioni proposte dalla RFC confermate senza modifiche.

**Approvato da**: Project Owner (Human Sign-Off, marketing@antelmagroup.net) · **Data**: 2026-09-01

**Azione successiva**: [x] Genera ADR-46 · [ ] Archivio
