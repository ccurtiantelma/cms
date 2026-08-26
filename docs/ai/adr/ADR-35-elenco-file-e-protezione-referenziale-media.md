# ADR-35 — Elenco paginato dei file e protezione referenziale su `DELETE`

## Status
[ ] In discussione · [x] Approvato · [ ] Rifiutato · [ ] Superseded da ADR-XXX

## Data approvazione
2026-08-25 — approvato da: marketing@antelmagroup.net

## RFC di riferimento
`docs/ai/rfc/RFC-F09-media-library.md` (approvazione parziale — N1, N3, N5, N7)

## Decisione
`GET api/v1/app/files` elenca **tutti** i file leggibili da ogni ruolo autenticato, **senza
predicato di ownership** — deroga consapevole al riflesso "ownership ovunque" di ADR-18,
perché i media editoriali sono risorsa condivisa mono-tenant (A5). L'esclusione delle righe
non editoriali (`entity != 'page-media'`) è un default **server-side**, mai delegato al
parametro `entity` del chiamante. Nessuna rotta `/files/upload` nuova: si riusa `POST
api/v1/app/files` già in servizio. `DELETE api/v1/app/files/:guid` rifiuta con **409
Conflict** la cancellazione di un file referenziato da una prop `kind: 'mediaRef'` di un
blocco appartenente a una pagina in stato `published`; nessuna cancellazione silenziosa,
nessun avviso soft.

## Alternative valutate
- Elenco con predicato di ownership per riga (ogni autore vede solo i propri media) — scartata: duplica lo stesso asset per ogni autore su un sito mono-tenant.
- Rotta dedicata `POST api/v1/app/files/upload` — scartata: doppione di una rotta già in servizio, due punti di applicazione dello stesso limite/validazione MIME.
- `DELETE` che procede con sola cancellazione soft e avviso (nessun blocco) — scartata: produce immagini rotte in produzione su pagine pubblicate, senza possibilità di prevenzione.

## Conseguenze
`FilesController`/`FilesService` guadagnano `list()` e il controllo referenziale in
`deleteFile()`; nessuna migrazione di schema (le colonne `width`/`height` restano N2, non
firmate, fuori da questa ADR). Un autore che tenta di eliminare un media in uso da una
pagina pubblicata riceve `409` e deve prima rimuovere il riferimento o spubblicare la
pagina — comportamento nuovo su una rotta già esistente, da verificare in Bruno/Supertest.

## Conformità
`bruno/files/list-files.yml`, `bruno/files/delete-file-referenced.yml` e i test
`files.service.spec.ts` coprono paginazione/ricerca dell'elenco e il rifiuto `409` sul
`DELETE` referenziato.
