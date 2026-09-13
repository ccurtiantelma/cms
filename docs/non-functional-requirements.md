# Non Functional Requirements — CMS

> Soglie di qualità che il sistema deve rispettare. Priorità: dopo System Architecture.
> Le AI non modificano questo file di propria iniziativa.
>
> Ultima revisione: 2026-09-13 — superficie pubblica riallineata all'export statico
> (ADR-53, ADR-63, ADR-65) su richiesta umana esplicita: le soglie restano quelle del
> 2026-08-13, cambia il componente che deve rispettarle.
> Precedente: 2026-08-13 — aggiunti i requisiti specifici di un CMS a pagine
> (lettura pubblica, editor, contenuto).

---

## Performance — superficie amministrativa

- API response time < 300ms al 95° percentile in condizioni normali
- Frontend First Contentful Paint < 1.5s
- Query DB con indici su tutte le FK e sulle colonne usate in WHERE frequenti
- Job pesanti (invio email massivo, elaborazioni asincrone) sempre in coda BullMQ
- Elenco Pagine in area amministrativa: risposta < 300ms con 10.000 Pagine a catalogo

## Performance — superficie pubblica di contenuto

È la superficie che giustifica l'aggettivo "ad alte prestazioni": anonima, ad alto volume,
in sola lettura.

Con ADR-53 il traffico anonimo è servito da file statici (`nginx-static`, ADR-63): nessuna
lettura di Pagina raggiunge backend, database o Redis (solo l'invio dei form li raggiunge). Le soglie si applicano quindi a due
componenti distinti.

- Servizio di una Pagina pubblicata dall'origine statica: < 50ms al 95° percentile
- Pubblicazione, ripubblicazione o archiviazione: file statico scritto o rimosso entro
  5 secondi dalla conferma dell'operazione (job `static-export` a priorità alta, RFC-44)
- Il job di export di una Pagina non deve generare **problemi N+1** sull'albero dei blocchi
  o sulle Sezioni globali referenziate
- Sitemap e `llms.txt`: file statici rigenerati dal job di export, mai calcolati a ogni
  richiesta
- HTML sempre rivalidato (`Cache-Control: no-cache`), asset con fingerprint `immutable`:
  la freschezza dipende dall'evento di pubblicazione, mai da una TTL

## Performance — editor

- Apertura in editor di una Pagina con 100 blocchi: interattiva entro 2s
- Modifica di una proprietà di un blocco: nessun ri-render dell'intero albero (è la ragione
  della scelta Zustand, ADR-17)
- Salvataggio di una bozza: < 500ms al 95° percentile

## Qualità del contenuto servito (Core Web Vitals)

Il CMS non renderizza l'HTML finale (Principle 7), ma il contenuto che produce determina
il risultato. Il modello di contenuto deve rendere possibili questi obiettivi sul sito
consumer:

- LCP < 2.5s · CLS < 0.1 · INP < 200ms
- Ogni Media espone dimensioni intrinseche e varianti dimensionali, per evitare layout
  shift e download sovradimensionati
- I metadati SEO/GEO sono disponibili nella **stessa risposta** che porta il contenuto:
  nessuna seconda chiamata per popolare `<head>`

---

## Scalabilità

- Architettura stateless: nessuno stato in memoria del processo NestJS
- Sessioni e cache in Redis (ioredis)
- BullMQ per tutti i job asincroni
- Connessione DB con pool gestito da Drizzle + pg
- Ogni job con side-effect deve essere sicuro con più repliche attive: `@Cron` solo se
  idempotente, altrimenti repeatable job BullMQ (ADR-11)

### Volumi di riferimento

Dimensionamento atteso, da usare come base per i test di performance:

| Grandezza | Ordine di grandezza atteso |
|---|---|
| Pagine pubblicate | fino a 10.000 |
| Lingue attive | fino a 10 |
| Blocchi per Pagina | tipico 20–50, limite 500 |
| Revisioni conservate per Pagina | configurabile, default 30 |
| Media a catalogo | fino a 50.000 |
| Richieste pubbliche | fino a 100 req/s sostenute |

Oltre questi ordini di grandezza serve una nuova valutazione architetturale (ADR), non un
aggiustamento incrementale.

