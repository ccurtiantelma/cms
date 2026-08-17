# ADR-19 — Revisioni immutabili (`page_revisions`)

## Status
[ ] In discussione · [x] **Approvata** · [ ] Rifiutata · [ ] Superseded da ADR-XXX

## Data approvazione
2026-08-17 — approvata dall'umano.

---

## Contesto

`business-rules.md` § Revisioni contiene due regole che, insieme al divieto assoluto di
`DELETE` fisico, non sono simultaneamente soddisfacibili: la **regola 2** ("le Revisioni
non si modificano e non si cancellano") e la **regola 5** (potatura delle revisioni
eccedenti oltre una soglia configurabile). La potatura esiste per liberare spazio; un soft
delete lascia la riga e il suo `jsonb` dove sono, quindi non fa la cosa per cui la regola è
stata scritta.

## Decisione

1. **`page_revisions` è append-only.** Una riga viene inserita alla pubblicazione e non è
   mai più toccata. Nessun endpoint `PATCH`/`DELETE`, nessun metodo di service che
   aggiorni o cancelli una revisione, nessun percorso applicativo di modifica.
2. **Lo schema afferma l'immutabilità, non la commenta**: la tabella porta solo `id`,
   `guid`, `createdAt`, `createdBy` (più le colonne di dominio dello snapshot), secondo la
   regola append-only di `CLAUDE.md` § Database. Niente `updatedAt`/`updatedBy` (dichiarano
   un percorso di modifica inesistente), niente `isActive` (è lo scivolo verso la
   cancellazione logica che la regola 2 vieta), niente `version` (non c'è concorrenza su
   righe che non si aggiornano).
3. **Snapshot completo (S1)**: ogni revisione contiene `title`, `slug`, `content`, `seo`
   integrali. Nessun diff, nessun riferimento alla riga viva: una revisione deve essere
   leggibile e ripubblicabile senza ricostruzioni.
4. **Il rollback è una ripubblicazione**, mai una riscrittura: `restore` crea una nuova
   bozza a partire dallo snapshot e non tocca la revisione online.
5. **La potatura è rinviata e non si implementa.** La contraddizione fra regola 2 e regola
   5 va sciolta con una decisione umana esplicita — presumibilmente un'eccezione stretta al
   divieto di `DELETE` fisico, circoscritta a un job di manutenzione con policy dichiarata,
   audit log obbligatorio e divieto di toccare l'ultima revisione pubblicata. **Va sciolta
   prima che esista contenuto in volume**, non prima che esista F01: su un sito nuovo la
   crescita è irrilevante, su un sito popolato la deduplica costa una migrazione manuale.

## Alternative scartate

- **Potatura come soft delete** — non libera spazio: implementa il nome della regola 5, non
  la sua funzione.
- **Svuotamento del payload (`content`/`seo` azzerati, riga conservata)** — formalmente
  compatibile col divieto di `DELETE`, ma è un `UPDATE` su una tabella dichiarata
  immutabile: viola la regola 2 in modo più insidioso perché sembra conforme.
- **Crescita illimitata come decisione definitiva** — abroga la regola 5 senza discuterla;
  rinviare è reversibile, abrogare no.
- **Revisioni come diff incrementali** — riduce lo spazio ma rende ogni lettura dipendente
  dalla catena precedente: un solo record corrotto rende irrecuperabile tutta la storia.

## Conseguenza

F01 implementa l'immutabilità e nient'altro: nessuna potatura, nessuna configurazione di
retention, nessuna colonna in previsione. L'assenza di percorsi di scrittura è verificata
da test, non dedotta dall'assenza di endpoint. Il debito è dichiarato e datato: senza la
decisione sulla potatura, `page_revisions` cresce senza limiti.
