# ADR-36 — Modello multilingua: righe autonome per Locale

## Status
[ ] In discussione · [x] Approvato · [ ] Rifiutato · [ ] Superseded da ADR-XXX

## Data approvazione
2026-08-25 — approvato da: marketing@antelmagroup.net

## RFC di riferimento
`docs/ai/rfc/RFC-F05-multilingua.md` (M5 — ADR di registrazione)

## Decisione
Una traduzione è una riga autonoma di `pages`, non un campo affiancato. Ogni Pagina ha un
`locale` (`varchar(10)`) e un `translationGroupId` (`char(16)` opaco, generato ex novo alla
creazione) condiviso da tutte le sue traduzioni; nessuna FK verso una tabella dedicata. La
decisione è già implementata da F01 (assunzione A3, scelta S4 di `SPEC-F01`, confermata il
2026-08-17) — questa ADR ne è la registrazione formale richiesta da `docs/roadmap.md` § F05,
non una nuova valutazione.

## Alternative valutate
- Campi affiancati per lingua (`title_it`, `title_en`, …) — scartata: richiede una migrazione ad ogni nuova lingua e produce una tabella di larghezza variabile con colonne quasi sempre nulle.
- `translationGroupId` come FK a una tabella `translation_groups` dedicata — scartata: nessun dato accumula sul gruppo stesso, solo un legame fra righe sorelle; una riga propria non avrebbe contenuto.
- `siteId`/`scopeId` per isolare le traduzioni per sito — scartata da A5 (mono-sito, più lingue): nessun multi-tenant da governare.

## Conseguenze
Nessun impatto tecnico nuovo: il codice (`schema.ts`, `pages.service.ts`) esiste da prima di
questa ADR. Chiude il debito formale nominato da `docs/roadmap.md` § F05 senza toccare la
roadmap stessa. Ogni feature futura che tocca le traduzioni (F05 §2–§4, F07 hreflang/sitemap)
eredita questo modello: una traduzione mancante è l'assenza di una riga, mai un campo nullo.

## Conformità
`app/backend/src/db/schema.ts` § PAGES (`translationGroupId`, indice
`pages_translation_group_idx`); l'indice di unicità `(translation_group_id, locale)`
introdotto da RFC-F05 §2 (M2) è il primo vincolo che rende operativo questo modello a livello
DB.
