# ADR-11 — Scheduling: `@nestjs/schedule` (cron dichiarativo) + BullMQ repeatable jobs

## Status
[x] In discussione · [ ] Approvato · [ ] Rifiutato · [ ] Superseded da ADR-XXX

## Data approvazione
N/D — in attesa di approvazione umana (bozza generata da AI, vedi
`docs/instructions.md` → "Policy docs — chi scrive dove": gli ADR sono generati
su richiesta e attendono approvazione, mai auto-approvati).

## RFC di riferimento
Nessuna RFC dedicata. Punto 6 di un'analisi/audit richiesta esplicitamente
dall'umano (stesso audit di ADR-6 = punto 2, ADR-7 = punto 3, ADR-8 = punto 4,
ADR-10 = punto 5). Soluzione tecnica indicata direttamente dall'umano in chat:
"`@nestjs/schedule` per cron dichiarativi + un pattern BullMQ 'repeatable jobs'
per quelli che devono sopravvivere a restart/scaling orizzontale".

## Contesto

Prima di questo ADR l'unico meccanismo asincrono dello starter-kit era la coda
BullMQ `email-queue` (invio email, sempre on-demand/event-driven — mai
schedulata). Quasi ogni gestionale che erediterà questo starter-kit ha bisogno
anche di **job notturni/periodici**: pulizia dati, generazione report, invio
promemoria. Senza un pattern comune, ogni progetto verticale reinventerebbe da
zero come schedulare questi job, con rischio concreto di scelte sbagliate per
un contesto containerizzato multi-replica (ADR-6): un semplice `setInterval`
o un cron in-process va bene per una singola istanza, ma se l'app gira su più
repliche esegue lo stesso job **N volte in parallelo** — accettabile per un
task di sola lettura (es. log di metriche), pericoloso per un task con
side-effect (es. cancellazioni, invii duplicati).

Serve quindi distinguere esplicitamente due categorie di job schedulati, con
due meccanismi diversi:
1. **Cron dichiarativo single-instance-safe** (nessun problema se eseguito più
   volte in parallelo su repliche diverse, o se saltato un'esecuzione dopo un
   restart) → `@nestjs/schedule` (`@Cron`), in-process, zero infrastruttura
   aggiuntiva.
2. **Job che deve girare una volta sola su tutto il cluster e sopravvivere a
   restart/scaling orizzontale** (side-effect non idempotenti su larga scala,
   o comunque costosi da duplicare) → BullMQ **repeatable job**: la
   ricorrenza è persistita su Redis (non in-process), BullMQ garantisce
   l'esecuzione da parte di un solo worker per occorrenza anche con più
   repliche attive, e la schedulazione sopravvive a un restart dell'app.

Un caso concreto già documentato e rimandato: ADR-8 (storage documenti) nota
esplicitamente che il soft-delete di un file non rimuove subito il blob
fisico, e che "la pulizia fisica dei blob orfani è rimandata a un job
schedulato futuro". Questo ADR chiude quel rimando, usandolo come esempio
concreto (non un toy example) del pattern BullMQ repeatable job.

## Decisione

**A) `@nestjs/schedule` — cron dichiarativo**

Nuovo modulo infrastrutturale `app/backend/src/scheduler/`:
```
src/scheduler/
├── scheduler.module.ts          (ScheduleModule.forRoot() + BullModule.registerQueue di supporto)
└── tasks/
    └── queue-health.task.ts     (esempio: @Cron(EVERY_HOUR) logga i contatori delle code BullMQ)
```
`QueueHealthTask` è un esempio deliberatamente semplice e senza side-effect
(solo `Logger`, nessuna scrittura): dimostra il pattern `@Cron` da copiare per
altri job "safe se duplicato per replica" (es. altri log periodici, controlli
di osservabilità). Non è pensato per task con side-effect distribuiti — per
quelli vale il punto B.

**B) BullMQ repeatable job — pulizia blob orfani (`FilesModule`, ADR-8)**

