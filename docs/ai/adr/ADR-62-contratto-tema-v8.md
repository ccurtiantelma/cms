# ADR-62 — Contratto `ThemeConfig` v8: sezione `layout` e catena di migrazione in lettura

## Status

[ ] In discussione · [x] **Approvata** · [ ] Rifiutata · [ ] Superseded da ADR-XXX

## Data approvazione

**2026-09-12** — approvata da: marketing@antelmagroup.net

## Rapporto con ADR-4

**Non la modifica**: ADR-4 resta com'è scritta (una ADR approvata non si riscrive). Questa la **supera limitatamente al numero di versione del contratto**, che ADR-4 descriveva fino a `version: 2` e la sua nota successiva fino a `version: 7`. Tutto il resto di ADR-4 — token semantici chiusi, versionamento esplicito, migrazione in lettura, soglia RBAC — resta in vigore e questa ADR lo conferma.

---

## Contesto

Il contratto `ThemeConfig` è a `version: 8` in codice dal commit `8b272f7` (2026-09-09), mentre l'ultima ADR che lo descrive si ferma più indietro. La divergenza è registrata da settimane come debito **D2** in `docs/ai/progress-tracker.md` ed è **misurabile**: quattro test di `settings.e2e-spec.ts` asseriscono `version: 7` su righe storiche migrate e falliscono, perché il codice risponde `8`. Non è un difetto del codice — la catena di migrazione funziona ed è coperta — è una decisione presa in un commit e mai registrata.

Questa ADR non introduce nulla di nuovo: **ratifica** ciò che è già in produzione, così che i test possano asserire il contratto corrente senza che farlo equivalga ad approvare di nascosto un cambiamento.

## Decisione

1. **Il contratto corrente è `version: 8`.** `THEME_CONFIG_VERSIONS = [8]`: solo v8 è accettata **in scrittura**, ogni altra versione è respinta con `400` — regola invariata rispetto ad ADR-4, applicata al nuovo numero.

2. **v8 aggiunge una sola sezione, `layout`**, che descrive la pagina pubblicata e non la chrome admin (coerente con ADR-42):

   | Campo                | Tipo                                         | Default di fabbrica |
   | -------------------- | -------------------------------------------- | ------------------- |
   | `pageBoxedWidth`     | numero                                       | `1200`              |
   | `pageBoxedWidthUnit` | unità CSS della whitelist                    | `px`                |
   | `margin`             | quattro lati (`top`/`right`/`bottom`/`left`) | tutti `0`           |
   | `marginUnit`         | unità CSS della whitelist                    | `px`                |
   | `padding`            | quattro lati                                 | tutti `0`           |
   | `paddingUnit`        | unità CSS della whitelist                    | `px`                |

   Nessun campo preesistente cambia forma o significato: v8 è **additiva**.

3. **Migrazione in lettura, mai in scrittura** (principio di ADR-4 invariato): una riga `app_settings` storica da v1 a v7 è migrata a v8 alla lettura e non viene riscritta sul database. `upgradeV7ToV8` innesta la sezione `layout` con i default di fabbrica — un tema salvato prima di v8 non aveva alcuna preferenza di layout da preservare, quindi il default è l'unica scelta non inventata. Le versioni più vecchie passano per la catena completa `v1→…→v7→v8`. Una versione **non nota** (config corrotta o scritta da un client futuro) torna ai default di fabbrica, non a un merge parziale.

4. **La soglia RBAC resta SuperAdmin.** `PUT api/v1/app/settings/theme` è `GuardSuperAdmin`, esattamente come prescritto da ADR-4 § 4. Lo stesso commit che ha portato il contratto a v8 aveva rimosso quel guard **senza sostituirlo**, lasciando la rotta aperta a ogni utente autenticato; la conformità è stata ripristinata il 2026-09-11. Questa ADR lo mette per iscritto perché non resti ambiguo: il contratto è cambiato, la soglia **no**.

## Alternative scartate

| Opzione                                                     | Motivo scarto                                                                                                                                                     |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Riscrivere ADR-4 portandola a v8                            | Una ADR approvata non si modifica: si supera con una nuova. Riscriverla cancellerebbe la traccia di quando e perché il contratto era a v2                         |
| Allineare i quattro test a `version: 8` senza alcuna ADR    | Ratificherebbe nei test un cambio di contratto che nessuno ha firmato: il posto dove si decide non è una `expect()`                                               |
| Riportare il codice a v7                                    | Il layout per lato è già usato dal sito pubblicato; tornare indietro romperebbe i temi salvati dopo il 9 settembre per sanare un difetto che è documentale        |
| Migrare le righe storiche **in scrittura** al primo accesso | Cambia il dato dell'utente durante una `GET`, e perde l'informazione su quale versione avesse davvero salvato. ADR-4 aveva già scartato questa strada             |
| Una ADR per ogni bump futuro del contratto                  | Sproporzionato per un'estensione additiva con default; resta invece obbligatoria per ogni cambio **non** additivo o che tocchi la semantica di un campo esistente |

## Conseguenze

- I quattro test di migrazione di `settings.e2e-spec.ts` vanno aggiornati ad asserire `version: 8` **contestualmente alla firma di questa ADR**, non prima. Finché la firma manca restano rossi di proposito: sono la prova visibile del debito D2, e spegnerli senza decidere lo renderebbe invisibile.
- D2 si chiude con questa firma.
- Il default `layout` (boxed 1200px, margini e rientri a zero) diventa il comportamento di ogni installazione che non lo personalizza, comprese quelle con un tema salvato da prima di v8.
- Un bump successivo **additivo con default dichiarato** non richiede una nuova ADR; un cambio di forma o significato di un campo esistente sì.
