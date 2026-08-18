# ADR-23 — Caching e invalidazione del contenuto pubblico

## Status
[ ] In discussione · [x] **Approvata** · [ ] Rifiutata · [ ] Superseded da ADR-XXX

## Data approvazione
2026-08-17 — approvata da: ccurti

---

## Decisione

1. **Una chiave per pagina; il valore è il payload pubblico già risolto.**
   `public:{reg}:page:{locale}:{path}` → JSON della risposta di `api/v1/public/`, cioè
   l'albero **dopo** risoluzione del percorso, lettura della Revisione pubblicata, migrazione
   e validazione. Cachare prima della migrazione lascerebbe fuori dalla cache la parte cara.

2. **`{reg}` è un token del registro dei blocchi**, calcolato all'avvio come hash corto di
   tipi, `v` corrente e lunghezza della catena di migrazioni di ciascuno. Chiude un guasto che
   nessun evento di contenuto segnala: un deploy che aggiunge un gradino di migrazione cambia
   la forma del payload **senza** che il contenuto cambi, e la chiave vecchia continuerebbe a
   servire la forma vecchia. Col token quel deploy cambia prefisso e la cache nasce fredda per
   costruzione. Le chiavi orfane del prefisso precedente restano: a queste dimensioni sono
   trascurabili, e il giorno in cui non lo fossero il rimedio è un job di manutenzione, non
   una TTL.

3. **Nessuna TTL sulle chiavi pubbliche.** Una TTL è la promessa che il contenuto stantio
   scade da solo, ed è esattamente ciò che degrada l'invalidazione a best effort — regola 8
   del modello di contenuto.

4. **Invalidazione: `DEL` di chiavi note, dopo il commit, dentro la stessa operazione di
   servizio.** Non un listener, non un `@Cron`, e non un job accodato al posto del `DEL`
   (§ 6 lo ammette solo come ricorso di un `DEL` fallito). Gli eventi sono quelli delle
   business rules: pubblicazione, ripubblicazione, archiviazione, cambio di slug, cambio di
   genitore (reparenting), soft delete di una pagina pubblicata. L'elenco non è un tetto: è
   ogni evento che cambia il `path` pubblico risolto di una pagina o di un suo discendente —
   `parentGuid` lo determina esattamente quanto lo slug, quindi ometterlo dall'invalidazione
   lascerebbe stantio il payload sotto il vecchio percorso. Il `DEL` sta **dopo** il commit
   Postgres: prima, una lettura concorrente ripopolerebbe la chiave con lo stato pre-commit.

5. **Le chiavi da cancellare si calcolano dal database, mai scoprendole con `SCAN`.** Cambiare
   lo slug di una pagina cambia il percorso di tutti i suoi discendenti: l'insieme si ottiene
   con una query sull'albero (`parentId`), che è dato autorevole, mentre `SCAN MATCH` è
   un'ispezione O(keyspace) di un indice che non possediamo. Serve quindi **un solo metodo
   nuovo** in `RedisService`: `delMany(keys: string[])`. Nessun tag-set, nessun indice di
   chiavi vive, nessuno `scan`, nessun `keys`.

6. **Un `DEL` fallito non è mai un errore per il chiamante: è un lavoro che deve ancora
   riuscire.** La pubblicazione risponde `200`. Il contenuto è committato, quindi la pagina
   *è* pubblicata: restituire `500` descriverebbe male ciò che è successo e — soprattutto —
   lascerebbe il chiamante senza uscita, perché `published → published` non è una transizione
   ammessa e la ripubblicazione risponderebbe `400`; se anche fosse ammessa, creerebbe una
   Revisione nuova per un guasto di Redis, cioè scriverebbe la storia editoriale con gli
   incidenti dell'infrastruttura. I due modi di guasto restano distinti:

   - **Redis irraggiungibile**: la lettura pubblica cade sul database (NFR § Disponibilità),
     nessun contenuto stantio è servibile, la scrittura logga e prosegue.
   - **Redis risponde e il `DEL` fallisce**: la chiave stantia resta servibile. L'operazione
     accoda un job BullMQ di invalidazione con le chiavi da cancellare, con retry e backoff
     esponenziale, e scrive un audit che **elenca le chiavi** — il ripristino manuale non deve
     richiedere di indovinarle. È il pattern che `CLAUDE.md` impone già per le email: mai un
     side-effect diretto e non ritentabile da un service. Se anche l'accodamento fallisce
     (stesso Redis), restano l'audit e un log a livello `error` con le chiavi: la traccia per
     il ripristino esiste in ogni caso, e nessuna delle due strade tocca la risposta HTTP.

   Il `DEL` sincrono post-commit resta il percorso primario e non diventa opzionale: la coda è
   il **ricorso** del suo fallimento, non il suo sostituto.

