# ADR-20 — Sanitizzazione HTML server-side

## Status
[ ] In discussione · [x] **Approvata** · [ ] Rifiutata · [ ] Superseded da ADR-XXX

## Data approvazione
2026-08-17 — approvata dall'umano, dipendenza inclusa.

---

## Contesto

F01 valida solo la **forma esterna** dell'albero di blocchi, quindi accetta qualsiasi
`type` con qualsiasi `props`: un `props.html` contenente `<script>` supererebbe la
validazione e verrebbe persistito. Alla pubblicazione finirebbe in `page_revisions`, che è
**immutabile per contratto** e quindi non risanabile a posteriori. Il rinvio non produce un
debito, produce un danno permanente. Il backend non ha oggi alcun sanitizzatore: l'unico
`sanitize*` in codice è la redazione dei log.

## Decisione

**Libreria scelta: `sanitize-html` (^2.17.7)**, dipendenza di `app/backend`.

Motivo: è una libreria server-side nativa costruita su `htmlparser2` — nessuna emulazione
di DOM, nessun `jsdom` — con API **allowlist-first** (`allowedTags`/`allowedAttributes`/
`allowedSchemes`: ciò che non è dichiarato non passa), parsing tollerante dell'HTML
malformato con riserializzazione normalizzata, e un filtro CSS integrato per gli attributi
`style`. È la sola candidata in cui la configurazione predefinita del progetto è
un'allowlist esplicita anziché una denylist da mantenere.

**Punto di applicazione**: il sanitizzatore percorre l'albero e tratta **ogni prop di tipo
stringa, a qualunque profondità e sotto qualunque `type`**, **prima della persistenza** —
non "il blocco `richText`": F01 non sa quali blocchi esistono, quindi tratta ogni stringa
come ostile. Si applica sia a `draftContent`/`draftSeo` a ogni `PATCH`, sia allo snapshot
che entra in `page_revisions` alla pubblicazione. La **struttura** dell'albero (chiavi,
`id`, `type`, `children`) resta invariata: si toccano i valori, non la forma. Un albero non
sanitizzabile è respinto **per intero**, mai persistito a metà.

**Allowlist di F01: volutamente minima** — formattazione inline e struttura di paragrafo di
base, `href` limitato agli schemi `http`/`https`/`mailto`, nessun `<script>`, nessun
`<iframe>`, nessun handler `on*`, nessuna URL `javascript:`. L'allowlist **per tipo di
blocco** è un contratto di dominio e appartiene al registro dei blocchi di F02: F01 non la
anticipa. Restringere e poi allargare è reversibile; il contrario no.

## Alternative scartate

- **`isomorphic-dompurify`** — trascina `jsdom` (~30 MB di dipendenze transitive e un DOM
  completo emulato) in un processo server dove nessun DOM serve: superficie di attacco e
  costo di avvio sproporzionati rispetto al lavoro svolto.
- **`dompurify` puro** — pensato per il browser; server-side richiede comunque un DOM
  esterno, cioè lo stesso problema senza il wrapper.
- **`xss`** — dimensione minima, ma il modello di whitelist è meno espressivo sugli
  attributi e la manutenzione upstream è marcatamente più lenta di `sanitize-html`.
- **Regex / strip dei tag scritto in casa** — l'HTML non è un linguaggio regolare: ogni
  implementazione artigianale è una CVE con data da destinarsi.
- **Sanitizzazione solo lato client** — cosmetica: l'API resta scrivibile direttamente.

## Conseguenza

Una dipendenza npm in più nel backend, da tenere aggiornata come superficie di sicurezza.
In cambio, nessun contenuto non sanitizzato può entrare in una riga immutabile. Il costo
accettato è che l'allowlist minima può mutilare contenuto legittimo finché F02 non la
allarga per tipo di blocco: è il verso reversibile dell'errore.

**Correzione 2026-08-17 (T3)**: la valutazione iniziale della superficie di `sanitize-html`
non distingueva un dettaglio rilevante. `postcss`, usato dal filtro CSS integrato per
l'attributo `style`, era già presente nel repository ma solo come `devDependency` di Vite
nel frontend — esclusa dallo stage `prod-deps` del Docker e mai spedita in produzione. Come
dipendenza transitiva di `sanitize-html` in `app/backend`, entra invece come dipendenza
**runtime del backend** e viene spedita in produzione: è superficie nuova, non una
duplicazione di superficie già accettata. Mitigazione: la configurazione del sanitizzatore
non allowlista mai l'attributo `style` (`allowedStyles: {}`), quindi `sanitize-html` non
invoca mai `postcss` — il code path resta morto per costruzione, commentato esplicitamente
nella config (`app/backend/src/common/sanitizer/`).
