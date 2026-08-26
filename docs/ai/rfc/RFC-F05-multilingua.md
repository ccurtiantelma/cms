# RFC-F05 — Multilingua e localizzazione dei contenuti

## Status
[ ] In discussione · [x] Approvato · [ ] Rifiutato

## Proposto da
AI Solution Architect · Data: 2026-08-25

---

## ⚠️ Premessa — questa RFC non parte da zero

La richiesta che genera questo documento chiede di "specificare i campi DB per `pages`
(`locale`, `translationGroupGuid`)" e di "definire la risoluzione delle rotte con prefisso
locale (`/:locale/*`)" come se fossero decisioni ancora aperte. **Non lo sono, in parte.**
F01 (`docs/ai/specs/SPEC-F01-gestione-pagine.md`, assunzione A3 confermata il 2026-08-17) ha
già costruito e messo in produzione:

- `pages.locale` — `varchar(10)`, già popolato su ogni riga.
- `pages.translationGroupId` — **non `translationGroupGuid`**: `char(16)` opaco, generato
  ex novo a ogni creazione (`Utils.randomString(16)`), confermato come scelta S4 di
  `SPEC-F01`. Il nome `translationGroupGuid` proposto dalla richiesta iniziale collide con
  una decisione già firmata: si riprende il nome esistente, non se ne introduce uno nuovo.
- Indici parziali di unicità slug **per locale** (`pages_slug_locale_root_uq`,
  `pages_slug_locale_child_uq`), risoluzione pubblica segmento-per-segmento **per locale**
  (ADR-24), tutto già in `app/backend/src/pages/`.
- La forma della URL pubblica è già decisa da **ADR-24 § 5** (approvata, non modificabile
  se non con una nuova ADR che la supera): *"la lingua di default non ha prefisso; le altre
  lo avranno"*. Un prefisso `/:locale/*` uniforme su **tutte** le lingue, default incluso,
  è l'alternativa che ADR-24 ha **già scartato** esplicitamente (§ Alternative scartate),
  proprio per evitare di dover riscrivere ogni URL della lingua principale il giorno in cui
  arrivasse F05 — cioè oggi.

Questa RFC eredita entrambe le decisioni e si concentra su ciò che **non** esiste ancora:
il registro dei Locale attivi, il vincolo di unicità per gruppo di traduzione, la creazione
di una traduzione, l'estensione della risoluzione pubblica alle lingue non di default, e lo
switcher in editor.

---

## Problema

Lo stato attuale permette a una Pagina di avere un `locale` e un `translationGroupId`, ma
nessuna delle regole di dominio che li rendono un sistema multilingua è implementata:

1. **Nessun registro dei Locale attivi.** `AppConstants.defaultLocale` (`app-constants.ts`,
   riga 124) è una variabile d'ambiente (`DEFAULT_LOCALE`, default `it-IT`) con un commento
   esplicito: *"in attesa di F05/`app_settings` come impostazione"*. Non esiste un elenco
   di lingue attive — qualunque stringa di 10 caratteri è oggi un `locale` valido su una
   Pagina, senza governo.
