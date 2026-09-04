# ADR-24 — Routing e risoluzione degli slug

## Status
[ ] In discussione · [ ] Approvata · [ ] Rifiutata · [x] **SUPERSEDED da ADR-53**

## Data approvazione
2026-08-17 — approvata da: ccurti

> ### ⚠️ SUPERSEDED da ADR-53 — 2026-09-04
>
> **La risoluzione dinamica degli slug via API NestJS è sostituita dalla mappa delle rotte
> pre-compilata a publish-time e gestita direttamente dall'infrastruttura Edge/Nginx.** La
> discesa iterativa per segmenti (§ 1) non avviene più a ogni richiesta: diventa un calcolo del
> job di build che emette il percorso definitivo di ciascun file statico.
>
> Restano in vigore, trasferite ad ADR-53 come vincoli sulla forma dell'output: la forma
> canonica del percorso e il `308` (§ 4), la lingua di default senza prefisso (§ 5), il `404`
> uniforme per tutto ciò che non è servibile (§ 3, ora semplicemente l'assenza del file),
> i nomi riservati (§ 8) e il debito sui redirect (§ 6), non sanato da ADR-53.

---

## Decisione

1. **Risoluzione iterativa per segmenti, non percorso materializzato.** `(locale, /a/b/c)` si
   risolve scendendo un segmento per volta su `(locale, parentId, slug)` fra le righe attive:
   è l'inverso esatto dei due indici univoci parziali di PLAN-F01 § B.1, quindi la
   risoluzione è deterministica per costruzione e non per convenzione. Al massimo cinque
   letture indicizzate (`MAX_DEPTH`), su un percorso che la cache rende raro.

2. **Una pagina risolta serve la Revisione pubblicata, mai `draftContent`.** Il contenuto
   pubblico è `page_revisions.content` della riga puntata da `pages.publishedRevisionId`:
   traduzione diretta della regola 4 del modello di contenuto (bozza e pubblicato coesistono).
   Se `status = 'published'` e `publishedRevisionId` è nullo la riga è incoerente: `404` più
   log d'errore, **mai** un fallback sulla bozza, che servirebbe al pubblico contenuto mai
   pubblicato.

3. **`404` per tutto ciò che non è servibile, senza distinzioni.** Inesistente, `draft`,
   `review`, `scheduled`, `archived`, soft-deleted, o albero che fallisce migrazione o
   validazione (ADR-21 § 3.7): stessa risposta, stesso corpo, nessun header e nessun `code`
   che separi i casi. Mai `403` — un `403` conferma l'esistenza.

4. **Forma canonica del percorso: minuscolo, senza slash finale** (eccetto la radice).
   Qualunque altra forma risponde `308` verso la canonica. Serve a due cose insieme: una URL
   sola per contenuto, e una chiave di cache che è funzione totale del contenuto e non della
   digitazione (ADR-23 § 1).

5. **La lingua di default non ha prefisso; le altre lo avranno.** `/chi-siamo` è la lingua di
   default letta dalla configurazione, `/{locale}/...` è la forma prevista per le altre. **F03
   implementa solo il primo caso**: modellazione delle traduzioni, scelta dei codici,
   fallback e `hreflang` restano di F05/F07. Questa ADR decide solo la **forma della URL**, e
   la decide adesso perché rinviarla è l'unica opzione costosa: se le URL della lingua
   principale nascessero con un prefisso, F05 le cambierebbe tutte — cioè servirebbero
   esattamente i redirect che oggi non esistono (§ 6).

6. **F03 non implementa i redirect, e il costo va scritto.** Cambiare lo slug di una pagina
   pubblicata rompe la vecchia URL, che risponde `404` **subito**: la sua chiave di cache è
   invalidata da ADR-23 § 4, perché la vecchia URL non deve servire contenuto stantio né
   restare raggiungibile. La regola 4 di `business-rules.md` § Slug (proposta automatica di un
   `301`) non ha oggi una tabella su cui scrivere: `redirects` è prevista, non approvata, e la
   roadmap assegna i redirect a F07. Conseguenza operativa fino ad allora, che va detta ai
   redattori e non solo scritta qui: **non si cambia lo slug di una pagina già indicizzata**.

7. **`/` risolve la pagina radice con slug `home` nella lingua di default**; assente, `404`.
   Costante dichiarata, non configurazione — e promuoverla a impostazione non costerà una
   migrazione, perché `app_settings` è già una tabella chiave/valore.

8. **I nomi riservati restano quelli di `slug.util.ts`** (`api`, `admin`, `public`, `assets`,
   `_health`), che è l'elenco della regola 7 delle business rules. `robots.txt`,
   `sitemap.xml` e `llms.txt` **non** vi compaiono: F07/F08 dovranno aggiungerli, ed è una
   modifica alle business rules — una firma umana, non un'aggiunta silenziosa al `Set`.

## Alternative scartate

- **Colonna `path` materializzata** — seconda fonte di verità per lo stesso fatto, da ricalcolare su tutto il sottoalbero a ogni cambio di slug di un antenato e da tenere allineata con gli indici che già garantiscono l'unicità.
- **CTE ricorsiva unica** — una query in meno a profondità ≤ 5, in cambio di un pezzo di SQL che riesprime in un secondo linguaggio la regola già espressa dagli indici.
- **`403` sulle pagine non pubblicate** — conferma l'esistenza di contenuto non pubblicato, vietato dalla tabella delle superfici API.
- **Anteprima della bozza sul pubblico con un token** — mette contenuto non pubblicato su `public/`, divieto assoluto; l'anteprima è dell'editor (F04) e passa dalla superficie admin.
- **Prefisso di lingua su tutte le lingue, default inclusa** — URL più regolari, al prezzo di riscrivere ogni URL della lingua principale il giorno in cui arriva F05.
- **Slash finale accettato come sinonimo** — due URL e due chiavi di cache per lo stesso contenuto.
- **Risoluzione per `guid` sul pubblico** — `guid` è l'identificatore admin; esporlo darebbe una seconda URL stabile per pagina, cioè contenuto duplicato e un canale parallelo che ignora la gerarchia.

## Conseguenza

La risoluzione pubblica non introduce nessuna colonna e nessuna migrazione: usa gli indici che
F01 aveva già creato per un'altra ragione, e quel lavoro si ripaga qui. Il prezzo è dichiarato
ed è tutto sullo slug: finché F07 non porta i redirect, cambiare lo slug di una pagina
pubblicata è una rottura di URL senza rete, e la sola difesa è procedurale. La forma della URL
della lingua di default è fissata adesso: F05 eredita un vincolo invece di una scelta libera —
potrà decidere codici, fallback e `hreflang`, non se la lingua principale abbia un prefisso.
