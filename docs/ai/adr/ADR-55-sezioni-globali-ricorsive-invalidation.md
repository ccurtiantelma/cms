# ADR-55 — Riferimento in-tree a Sezioni Globali (`globalRef`) e fix invalidazione SSG

## Status
[ ] In discussione · [x] **Approvata** · [ ] Rifiutata · [ ] Superseded da ADR-XXX

## Data approvazione
2026-09-05 — approvata da: ccurti (RFC-55, Opzione A)

## RFC di riferimento
`docs/ai/rfc/RFC-55-blocchi-globali-sincronizzati.md`

## ADR estese da questa decisione
ADR-40 (Sezioni Globali e slot di layout) · ADR-21 (schema blocchi e versionamento,
dodicesimo tipo) · ADR-53 (air-gapped SSG, canale di propagazione)

---

## Decisione

**Dodicesimo tipo di blocco: `globalRef`.** Nodo puntatore, foglia (`children.allow: []`),
un'unica prop `globalSectionGuid` (nuovo `kind: 'globalSectionRef'`, stessa forma di
`mediaRef`/`pageRef`: 16 esadecimali, nessuna verifica di esistenza/stato a scrittura —
risolto a valle nel job di export, stesso principio di `pageRef`, ADR-52 § 4). Aggiunto a
`ROOT_ALLOWED` e a `children.allow` di `section`/`container`; nessun contenuto proprio da
sanitizzare.

**`global_sections` si generalizza, nessuna tabella nuova.** Una riga già approvata da
ADR-40 può essere referenziata da un nodo `globalRef` ovunque nell'albero `content` di
qualunque Pagina, non solo dai due `layoutSlot` fissi (`header`/`footer`, che restano
invariati). RBAC/CRUD/validazione/sanitizzazione riusati integralmente da ADR-40.

**Cicli chiusi per contratto, non per rilevamento a grafo.** Un nodo `globalRef` è
respinto (`BLOCK_TYPE_NOT_ALLOWED_IN_GLOBAL_SECTION`, 400) se l'albero in validazione
appartiene esso stesso a una Sezione Globale — nuovo flag
`BlockTreeValidationContext.insideGlobalSection`, impostato da
`GlobalSectionsService.runWriteContentPipeline`, mai da `PagesService`. Una Sezione
Globale non può quindi mai contenere, direttamente o indirettamente, un riferimento a se
stessa o a un'altra Sezione Globale: profondità di riferimento sempre zero all'interno di
una Sezione Globale. Nessuna Pagina può creare un ciclo perché una Pagina non è mai il
bersaglio di un `globalRef`.

**Fix del collegamento mancante (debito pre-esistente F06/ADR-40).**
`GlobalSectionsService.create/update/remove` invocano `ExportService.enqueueFullSiteExport()`
su ogni scrittura che tocca `content`, `layoutSlot` o `isActive` — sostituendo
integralmente `PublicGlobalSectionsCacheService`, che invalidava una chiave Redis
`public:*` che ADR-53 ha reso orfana (nessun consumer pubblico la legge più: rendering
statico pre-esportato). Il file e il provider sono eliminati, non deprecati.
`GlobalSectionsController.getActivePublic` legge direttamente dal database a ogni
chiamata (nessun cache-first): conforme ad ADR-53 § Conformità ("nessuna chiave Redis con
prefisso `public:` letta o scritta"), volume di lettura trascurabile (due righe). Nessun
indice inverso Pagina↔Sezione Globale: ogni scrittura rilevante accoda un full-site export
— stesso comportamento già accettato per header/footer da ADR-40, non un costo nuovo.

**Frontend**: azione di conversione (estrae il sotto-albero selezionato, lo sostituisce
con un nodo `globalRef`) sul modello di `duplicateNodeAction`, esposta da Floating
Toolbar/Inspector per contenitori/sezioni di primo livello. Il Canvas rende l'istanza con
bordo/badge distintivo ("Sezione Globale", `#8b5cf6`) per segnalare l'impatto trasversale.

## Alternative scartate

| Opzione | Motivo scarto |
|---|---|
| Nuova entità dedicata `global_blocks` (Opzione B di RFC-55) | Duplica CRUD/RBAC/cache/pipeline di validazione già approvati da ADR-40 per un problema quasi identico — due entità per un solo concetto di dominio |
| Solo nuovi `layoutSlot` fissi, nessun sesto/dodicesimo tipo (Opzione C) | Non consegna il riferimento libero in-tree richiesto; resta un descoping a posizioni fisse |
| Rilevamento cicli a runtime (grafo, visita in profondità sul riferimento risolto) | Richiederebbe risoluzione DB a scrittura (che il registro non fa per nessun altro `*Ref`) e una traversata su ogni save; il divieto per contratto (`insideGlobalSection`) elimina il ciclo per costruzione, a costo zero |
| Indice inverso Pagina↔Sezione Globale per invalidazione mirata | Ottimizzazione prematura: nessun volume di contenuto la giustifica oggi (stesso principio di "over-engineering" di `CLAUDE.md` § Orchestrator); il full-site export è già il comportamento accettato per header/footer |
| Propagazione realtime verso `public-site` (WebSocket/poll) | ADR-53 ha reso la superficie pubblica air-gapped: nessun runtime a cui propagare nulla in tempo reale |

## Conseguenze

Il registro blocchi passa a dodici tipi (`docs/ai/adr/ADR-21` § 5 resta lessico storico,
non si riformatta). `block-tree-validator.service.ts` guadagna un ramo di rifiuto
contestuale (non un nuovo `kind` di validazione strutturale) e il nuovo `kind:
'globalSectionRef'` nello switch dei `PropSpec`. `GlobalSectionsService` perde la
dipendenza da `PublicGlobalSectionsCacheService`/cache Redis e acquisisce quella da
`ExportService` (import di `ExportModule` in `GlobalSectionsModule`). Un full-site export
è un'operazione a costo proporzionale al numero di Pagine (ADR-53 § Conseguenze, "Rebuild
di massa"): ogni salvataggio di Sezione Globale ne accoda uno, comportamento invariato
rispetto a oggi per header/footer, esteso ora a qualunque riga referenziata da un
`globalRef`. Contenuto pre-esistente non ha nodi `globalRef` (tipo nuovo): nessuna
migrazione di contenuti salvati è necessaria per questa ADR.