---

## Sicurezza

- HTTPS obbligatorio in produzione
- Headers sicurezza: Helmet NestJS abilitato
- Rate limiting sugli endpoint `/auth/*`; rate limiting **separato e più stringente** sugli
  endpoint `public/`, sull'invio dei moduli di contatto e sul chatbot
- Nessun segreto nel codice sorgente — tutto in variabili d'ambiente tramite `AppConstants`
- Stack trace mai esposto nelle risposte di errore in produzione
- JWT access token: durata 15 minuti (default `JWT_EXPIRATION`)
- Refresh token: durata 7 giorni (default `RTK_EXPIRATION`), signed httpOnly cookie
- **Sanitizzazione del rich text server-side prima della persistenza**: requisito non
  funzionale, non un dettaglio implementativo. Il contenuto salvato deve essere sicuro
  anche se il consumer lo renderizza senza ulteriori filtri
- **Content Security Policy**: il contenuto servito non deve richiedere `unsafe-inline` né
  `unsafe-eval` per essere renderizzato
- Upload: MIME verificato dal contenuto reale, dimensione massima applicata, file mai
  eseguibili dal server che li serve
- Nessuna esecuzione di codice o template forniti dall'utente

---

## Disponibilità

- Target uptime: 99.5%
- Graceful shutdown NestJS (gestione SIGTERM)
- Health check endpoint: `GET api/v1/health` — `200`/`503`, adatto a readiness probe
- **Degradazione del contenuto pubblico**: un guasto di backend, database o Redis non rende
  il sito irraggiungibile. `nginx-static` serve l'ultimo export riuscito; si fermano solo
  pubblicazioni, form e anteprima finché il Piano di Gestione non torna disponibile
- Un guasto del provider del chatbot non deve impattare il resto del sito

---

## Integrità e durabilità del contenuto

Requisito specifico di un CMS: **il contenuto è il patrimonio del cliente**.

- Nessuna operazione di editing può causare perdita di lavoro silenziosa: i conflitti si
  segnalano (`409`), non si risolvono sovrascrivendo
- Le Revisioni pubblicate sono immutabili: nessun percorso di codice le modifica
- La potatura delle Revisioni eccedenti non tocca mai l'ultima pubblicata
- Nessuna cancellazione fisica di contenuto: sempre soft delete
- Ogni breaking change allo schema di un blocco richiede una migrazione dei contenuti
  esistenti, verificata su un campione reale prima del rilascio
- Il contenuto deve essere esportabile in una forma indipendente dal sistema: l'albero di
  blocchi in JSON è già questa forma, e va mantenuta tale (nessun riferimento interno
  opaco che ne impedisca la lettura fuori dal CMS)

---

## Logging

- Winston con rotazione giornaliera (`winston-daily-rotate-file`)
- Livelli in produzione: `error`, `warn`, `info`
- Livelli in sviluppo: `error`, `warn`, `info`, `debug`
- MAI `console.log` nel codice — usare sempre `Logger` NestJS
- Log strutturato (JSON) in produzione per aggregatori esterni
- Redazione automatica dei dati sensibili nei log (`sanitizeLogData`) — vedi ADR-2
- **Gli Invii dei moduli di contatto contengono dati personali**: non vanno mai loggati per
  intero, nemmeno a livello `debug`

---

## Compatibilità browser

- Chrome, Firefox, Edge: ultime 2 versioni
- Safari: ultima versione
- Area amministrativa ed editor: uso primario da desktop; l'editor visivo non è progettato
  per l'uso da smartphone
- Il contenuto servito dal CMS deve restare pienamente utilizzabile su mobile

---

## Accessibilità

- Livello minimo: WCAG 2.1 AA per i componenti Mantine (già conformi di default)
- Requisito di dominio: **il testo alternativo delle immagini è obbligatorio** nei blocchi
  di contenuto. L'accessibilità del sito prodotto è responsabilità del CMS che ne raccoglie
  i metadati, non solo del consumer che lo renderizza
- I blocchi di contenuto devono produrre una gerarchia di intestazioni coerente: l'editor
  deve poter segnalare i salti di livello (es. `h2` seguito da `h4`)
