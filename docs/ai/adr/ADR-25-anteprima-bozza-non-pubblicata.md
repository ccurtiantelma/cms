# ADR-25 — Anteprima di una bozza non pubblicata

## Status
[ ] In discussione · [x] **Approvata** · [ ] Rifiutata · [ ] Superseded da ADR-XXX

## Data approvazione
2026-08-19

---

## Decisione

1. **Il token lo emette il backend admin, su richiesta esplicita, mai in automatico.**
   `POST api/v1/app/pages/:guid/preview-token` (superficie admin, JWT + RBAC/ownership
   identica a quella che regola la modifica della pagina — un autore genera l'anteprima
   solo delle proprie bozze, esattamente come le modifica). Risposta: `{ token, expiresAt }`.
   Il token è un JWT firmato con un segreto **dedicato** (non quello di access/refresh —
   limita il danno di una fuga a questo solo uso), claim minimi: `pageGuid`, `purpose:
   'page-preview'`, `exp`. Emissione audit-logged (`AuditLogService`, coerente con l'audit
   trail già in vigore).

2. **Scadenza breve: 15 minuti, non rinnovabile.** Chi vuole continuare a vedere la bozza
   richiede un token nuovo dal dettaglio Pagina. Nessun refresh: un'anteprima aperta e
   dimenticata in una scheda del browser smette di funzionare da sola, senza bisogno di
   revoca esplicita né di una tabella che tenga i token attivi.

3. **La lettura passa da un percorso dedicato, mai da `public/`.** Nuovo prefisso
   `api/v1/preview/pages/:token` — non `app/` (non richiede login: il token stesso è la
   prova), non `public/` (quella superficie è per costruzione solo `published`, ADR-24 § 2;
   fondervi l'anteprima significa che un bug di validazione del token espone bozze sotto lo
   stesso endpoint che serve contenuto pubblico verificato). Il token viene verificato
   (firma, scadenza, `purpose`) e solo allora si legge `pages.draftContent` per il `pageGuid`
   nel claim, attraverso la stessa pipeline di lettura di F02 (migrazione + validazione).
   Nessuna cache Redis: ogni lettura è fresca, la bozza cambia in continuazione.
   Token invalido, scaduto, pagina inesistente o soft-eliminata → **404 uniforme**, mai
   `401`/`403` (stessa logica di ADR-24 § 3: un errore distinto confermerebbe l'esistenza).
   `app/public-site` espone una rotta propria e separata dal routing per slug di ADR-24
   (es. `/__preview/:token`), che chiama questo endpoint e renderizza con lo stesso
   `renderToStaticMarkup` e gli stessi componenti blocco di F03 — l'anteprima mostra
   esattamente il markup che la pubblicazione produrrebbe, non un'anteprima approssimata
   nell'admin.

4. **Non indicizzabile per costruzione, non per convenzione.** Ogni risposta della rotta di
   anteprima in `app/public-site` porta **sempre** l'header `X-Robots-Tag: noindex, nofollow,
   noarchive` e il meta tag `<meta name="robots" content="noindex,nofollow">` nel proprio
   `<head>` — indipendentemente dal contenuto della pagina, senza eccezioni configurabili.
   La rotta non compare in `robots.txt` né in `sitemap.xml` (F07): il generatore di sitemap
   legge solo pagine `published` per costruzione, quindi un URL di anteprima — che non è
   persistito da nessuna parte, esiste solo come token effimero — non può finirci per
   omissione. Il token non si logga mai per intero (solo un prefisso), stesso trattamento
   riservato a password/secret in `business-rules.md` § Security.

## Alternative scartate

- **Riuso dell'endpoint `public/pages/:slug` con un parametro di anteprima** — è l'alternativa
  già scartata esplicitamente in ADR-24 § "Alternative scartate": mette contenuto non
  pubblicato dietro l'endpoint che per contratto serve solo `published`, un bug di
  validazione lì espone bozze al mondo.
- **Cookie di "draft mode" a sessione (stile Next.js preview mode)** — richiede stato lato
  client persistente e un meccanismo di enable/disable separato; il token per-pagina è più
  semplice da revocare (scade e basta) e non rischia di restare "acceso" dopo che l'editor
  ha chiuso la scheda.
- **Snapshot del contenuto al momento dell'emissione del token, invece di lettura live del
  draft** — eviterebbe la sorpresa di un'anteprima che cambia se l'autore continua a
  modificare, ma introduce uno storage temporaneo in più (con la sua scadenza da gestire)
  per un caso d'uso — condividere un link e continuare a editare nel frattempo — che
  l'ownership già limita a chi la bozza la sta scrivendo.
- **Token opaco random persistito in tabella** invece di JWT firmato stateless — richiede una
  tabella e un job di pulizia per righe scadute; il JWT si autoverifica e scade da solo,
  nessuna riga da potare.
- **Scadenza lunga (ore/giorni)** per comodità di condivisione — allunga la finestra in cui
  un link "condiviso per errore" resta valido; la richiesta è esplicita: minuti, non giorni.

## Conseguenza

Nessuna colonna nuova e nessuna migrazione: il token è stateless, verificato dalla propria
firma. Il costo è tutto nella superficie: nasce un terzo prefisso (`preview/`) accanto ad
`app/` e `public/`, con la propria regola di errore (404 uniforme) e senza cache — va
documentato nella tabella delle superfici API di `CLAUDE.md` quando questa ADR è approvata.
`app/public-site` guadagna una seconda rotta oltre a quella per slug, esplicitamente esclusa
dal routing iterativo di ADR-24: le due non devono mai convergere, o un token scaduto
finirebbe a risolvere come se fosse uno slug. L'anteprima mostra il draft **corrente** al
momento della lettura, non uno snapshot: condividere un link e continuare a modificare la
bozza è una conseguenza accettata, non un difetto.
