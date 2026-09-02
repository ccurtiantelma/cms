# ADR-46 — Form Builder dinamico: tre tipi di blocco, `form_submissions`, endpoint pubblico di submit

## Status
[x] Approvata

## Data approvazione
2026-09-01 — approvato da: Project Owner (Human Sign-Off, marketing@antelmagroup.net)

## RFC di riferimento
`docs/ai/rfc/RFC-46-dynamic-form-builder.md` (N1–N8 firmati)

## Decisione

1. Settimo/ottavo/nono ingresso del registro blocchi (ADR-21 § 5), approvati insieme in
   questa unica ADR: `form` (contenitore, `children.allow: ['form-field', 'form-submit']`,
   `formKey: plainText` obbligatoria), `form-field` (`fieldType` enum
   `text|email|textarea|select|checkbox`, `name`/`label`/`required`/`placeholder`/`options`),
   `form-submit` (`label: plainText`, tipo a sé — non riuso di `button`). `form` non ammesso
   a radice (`ROOT_ALLOWED` invariato), nessun `form` annidato in un altro `form`.
2. Nessuna tabella `forms`/definizioni condivise. La composizione vive nel block tree,
   copiata per Pagina come ogni altro blocco. La configurazione operativa (destinatari,
   oggetto notifica) vive in `app_settings`, chiave `form:<formKey>:settings`, valore
   `{ recipients: string[], notifySubject: string }`.
3. Tabella nuova `form_submissions` (forma ibrida: `isActive` per il soft delete
   dell'Invio, `createdBy`/`updatedBy` nullable — scrittura pubblica anonima, stesso
   pattern di `analytics_events`). `ipHash` riusa `visitor-hash.util.ts`/
   `analyticsSaltSecret` (nessun terzo secret). Un solo secret nuovo in `AppConstants`,
   `FORM_ANTISPAM_SECRET`, dedicato a honeypot (nome derivato via HMAC) e firma HMAC del
   form — non un token di sessione, nessuna scadenza.
4. Endpoint pubblico `POST api/v1/public/forms/:formId/submit` (`:formId` = `formKey`):
   ordine handler = anti-spam (honeypot + HMAC + rate limit per IP e per `(ip, formKey)`)
   prima di ogni accesso DB → risoluzione del blocco `form` fra le Pagine `published`
   (404 se assente, mai 403) → validazione del payload contro i `form-field` realmente
   pubblicati (mai contro uno schema dichiarato dal client) → persistenza dell'Invio
   sempre prima della notifica → `EmailQueueService.enqueueEmail(...)` con destinatari
   letti solo da `app_settings` → risposta generica, senza echo del payload.
5. CORS: middleware dedicato, scoped alla sola rotta di submit, `Access-Control-Allow-Origin: *`
   e **mai** `Access-Control-Allow-Credentials`. Policy globale (`main.ts`) invariata.
6. Marca temporale minima di compilazione (business rules § Moduli di contatto):
   mantenuta solo sul preview SSR (ADR-25); omessa sulla superficie statica di produzione
   (ADR-45), che non ha un render per-visita. Nessuna "prima isola JS" introdotta qui —
   resta riservata a una ADR propria (ADR-22 § Conseguenza).
7. Notifica via coda `email-queue` esistente (`EmailQueueService.enqueueEmail`), nessuna
   coda dedicata.

## Alternative scartate

- Sei tipi di blocco (uno per `fieldType`) — stesso costo di migrazione a vita di ADR-21 § Conseguenza, moltiplicato per sei, per una differenza che un `enum` già esprime.
- Tabella `forms`/`form_definitions` con riferimento condiviso stile Sezioni globali — introduce un secondo registro-campi in DB non richiesto da questo round.
- Destinatari come prop del blocco `form` — fuga di indirizzi email nella risposta pubblica di `GET public/pages`.
- CORS globale `origin: '*'` — indebolirebbe ogni rotta `app/*` autenticata, non solo il submit.
- Timestamp di compilazione lato server anche sull'export statico — non misura nulla senza un render per-visita su quella superficie.
- Terzo secret dedicato solo all'hashing IP dei form — nessun beneficio distinto da `analyticsSaltSecret`, solo un secret in più da ruotare.

## Conseguenze

Un form composto nel Canvas è copiato per Pagina: nessun punto di modifica unico finché
non arriva un meccanismo di riferimento stile Sezioni globali (F06) esteso a `form`. La
firma HMAC (D6.2 di RFC-46) non protegge da uno scraper mirato che replica l'HTML
pubblicato — limite noto, mitigato solo dal rate limiting. Un `formKey` duplicato fra
Pagine diverse è ammesso e fa confluire gli Invii nella stessa configurazione/vista — errore
editoriale plausibile, non bloccato a salvataggio. Un incremento futuro di `v` su uno dei
tre tipi resta un deploy a senso unico (ADR-21 § 1).

## Conformità

`BLOCK_REGISTRY` contiene `form`/`form-field`/`form-submit` con `v: 1`; `ROOT_ALLOWED`
invariato. `form_submissions` in `schema.ts` con `isActive`, `createdBy`/`updatedBy`
nullable, nessuna colonna `version`. Nessuna prop di blocco chiamata `recipients`/
`notifySubject`/equivalenti in nessun tipo del registro. Test che verifica
`Access-Control-Allow-Origin` sulle rotte `app/*` resta l'allowlist fissa, mai `*`, e che
il nome del campo honeypot non è una stringa fissa nota.