Nuova coda `app/backend/src/queues/files-cleanup-queue/`, stesso pattern di
`src/queues/email-queue/` (`BullModule.registerQueue` + `@Processor`/
`WorkerHost`), con l'aggiunta di uno scheduler che registra la ricorrenza:
```
src/queues/files-cleanup-queue/
├── files-cleanup-queue.module.ts   (registra la coda, importa FilesModule per riusare STORAGE_DRIVER)
├── files-cleanup.processor.ts      (WorkerHost: trova i file isActive=false oltre il periodo di grazia, elimina il blob fisico)
└── files-cleanup.scheduler.ts      (OnModuleInit: registra/allinea il repeatable job su Redis)
```
- `FilesCleanupProcessor.process()` interroga `fileEntity` (`isActive = false`
  AND `updatedAt < now - filesCleanupGraceDays`), chiama
  `storageDriver.delete(storageKey)` per ciascuna riga trovata (batch limitato
  da `filesCleanupBatchSize`), **non tocca mai la riga DB** — nessun `DELETE`
  fisico (CLAUDE.md), la riga resta come traccia storica anche dopo la
  rimozione del blob.
- `FilesCleanupScheduler.onModuleInit()` allinea il repeatable job su Redis al
  pattern cron corrente: se il pattern in config è cambiato rispetto
  all'ultimo avvio, rimuove il vecchio repeatable job
  (`removeRepeatableByKey`) prima di registrarne uno nuovo — altrimenti un
  repeatable job resterebbe schedulato per sempre su Redis, indipendente dal
  deploy dell'app.
- **Disabilitato di default** (`FILES_CLEANUP_ENABLED=false`): rimuovere
  fisicamente un blob è un'azione distruttiva e irreversibile (a differenza
  del soft-delete della riga DB), quindi resta opt-in esplicito per il
  progetto verticale, non un comportamento automatico imposto dallo
  starter-kit.
- Nuove costanti in `AppConstants` (mai `process.env` diretto): 
  `filesCleanupEnabled`, `filesCleanupGraceDays` (default 30), 
  `filesCleanupCronPattern` (default `0 3 * * *`), `filesCleanupBatchSize` 
  (default 500, guardrail anti-runaway-query, non business rule).

**Prerequisito tecnico**: `StorageDriver.delete()` deve essere idempotente
(nessun errore se la key non esiste già), perché il job può ritentare sullo
stesso blob a ogni esecuzione finché non viene rimosso con successo.
`S3CompatibleDriver.delete()` lo è già nativamente (l'API S3 non lancia su key
mancante); `LocalDiskDriver.delete()` è stato corretto per catturare `ENOENT`
e trattarlo come no-op.

## Alternative valutate

