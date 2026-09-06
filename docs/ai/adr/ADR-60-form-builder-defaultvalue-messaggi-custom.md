# ADR-60 — Form Builder: `defaultValue`/`validationMessage` sui campi, `successMessage`/`errorMessage` sul form

## Status
[ ] In discussione · [x] **Approvata** · [ ] Rifiutata · [ ] Superseded da ADR-XXX

## Data approvazione
2026-09-05 — approvata da: marketing@antelmagroup.net (autorizzazione diretta in sede di task, stesso pattern di ADR-38/47/50/51)

---

## Decisione

Quattro prop opzionali, additive con `default` dichiarato → nessun bump di `v` (stesso ragionamento di ADR-51):

| Blocco | Prop | `kind` | Uso |
|---|---|---|---|
| `form-field` | `defaultValue` | `plainText`, maxLength 500 | Valore iniziale per `text`/`email`/`textarea`/`select`; ignorato per `checkbox` (pattern già in uso: `options` è dichiarata su tutti i `form-field` ma usata solo da `select`) |
| `form-field` | `defaultChecked` | `boolean`, default `false` | Stato iniziale per `checkbox` |
| `form-field` | `validationMessage` | `plainText`, maxLength 200 | Messaggio mostrato via `setCustomValidity()` quando il campo obbligatorio fallisce la validazione nativa |
| `form` | `successMessage` | `plainText`, maxLength 300, default = testo attuale hardcoded (`"Grazie, il messaggio è stato inviato con successo."`) | Sostituisce la stringa fissa in `form-submit.js` |
| `form` | `errorMessage` | `plainText`, maxLength 300, default = testo attuale hardcoded (`"Non è stato possibile inviare il modulo. Controlla i campi compilati e riprova."`) | Unico messaggio generico per fallimento HTTP **e** di rete (oggi sono due stringhe distinte, si unificano in una personalizzabile) |

`form-submit.js` legge i nuovi valori da attributi `data-*` invece delle stringhe fisse; un form già pubblicato senza questi attributi mantiene il comportamento identico a oggi (default = testo corrente).

## Alternative scartate

- Messaggio di errore di rete separato da quello HTTP — scartato: la richiesta chiede un "errore generico", due prop per un caso che l'utente finale non distingue è complessità non richiesta.
- `validationMessage` unico e globale sul blocco `form` invece che per-campo — scartato: un messaggio di validazione ha senso solo in relazione al singolo campo (es. "Inserisci un'email valida" ha senso su `email`, non su `text`).
- Nuovo `kind` dedicato `richText`/`template` per i messaggi — scartato: sono testo semplice, `plainText` con `maxLength` basta, nessun nuovo `kind` per sempre (ADR-21 § 4).

## Conseguenza

`form-field.block.ts` passa da 6 a 8 prop, `form.block.ts` da 1 a 3; nessuna voce nuova nel registro `kind` (ADR-21 § 4 invariato). `PropertyInspector` riceve i campi via `PropField` generico, nessun nuovo `case`. `FormFieldBlock.tsx` applica `defaultValue`/`defaultChecked` come props React native; `form-submit.js` aggiunge `setCustomValidity` prima di `checkValidity()`. `blocks:export` + `blocks:types` da rieseguire. Nessuna migrazione, nessun impatto sui form già pubblicati (default = comportamento identico a oggi).

Ambito esplicitamente escluso da questa ADR (restano bloccati in attesa di RFC/ADR propria, vedi audit del 2026-09-05): nuovi `fieldType` (Number/Radio/File), Actions Engine configurabile (Email/Webhook/Collect Submissions selezionabili), integrazione Webhook, e qualunque cambio al meccanismo di submit (isola JS vs POST nativo con PRG).