2. **Nessun vincolo che impedisca due traduzioni nello stesso Locale.** La regola 3 di
   `business-rules.md` § Multilingua (*"dentro un gruppo può esistere al massimo una Pagina
   per Locale"*) non ha un indice a database che la faccia rispettare: oggi nulla impedisce
   due righe con lo stesso `translationGroupId` e lo stesso `locale`.
3. **Nessuna via per creare una traduzione.** La regola 5 (*"creare una traduzione da una
   Pagina esistente copia la struttura dei blocchi"*) non ha un endpoint. Oggi l'unico modo
   di ottenere due righe con lo stesso `translationGroupId` è scriverle a mano via
   `POST app/pages`, generando ciascuna il proprio `translationGroupId` indipendente
   (`pages.service.ts` riga 194) — cioè **due gruppi di traduzione da una riga sola**, mai
   collegati.
4. **La risoluzione pubblica copre solo la lingua di default.** `public-pages.controller.ts`
   e `public-path.util.ts` risolvono `(locale, percorso)` ma il `locale` è oggi sempre
   quello di default: non esiste un parsing di `/{locale}/...` che isoli il prefisso e lo
   passi come `locale` di query. ADR-24 § 5 riserva esplicitamente questo lavoro a F05.
5. **Nessun fallback, per scelta — ma nessuna verifica che sia rispettata.** La regola 7
   (*"il fallback di lingua è esplicito, non automatico"*) è una proprietà che la nuova
   risoluzione locale-prefissata deve rispettare fin dal primo commit, non un'aggiunta
   successiva: un fallback silenzioso alla lingua di default produrrebbe contenuto duplicato
   agli occhi dei motori di ricerca (stessa regola).
6. **Nessuno switcher in editor.** Chi lavora su una Pagina non ha modo di vedere le sue
   traduzioni esistenti né di crearne una nuova.

---

## Soluzione proposta

### 1. Registro dei Locale attivi — `app_settings`, non una tabella nuova

Si propone una chiave `app_settings` dedicata, riusando il pattern già in produzione per il
Theme Customizer (ADR-4) invece di una tabella `locales`:

```
key:   "multilingual.locales"
value: {
  active:  string[]   // es. ["it-IT", "en-GB"], BCP-47 libero come oggi
  default: string      // deve comparire in `active`
}
```

**Perché `app_settings` e non una tabella dedicata.** Il numero di lingue di un sito è
piccolo (tipicamente 2-6) e non ha bisogno di righe indicizzabili singolarmente, FK in
ingresso, o storico: è configurazione globale, esattamente il caso d'uso per cui
`app_settings` esiste già. Una tabella `locales` aggiungerebbe una migrazione, un modulo
CRUD e un `guid` per una manciata di valori che cambiano raramente — l'unico vantaggio
sarebbe poter referenziare un Locale con una FK, cosa che nessuna regola di dominio chiede:
`pages.locale` resta una stringa libera confrontata contro l'elenco attivo, non una FK.

**Migrazione della lingua di default.** `AppConstants.defaultLocale` (env var) resta come
valore di bootstrap per un'installazione senza `app_settings` popolato (dev, seed iniziale)
ma **`app_settings["multilingual.locales"].default` ha precedenza quando presente**: la
env var smette di essere l'unica fonte di verità in produzione. Nessuna migrazione dei dati
esistenti è necessaria — le Pagine già scritte hanno già un `locale` valorizzato.

**RBAC.** *"Gestire Locale e impostazioni multilingua"* è Admin+ nella tabella dei permessi
editoriali (`business-rules.md`). Endpoint proposto: `GET`/`PUT app/settings/multilingual`
(riusa il modulo `AppSettingsModule` esistente, non un modulo nuovo), `GuardAdmin`.

### 2. Vincolo di unicità per gruppo di traduzione — un indice, una migrazione

```
uniqueIndex('pages_translation_group_locale_uq')
  .on(t.translationGroupId, t.locale)
  .where(sql`${t.isActive}`)
```

Stesso pattern già in uso per lo slug: indice parziale filtrato su `is_active`, perché il
soft delete libera lo slot (una traduzione soft-eliminata non blocca la ricreazione nello
stesso Locale). Un tentativo di violazione è mappato a `409` dal `db-error.mapper.ts`
esistente, stesso percorso già usato per il conflitto di slug — **nessuna query di
controllo preventiva**, coerente con `CLAUDE.md` § Backend Developer.

> ⚠️ **Bloccante.** Migrazione dello schema: approvazione umana esplicita richiesta
> (`CLAUDE.md` § Ask first). Nessun rischio sui dati esistenti: senza un endpoint di
> creazione traduzione (§ 3), oggi ogni riga è sola nel proprio `translationGroupId` per
> costruzione (`pages.service.ts` riga 194), quindi l'indice non trova violazioni pregresse.

### 3. Creazione di una traduzione — nuovo endpoint, non un nuovo modulo

`POST app/pages/:guid/translations` — body `{ locale: string }`.

Comportamento (traduzione diretta delle regole 3 e 5 di `business-rules.md` §
Multilingua):

1. `404` se la Pagina sorgente non esiste o è soft-eliminata (stessa semantica ownership di
   ADR-18 sulle altre rotte di `PagesController`).
2. `400` se `locale` non è fra i Locale attivi di `app_settings["multilingual.locales"]`.
3. `409` se esiste già una riga con lo stesso `translationGroupId` e il `locale` richiesto
   (lo stesso vincolo del § 2, non un controllo duplicato scritto a mano).
4. Altrimenti: nuova riga `pages` con **lo stesso `translationGroupId`** della sorgente,
   `locale` richiesto, `status = 'draft'`, `draftContent`/`draftSeo` **copiati per
   deep-clone** dalla sorgente (struttura e testi inclusi — la regola 5 dice *"lascia i
   testi da tradurre"*, cioè lascia i testi della lingua sorgente come punto di partenza
   visibile, non li svuota), `slug` copiato invariato dalla sorgente (l'autore lo cambierà:
   resta comunque unico per il proprio `locale`, quindi non collide con l'originale),
   `parentId` **non copiato** — nasce root, perché il genitore è una Pagina nello stesso
   Locale della sorgente e collegarla trasparentemente presume una gerarchia parallela che
   nessuna regola dichiara. `createdBy` = autore della richiesta.
5. Ownership e soglie sono le stesse di `POST app/pages` (ADR-18): chiunque possa creare una
   Pagina può creare una traduzione.

### 4. Risoluzione pubblica locale-prefissata

Estensione di `public-pages.controller.ts` / `public-path.util.ts`, stessa forma già
decisa da ADR-24 § 5:

- **Lingua di default**: percorso senza prefisso, comportamento **invariato** (`/chi-siamo`).
- **Altre lingue**: `/{locale}/...`. Il primo segmento del percorso viene confrontato contro
  `app_settings["multilingual.locales"].active` (esclusa la default, che non ha prefisso
  per costruzione): se corrisponde, è consumato come `locale` e il resto del percorso segue
  la stessa risoluzione segmento-per-segmento già in produzione (ADR-24 § 1); se non
  corrisponde a nessun Locale attivo, **non è un prefisso di lingua** — il segmento entra
  nella risoluzione come primo slug nella lingua di default, esattamente come oggi. Nessuna
  ambiguità: un solo Locale può iniziare per ciascun valore di primo segmento, altrimenti la
  configurazione stessa è invalida (responsabilità di chi gestisce `app_settings`, non della
  risoluzione).
- **Fallback esplicito, mai automatico** (regola 7): se `(locale, percorso)` non risolve una
  Pagina `published`, la risposta è `404` — **mai** un fallback silenzioso alla lingua di
  default. Stessa uniformità di errore di ADR-24 § 3: nessuna distinzione fra "lingua
  inesistente" e "percorso inesistente in quella lingua".
- **Canonica e forma dell'URL**: la canonicalizzazione (minuscolo, senza slash finale,
  `308`) di ADR-24 § 4 si applica **dopo** l'estrazione del prefisso di lingua, sullo stesso
  percorso residuo già canonicalizzato oggi.

Questo lavoro tocca `app/backend/src/pages/public-pages.controller.ts`,
`public-pages.service.ts`, `public-path.util.ts` — **nessuna colonna nuova**, riusa gli
stessi indici `(locale, parent_id, slug)` che ADR-24 già sfrutta per la lingua di default.

### 5. Dati per `hreflang` — esposti da F05, renderizzati da F07

`business-rules.md` § SEO assegna il tag `hreflang` e la sitemap a F07 (che dipende da F05
nella roadmap). F05 non genera XML: espone, sull'endpoint pubblico di lettura pagina, la
lista delle traduzioni **pubblicate** dello stesso gruppo (`locale` + percorso pubblico
completo), così F07 non deve reinterrogare `translationGroupId` con una query propria. Il
campo è opzionale in questa RFC — si formalizza nel contratto quando F07 lo consuma
davvero, per non congelare una forma DTO che nessuno usa ancora.

### 6. Switcher di Locale in editor

`PagePageDetail.tsx` (frontend) mostra, accanto al titolo, un `Select` Mantine con le
traduzioni esistenti del gruppo (etichetta = `locale`, click = navigazione alla Pagina
tradotta) più un'azione "Crea traduzione" che apre un `Modal` con la scelta del Locale fra
quelli attivi non ancora presenti nel gruppo, e chiama l'endpoint del § 3. Nessun editor
multi-pannello simultaneo: si edita una traduzione alla volta, in linea con "bozza e
pubblicato coesistono per riga" già implementato — ogni traduzione ha il proprio ciclo di
vita indipendente (regola 4).

---

## Alternative valutate

**Prefisso di lingua su tutte le lingue, default incluso.** Scartata — non da questa RFC,
da **ADR-24 § 5**, che l'ha già valutata e respinta per evitare la riscrittura di massa
delle URL della lingua principale. Riproporla richiederebbe superare ADR-24 con una nuova
ADR, non è la via scelta qui.

**Fallback automatico alla lingua di default quando la traduzione manca.** Scartata dalla
regola 7 delle business rules: produce contenuto duplicato agli occhi dei motori di ricerca
e nasconde a un redattore che una traduzione non esiste ancora.

**Tabella `locales` dedicata invece di una chiave `app_settings`.** Scartata: nessuna
regola di dominio referenzia un Locale con una FK, e il numero di lingue è troppo piccolo
per giustificare un modulo CRUD a sé. Resta un'opzione se in futuro un Locale accumulasse
metadati propri (nome visualizzato, direzione RTL, valuta) — non richiesti oggi.

**`translationGroupId` come FK a una tabella `translation_groups`.** Non riproposta da
questa RFC: già scartata da A3/S4 il 2026-08-17. Una colonna opaca condivisa fra righe
sorelle non ha bisogno di una riga propria — non esiste alcun dato da appendere al gruppo
stesso, solo un legame fra Pagine.

**Copiare anche `parentId` nella traduzione creata.** Scartata: presume che il genitore
abbia già una traduzione nello stesso Locale, il che non è garantito e non è verificabile
senza attraversare l'intera gerarchia. La nuova traduzione nasce root; riparentarla è
un'azione manuale successiva, con le stesse regole di ciclo già validate su ogni Pagina.

**Svuotare i testi alla creazione di una traduzione**, invece di copiarli dalla sorgente.
Scartata: un blocco `richText`/`plainText` vuoto è comunque `required` in molti tipi di
blocco (ADR-21), quindi svuotare produrrebbe un albero che fallisce validazione al primo
salvataggio. Copiare i testi della lingua sorgente come placeholder traducibile è anche più
utile in pratica: chi traduce vede cosa deve tradurre invece di un canvas vuoto.

---

## Impatto

**Backend.** Un endpoint nuovo (`POST app/pages/:guid/translations`), due endpoint su
`AppSettingsModule` esistente per il registro Locale, estensione di tre file già esistenti
in `app/backend/src/pages/` per la risoluzione pubblica locale-prefissata. Un indice nuovo
su `pages` (⚠️ approvazione).

**Frontend.** Uno switcher e un modal in `PagePageDetail.tsx`/editor; nessun componente
nuovo di dominio, nessuna dipendenza nuova.

**Sito pubblico.** `app/public-site` non cambia: consuma sempre `api/v1/public/*` con lo
stesso contratto, il `locale` extra è nel path che l'endpoint pubblico già risolve.

**Contratti.** `npm run openapi:export` + `openapi:types` dopo gli endpoint nuovi.

**Decisioni non sciolte qui.** Menu di navigazione "per Locale" (`business-rules.md` §
Menu): nessuna tabella `menus` esiste ancora e nessuna feature della roadmap la possiede
esplicitamente — fuori scope, non un'omissione di questa RFC. Le stringhe di interfaccia
del sito pubblico per lingua (regola 8) restano fuori scope: non sono contenuto di Pagina.

---

## Rischi

| Rischio | Probabilità | Impatto | Mitigazione |
|---|---|---|---|
| L'indice di unicità (§ 2) non viene approvato | Bassa | Medio | La creazione di traduzioni (§ 3) resta costruibile ma senza garanzia DB: si degrada a controllo applicativo con corsa critica possibile. Non raccomandato come stato permanente. |
| Un Locale rimosso da `active` lascia Pagine orfane nel Locale disattivato | Media | Basso | Le Pagine restano valide e servibili: "attivo" governa solo cosa lo switcher/i editor propongono come nuova traduzione, non cosa è già pubblicato. Nessuna cancellazione implicita. |
| Collisione fra un primo segmento di path e un codice Locale non inteso come prefisso | Bassa | Medio | Il match è contro l'elenco esplicito di Locale attivi, non un pattern euristico: un sito con `/it-IT` come slug reale di pagina radice e `it-IT` come Locale attivo è un conflitto di configurazione dichiarato, non silenzioso — segnalato in fase di attivazione del Locale. |
| Deep-clone del contenuto sorgente porta con sé `mediaRef` che puntano a media non ancora referenziabili in ogni lingua (es. testo alternativo nella lingua sbagliata) | Alta | Basso | Fuori scope tecnico: il `guid` del media resta valido in ogni Locale (i media non sono per-lingua), l'alt-text tradotto è responsabilità editoriale al momento della traduzione, non un vincolo strutturale. |
| Assenza di un'ADR dedicata al "modello multilingua" nominata da `docs/roadmap.md` § F05 | Media | Basso | Vedi nota sotto. |

**Nota sull'ADR mancante.** `docs/roadmap.md` § F05 richiede *"ADR: modello multilingua
(righe autonome vs. campi affiancati)"*. La scelta è già presa e già implementata (A3,
confermata il 2026-08-17, S4 di `SPEC-F01`), ma non esiste un documento `ADR-*` dedicato —
è registrata solo in `business-rules.md`. Questa RFC **non la ridecide**: propone di
chiudere il debito formale con una ADR breve che *registra* la decisione già in produzione
(nessuna alternativa da valutare ex novo, il codice esiste da prima di questa RFC), oppure,
in alternativa, di considerare la conferma di A3 come chiusura sufficiente e aggiornare
`docs/roadmap.md` per non nominare più un'ADR che non arriverà. È un punto di firma, non
un'implementazione.

---

## Decisione umana

**Esito**: [x] Approvato · [ ] Rifiutato · [ ] Modificato

**Punti che richiedono una firma esplicita, singolarmente:**

- [x] **M1** — Registro dei Locale attivi come chiave `app_settings["multilingual.locales"]`
  (§ 1), non tabella dedicata
- [x] **M2** — Migrazione: indice `pages_translation_group_locale_uq` su
  `(translation_group_id, locale)` filtrato su `is_active` (§ 2) — ⚠️ tocca lo schema
- [x] **M3** — Endpoint `POST app/pages/:guid/translations` con la semantica di copia
  descritta al § 3 (deep-clone di `draftContent`/`draftSeo`, `parentId` non copiato,
  `slug` copiato invariato)
- [x] **M4** — Risoluzione pubblica locale-prefissata (§ 4): match contro l'elenco esplicito
  di Locale attivi, fallback sempre `404` mai automatico
- [x] **M5** — Debito ADR sul modello multilingua: chiuso con ADR di registrazione
  (`docs/ai/adr/ADR-36-modello-multilingua-righe-autonome.md`, approvata 2026-08-25)
- [x] **M6** — RBAC del registro Locale: Admin+ (`GuardAdmin`) su `PUT app/settings/multilingual`

**Approvato da**: marketing@antelmagroup.net · **Data**: 2026-08-25

**Azione successiva**: [x] Genera ADR di registrazione (se M5 lo richiede) · [x] Procedi al Plan