| Opzione | Pro | Contro | Motivo scarto |
|---|---|---|---|
| **`@nestjs/schedule` (task safe-per-replica) + BullMQ repeatable job (task con side-effect distribuiti)** (scelta) | Ogni meccanismo usato per la categoria di job per cui è adatto; nessuna nuova infrastruttura oltre a Redis (già presente per BullMQ) | Nuova dipendenza npm (`@nestjs/schedule`, richiede approvazione — indicata esplicitamente dall'umano in chat) | — |
| Solo `@nestjs/schedule`, anche per job distruttivi/costosi | Un solo meccanismo da imparare, meno codice | In produzione multi-replica (ADR-6) lo stesso job gira in parallelo su ogni container: per un job di cancellazione fisica significherebbe tentativi concorrenti sullo stesso blob (mitigabile solo grazie all'idempotenza aggiunta, ma senza garanzia di esecuzione singola) | Scartato: non risolve il problema architetturale di fondo (nessuna deduplica tra repliche), l'idempotenza del driver è una mitigazione ma non sostituisce una garanzia di esecuzione singola |
| Solo BullMQ repeatable job, anche per task di semplice osservabilità (es. log metriche) | Un solo meccanismo, garanzia di esecuzione singola sempre | Overhead ingiustificato (coda + worker + persistenza su Redis) per un task che non ha bisogno di deduplica né di sopravvivere a restart | Scartato: over-engineering per task idempotenti/senza side-effect |
| Libreria esterna di distributed lock (es. Redlock) sopra `@nestjs/schedule` per garantire esecuzione singola anche coi cron in-process | Un solo meccanismo di scheduling per tutti i casi | Nuova dipendenza aggiuntiva, complessità di gestione lock/lease/timeout, mentre BullMQ (già in uso per `email-queue`) offre repeatable job pronti all'uso senza libreria in più | Scartato: BullMQ risolve lo stesso problema con l'infrastruttura già presente, nessun bisogno di reinventare un lock distribuito |
| Implementare subito anche la business logic di "report" e "promemoria" citata come esempio | Copertura più ampia degli use-case nominati dall'umano | Sarebbe logica di dominio (report/promemoria dipendono dal gestionale verticale) inventata senza spec — vietato da CLAUDE.md ("Inventare... business rules non documentate") | Scartato: lo starter-kit fornisce solo l'infrastruttura di scheduling, i job di dominio restano compito del progetto verticale |

## Conseguenze

- **Positive**: pattern riusabile e documentato per qualunque job notturno
  futuro (il progetto verticale copia `queue-health.task.ts` per cron
  dichiarativi, o la struttura di `files-cleanup-queue/` per repeatable job
  con side-effect); chiude il rimando esplicito di ADR-8 sulla pulizia blob
  orfani; nessuna nuova infrastruttura oltre a Redis (già presente).
- **Negative / attenzione**:
  - Nuova dipendenza npm `@nestjs/schedule` (^6.1.3, compatibile con
    `@nestjs/common`/`core` ^11 già in uso) — approvazione richiesta da
    CLAUDE.md "Ask first", ottenuta in chat (l'umano ha indicato
    esplicitamente questa libreria).
  - `FILES_CLEANUP_ENABLED=false` di default: il progetto verticale che vuole
    la pulizia fisica attiva deve impostarlo esplicitamente e scegliere un
    `FILES_CLEANUP_GRACE_DAYS` coerente con le proprie policy di retention
    (non definite dallo starter-kit, che resta senza logica di dominio).
  - `@Cron` di `QueueHealthTask` gira su ogni replica dell'app in produzione
    (nessuna deduplica): accettabile perché il task è solo un log di
    osservabilità, ma **non va copiato tal quale** per job con side-effect —
    quelli vanno sul pattern BullMQ repeatable job.
  - Il repeatable job non elimina mai la riga `files` (solo il blob fisico):
    nel tempo la tabella cresce comunque con righe `isActive=false` — accettato
    come costo per rispettare il divieto di `DELETE` fisico su entità
    anagrafiche (CLAUDE.md); un'eventuale archiviazione/purge dei metadata
    resta una policy di retention del progetto verticale, non decisa qui.
- **Documentazione**: aggiornati su richiesta esplicita `docs/system-architecture.md`
  (sezione "Job asincroni — BullMQ" estesa con scheduling), `docs/ai/progress-tracker.md`,
  `.env.example` (`FILES_CLEANUP_*`). Nessuna collezione Bruno: nessun nuovo
  endpoint HTTP (moduli puramente interni/infrastrutturali).

## Conformità

- File: `app/backend/src/scheduler/scheduler.module.ts`,
  `app/backend/src/scheduler/tasks/queue-health.task.ts`,
  `app/backend/src/queues/files-cleanup-queue/files-cleanup-queue.module.ts`,
  `files-cleanup.processor.ts`, `files-cleanup.scheduler.ts`;
  `app/backend/src/common/app-constants.ts` (costanti `filesCleanup*` + helper
  `bool()`); `app/backend/src/app.module.ts` (registrazione `SchedulerModule`/
  `FilesCleanupQueueModule` + validazione Joi nuove env var);
  `app/backend/src/files/files.module.ts` (`STORAGE_DRIVER` esportato per
  riuso); `app/backend/src/files/storage/storage-driver.interface.ts`,
  `local-disk.driver.ts` (delete idempotente), `s3-compatible.driver.ts`
  (commento, già idempotente nativamente); `.env.example`;
  `app/backend/package.json` (`@nestjs/schedule`).
- Test: `app/backend/test/unit/scheduler/queue-health.task.spec.ts` (1 test),
  `app/backend/test/unit/queues/files-cleanup-queue/files-cleanup.processor.spec.ts`
  (3 test: nessun candidato, rimozione multipla, fallimento parziale non
  bloccante), `files-cleanup.scheduler.spec.ts` (4 test: disabilitato,
  registrazione nuova, non ri-registrazione se pattern invariato, sostituzione
  se pattern cambiato), aggiunto 1 test in `local-disk.driver.spec.ts`
  (idempotenza `delete` su key inesistente) — 59/59 verdi sull'intera suite
  `test/unit` dopo le modifiche (14 suite).
- Come riverificare: `npm run build:backend && npm run lint:backend && npx
  jest test/unit --workspace=app/backend` (o dalla root con `--prefix
  app/backend`). Verifica manuale end-to-end (repeatable job reale contro
  Redis avviato, con `FILES_CLEANUP_ENABLED=true` e file soft-deleted di test)
  non eseguita in questa sessione — da fare al primo avvio reale dell'app con
  infrastruttura Docker attiva.