7. **La cache è un acceleratore, non una dipendenza.** Redis assente → lettura dal database.
   Un errore Redis in lettura non produce mai un `5xx` pubblico.

8. **Un albero che fallisce migrazione o validazione in lettura non si cachea** — chiude il
   rinvio di ADR-21 § 3.7. La pagina non è servibile e risponde `404` (ADR-24 § 3); né
   l'esito negativo né il `404` entrano in cache. Per tre ragioni: la correzione di un albero
   rotto è un **deploy**, che nessun evento di contenuto segue, quindi un negativo cacheato
   sopravviverebbe alla propria correzione; un fallimento ripetuto è un allarme e deve
   continuare a suonare nei log; e il volume che giustificherebbe di cachearlo non esiste.
   Vale per ogni `404` pubblico — **nessun negative caching in F03**: il traffico su percorsi
   inesistenti è problema del rate limit della superficie pubblica, non della cache.

## Alternative scartate

- **TTL come rete di sicurezza dietro l'invalidazione per evento** — legittima per iscritto che l'invalidazione ogni tanto fallisca.
- **Tag-set o indice delle chiavi vive in Redis** — una struttura da mantenere in ogni percorso di scrittura per un problema che una query sull'albero risolve con dati già autorevoli.
- **`SCAN MATCH` per trovare le chiavi dei discendenti** — scansione del keyspace per ricostruire una gerarchia che il database conosce esattamente.
- **`DEL` prima del commit** — una lettura concorrente ripopola la chiave con lo stato pre-commit, cioè produce esattamente lo stantio che l'operazione voleva togliere.
- **Invalidazione asincrona su BullMQ come percorso primario** — la coda vive sullo stesso Redis: se Redis è il problema, il rimedio non parte. E renderebbe best effort per costruzione ciò che le business rules dichiarano transazionale. La coda entra solo come ricorso di un `DEL` fallito (§ 6), dove il tentativo sincrono è già avvenuto.
- **`500` sulla pubblicazione con `DEL` fallito** — stato senza uscita: la Pagina è pubblicata e committata, ma il chiamante vede un errore e non ha modo di riprovare (`published → published` risponde `400`), e ammettere quella transizione creerebbe una Revisione per un guasto di Redis.
- **Chiave per `guid` invece che per percorso** — la lettura pubblica parte dal percorso, quindi servirebbe comunque una risoluzione percorso → `guid` a ogni richiesta: la query che la cache doveva evitare.
- **Cachare l'HTML invece del JSON** — due cache e due invalidazioni (ADR-22 § 6).
- **Cachare l'albero prima della migrazione** — riespone il costo della catena a ogni lettura.

## Conseguenza

`RedisService` cresce di un metodo e la sua docstring smette di essere vera: da F03 in poi
Redis ha due usi con due cicli di vita — sessioni con TTL, contenuto senza. Nasce inoltre una
coda BullMQ nuova, con il suo processor, il suo Dockerfile di worker già esistente e i suoi
test: è il prezzo dichiarato per non far dipendere l'esito di una pubblicazione dallo stato di
Redis. Un job che esaurisce i retry non ha un rimedio automatico: resta in `failed`, e l'audit
con l'elenco delle chiavi è ciò che rende manuale ma possibile il ripristino — va monitorato,
perché è l'unico punto in cui contenuto stantio può sopravvivere. Ogni percorso di scrittura
che tocca stato di pubblicazione o slug acquisisce una responsabilità di invalidazione che non
può delegare, e un test che la verifichi (`CLAUDE.md` § Testing già lo
pretende per l'archiviazione). Il numero di chiavi cresce con le pagine, non con il traffico.
Un deploy che tocca registro o migrazioni riparte a cache fredda: è voluto, ed è la ragione
per cui il `p95` da misurare dopo un rilascio è quello del percorso freddo (< 200ms), non
quello caldo.
