# ADR-61 — Retention delle Revisioni: potatura di sistema, mai azione utente

## Status
[ ] In discussione · [x] **Approvata** · [ ] Rifiutata · [ ] Superseded da ADR-XXX

## Data approvazione
2026-09-11 — approvata da: marketing@antelmagroup.net (decisione diretta in sede di task, scelta fra tre opzioni presentate)

## Decisione precedente superata
Nessuna. Scioglie il rinvio dichiarato da **ADR-19 § 5** («la potatura è rinviata e non si implementa … la contraddizione fra regola 2 e regola 5 va sciolta prima che esista contenuto in volume»). ADR-19 non viene modificata: il suo rinvio si esaurisce qui, come previsto dal suo stesso testo.

---

## Decisione

La **regola 2** di `business-rules.md` § Revisioni e cronologia si legge d'ora in poi come **«le Revisioni non si modificano»**. La cancellazione esiste, ma solo nella forma stretta descritta qui.

1. **Nessun percorso di scrittura utente cancella una Revisione.** Non esiste `DELETE` su `page_revisions` in nessuna superficie, admin o pubblica. Non esiste un endpoint, un pulsante o un parametro che pota su richiesta. Una Revisione non è mai soft-deletata: `page_revisions` resta append-only e conserva le **sole** quattro colonne previste per le tabelle append-only (`id`, `guid`, `createdAt`, `createdBy`) — nessun `isActive`, nessun `version`.
2. **La potatura è un processo di sistema**, eseguito come repeatable job BullMQ (mai `@Cron`, mai in linea con la pubblicazione), che rimuove fisicamente le righe eccedenti la soglia di retention.
3. **La soglia è configurabile** in `app_settings`, chiave `revisions.retentionCount`, gestibile Admin+ (10). Il valore `0` disattiva la potatura: la retention illimitata resta una configurazione ammessa, non un caso eccezionale.
4. **Due righe non sono mai potabili**, in nessuna configurazione: la Revisione puntata da `pages.publishedRevisionId` e la più recente della Pagina. Se la soglia fosse più bassa del numero di righe non potabili, vince la protezione, non la soglia.

   *Nota di stesura (2026-09-11, stesso giorno dell'approvazione).* La prima stesura proteggeva anche «la Revisione da cui discende la bozza corrente». È stata tolta prima di scrivere una riga di codice: `pages` non traccia quella discendenza — non esiste un `draftFromRevisionId` — e introdurla sarebbe una modifica di schema che nessuno ha approvato. La protezione non serve comunque alla correttezza: il ripristino **copia** lo snapshot in `draftContent` (regola 3), quindi potare la Revisione sorgente non lascia una bozza rotta, toglie solo un termine di paragone storico. Se in futuro quel termine di paragone dovesse contare, si traccia la discendenza con una ADR sua.
5. **La potatura è audit-logged** in forma aggregata (pagina, righe rimosse, soglia applicata, job id) via `AuditLogService`: il singolo snapshot rimosso non è ricostruibile, ma il fatto che sia stato rimosso sì.

Il `DELETE` fisico vietato dalla constitution è il `DELETE` come **operazione di dominio esposta a un utente**, che fa sparire un dato ancora vivo per qualcuno. La potatura di retention non è quello: nessun attore la invoca, non ha una superficie API, agisce solo su righe che la policy ha già dichiarato scadute, e non può mai raggiungere lo stato corrente di una Pagina. È una politica di ciclo di vita dello storage, non una cancellazione. Questa distinzione è il contenuto della presente ADR: senza di essa, la regola 5 resterebbe non implementabile.

## Alternative scartate

| Opzione | Motivo scarto |
|---|---|
| Immutabilità assoluta — cade la regola 5, nessuna retention mai | Coerente e semplice, ma ogni pubblicazione accumula uno snapshot `jsonb` completo che non esce mai dalla tabella: costo illimitato e non governabile, su un dato il cui valore decade col tempo |
| Potatura come soft delete (`isActive=false`) | Già scartata da ADR-19: non libera spazio, implementa il nome della regola 5 e non il suo scopo, e introduce su una tabella append-only la colonna che ADR-19 e la sezione Database di `CLAUDE.md` le vietano |
| Potatura su richiesta dell'utente, da UI | È esattamente il `DELETE` fisico vietato dalla constitution: un attore che fa sparire la storia di qualcun altro |
| Potatura sincrona dentro la transazione di pubblicazione | Accoppia il costo della retention alla latenza della pubblicazione e può far fallire una pubblicazione valida per una ragione che non la riguarda |
| Rinviare ancora | Secondo rinvio con la motivazione identica al primo; `page_revisions` è quasi vuota oggi e la migrazione costa zero, domani no |

## Conseguenze

- `business-rules.md` § Revisioni e cronologia va riscritto: la regola 2 diventa «non si modificano», la regola 5 va riformulata nei termini dei punti 2–4. **È una modifica a un documento normativo e richiede un'autorizzazione umana a sé**: questa ADR registra la decisione, non si auto-applica al testo delle business rules.
- Nasce una chiave `app_settings` nuova (`revisions.retentionCount`) con la sua guardia Admin+ e il suo DTO validato.
- Nasce un repeatable job BullMQ e la sua coda; il job va scritto con la stessa disciplina di `files-cleanup-queue`, che ha già il precedente di una rimozione di sistema non esposta a utente.
- Nessuna colonna nuova su `page_revisions`: la struttura append-only a quattro colonne è confermata, non estesa. Chi implementa non ha licenza di aggiungere `isActive` «per prudenza».
- La potatura **non si implementa prima** della riscrittura autorizzata di `business-rules.md`: finché il documento afferma due regole contraddittorie, il codice non ha una regola sola a cui conformarsi. La decisione è presa; l'ordine di esecuzione è documento prima, job dopo. *(Entrambi eseguiti il 2026-09-11, in quest'ordine: § Revisioni riscritto, poi `revisions-retention-queue` implementata.)*
- `page_revisions` cessa di crescere senza limiti, ma solo quando il job esiste: fino ad allora vale lo stato di ADR-19 (crescita illimitata), con la differenza che ora è uno stato transitorio con una fine dichiarata.
