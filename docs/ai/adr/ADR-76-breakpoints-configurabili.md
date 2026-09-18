# ADR-76 — Breakpoint configurabili: `RESPONSIVE_BREAKPOINTS` da costante a impostazione di sito

## Status
[ ] In discussione · [x] **Approvato** · [ ] Rifiutato · [ ] Superseded da ADR-XXX

## Data approvazione
2026-09-17

## RFC di riferimento
Nessuna RFC dedicata (round R0, vedi ADR-74 § "RFC di riferimento"). Riferimento sostanziale:
`docs/SPEC-propkind-v2.md` § 2.1.

## Numerazione
Vedi ADR-74 § "Numerazione": questo round occupa ADR-74–ADR-80.

## ADR superate da questa decisione
`ADR-29-proprieta-di-stile-per-breakpoint.md` § 2, limitatamente all'affermazione "i tre nomi sono
un elenco chiuso dichiarato una volta nel backend" e "le soglie in pixel stanno nel CSS": questa
ADR trasforma l'elenco dei nomi e le relative soglie da **costante di codice** a **dato di sito
configurabile**. Il resto di ADR-29 (`default` obbligatoria, cascata a una sola direzione,
`responsive` come modificatore booleano su `EnumPropSpec`, nessun nuovo `kind`) resta identico e
non riaperto.

---

## Contesto

`RESPONSIVE_BREAKPOINTS` esiste oggi in `prop-spec.types.ts` come tupla fissa a 3 nomi
(`default`, `tablet`, `mobile`), con soglie in pixel implicite nel foglio CSS generato
(`ADR-29 § 2`: "le soglie in pixel stanno nel CSS, mai nel contenuto e mai nel registro"). Elementor
Pro espone invece **7 viewport**, attivabili singolarmente, con soglie personalizzabili in px
(`ELEMENTOR_PRO_GAP_ANALYSIS_v2.md` riga 72: "Breakpoint custom (7 predefiniti attivabili + min/max
px editabili)"). Restare a 3 breakpoint fissi blocca ogni layout che debba distinguere, ad esempio,
un tablet in orizzontale da uno in verticale — un caso reale e frequente nei layout Elementor
importati o replicati dal committente.

Il vincolo tecnico non è nella forma del dato per-nodo (che ADR-29 ha già reso a oggetto aperto,
non a tupla posizionale) ma in **dove vive l'elenco dei nomi ammessi**: oggi è una costante di
modulo, condivisa fra validator (whitelist delle chiavi accettate) e renderer (soglie delle media
query). Renderla configurabile per sito sposta quell'elenco da compile-time a dato letto a runtime
di validazione — con la stessa cautela di ADR-45/ADR-53 per cui *nulla* nella pipeline pubblica può
dipendere da uno stato mutabile non ancora risolto a build-time.

---

## Decisione

1. **`app_settings.breakpoints`**: una riga della tabella esistente `app_settings`
   (`key: 'breakpoints'`, pattern già in uso per impostazioni singleton — stessa tabella di ADR-17
   per i settaggi applicativi, nessuna tabella nuova) con `value: jsonb` a 7 chiavi fisse,
   corrispondenti 1:1 ai 7 viewport Elementor-compatibili di `SPEC-propkind-v2.md` § 2.1:

   | chiave | tipo | default max-width/min-width | attivo default |
   |---|---|---|---|
   | `default` | base | — | sì, sempre |
   | `widescreen` | min-width | 2400px | no |
   | `laptop` | max-width | 1366px | no |
   | `tabletExtra` | max-width | 1200px | no |
   | `tablet` | max-width | 1024px | sì |
   | `mobileExtra` | max-width | 880px | no |
   | `mobile` | max-width | 767px | sì |

   `default` non è disattivabile e non porta soglia (è il valore che vale ovunque non sia
   sovrascritto, identico ad ADR-29 § 2). Le altre 6 chiavi hanno ciascuna `{ active: boolean,
   maxWidth?: number, minWidth?: number }`: `widescreen` è l'unica a dichiarare `minWidth` (non
   partecipa alla cascata verso il basso, `SPEC-propkind-v2.md` § 2.1), le altre 5 dichiarano
   `maxWidth`. Il default di attivazione (`tablet`+`mobile` attivi, gli altri 4 no) preserva senza
   migrazione il comportamento oggi cablato in ADR-29.

2. **`RESPONSIVE_BREAKPOINTS` (costante) diventa l'elenco chiuso dei **nomi possibili**, non più
   delle chiavi accettate.** Il validator continua a leggere una costante di modulo per
   l'esaustività dello switch (nessuna chiave arbitraria può mai comparire, `SPEC-propkind-v2.md`
   § 2.1 "il validator accetta solo chiavi attive"), ma la verifica "questa chiave è ammessa **ora**"
   confronta contro `app_settings.breakpoints[chiave].active`, non contro l'appartenenza
   all'elenco statico da sola. Una chiave nota ma disattivata in un valore scritto in precedenza
   **non è un errore di validazione**: il punto 4 sotto ne definisce il trattamento.

3. **Cascata dal più largo al più stretto, `widescreen` esclusa.** Identica a ADR-29 § 2 nella
   direzione (un breakpoint assente ricade sul più vicino verso `default`), estesa alle 7 chiavi:
   `mobile → mobileExtra → tablet → tabletExtra → laptop → default`. `widescreen`, essendo
   `min-width`, non fa parte di questa catena: un valore per `widescreen` assente non "ricade" su
   nulla, semplicemente quel breakpoint non riceve una regola propria e resta al valore di
   `default` per costruzione delle media query CSS, non per logica applicativa aggiuntiva.

4. **Disattivare un breakpoint con valori già salvati non cancella il dato.** Coerente con
   `SPEC-propkind-v2.md` § 2.1: l'atto di disattivazione richiede conferma esplicita nell'UI di
   Site Settings (PLAN R1 T7), il worker di export **ignora** la chiave disattivata durante la
   generazione del CSS (nessuna media query emessa per quella chiave), ma il valore resta nel
   `jsonb` del blocco. Riattivare il breakpoint in seguito fa riapparire il CSS senza richiedere
   che l'utente riscriva il valore — stessa logica difensiva delle migrazioni di ADR-21 ("valore
   non mappabile → default + warning, mai perdita"), applicata qui a "chiave temporaneamente non
   risolta" invece che "valore non mappabile".

5. **Il validator accetta solo chiavi *note* (le 7 dell'elenco chiuso) indipendentemente
   dall'attivazione**, e rifiuta chiavi *sconosciute* con lo stesso `reason: 'type'` già usato da
   ADR-29 per l'envelope malformato. La distinzione fra "chiave nota ma disattivata" (accettata,
   punto 4) e "chiave sconosciuta" (rifiutata) è quella che permette il flusso del punto 4 senza
   aprire il validator a un dizionario di chiavi libere: le 7 chiavi restano un'unione chiusa a
   livello di tipo TypeScript, il flag `active` è un dato di sito, non un'estensione del tipo.

6. **`meta.breakpoints` sull'envelope della Pagina/Revisione, non su ogni blocco.** Per rendere
   verificabile a quale insieme di chiavi attive un contenuto è stato validato al momento del
   salvataggio (`SPEC-propkind-v2.md` § 6, riga "envelope 1→2: breakpoints attivi registrati
   nell'envelope"), l'inserimento/aggiornamento di `draftContent` registra uno snapshot dei
   breakpoint attivi in quel momento in un campo di metadati della Pagina, non ripetuto per ogni
   nodo dell'albero (evitando la moltiplicazione ×N-nodi di un dato che è unico per l'intera
   pagina). Il worker di export usa lo snapshot solo come traccia diagnostica, mai come sorgente di
   verità: la sorgente di verità per il rendering resta sempre `app_settings.breakpoints` al
   momento dell'export, non lo snapshot storico — un cambio di configurazione deve poter
   rigenerare tutte le pagine con le nuove soglie senza richiedere un nuovo salvataggio di ognuna.

7. **Nessuna migrazione di `v` per i blocchi esistenti.** Un valore responsive scritto prima di
   questa ADR (`{default, tablet?, mobile?}`) resta valido byte-per-byte: le sue chiavi sono un
   sottoinsieme delle 7 nuove e coincidono con l'insieme di default attivato al punto 1. Stesso
   principio di non-migrazione di ADR-29 § 5, applicato qui all'ampliamento dell'elenco invece che
   alla sua introduzione.

---

## Alternative valutate

| Opzione | Pro | Contro | Motivo scarto |
|---|---|---|---|
| Restare a 3 breakpoint fissi | Costo zero, nessuna migrazione concettuale | Blocca ogni layout che distingua tablet orizzontale/verticale o laptop/widescreen; gap P1 dichiarato esplicitamente nel gap analysis | Non raggiunge la parità richiesta |
| 7 breakpoint fissi (attivi sempre, non configurabili) | Elimina il campo `active`, validator più semplice | Elementor stesso li rende disattivabili per motivo concreto: 7 media query sempre emesse gonfiano il CSS critico anche per siti che non ne usano più di 2 | Costo di peso CSS senza necessità reale |
| Soglie in pixel dentro il registro dei blocchi (per-tipo) | Massima libertà per singolo widget | Rompe il principio "le soglie stanno nel CSS, non nel contenuto" di ADR-29 § 2, che esiste apposta per evitare che un numero di pixel diventi parte del contratto di un tipo di blocco | Contraddice una decisione già approvata senza un fatto nuovo che la giustifichi |
| Un `kind` nuovo `breakpointConfig` invece di una riga `app_settings` | Validazione a schema dedicato | `app_settings` già ospita impostazioni singleton di sito (stesso pattern di `global_kit`, ADR-77); un `kind` di prop serve a validare valori di **blocco**, non impostazioni di sito | Categoria di dato sbagliata: non è una prop di un nodo dell'albero |
| Snapshot dei breakpoint attivi come sorgente di verità per l'export (invece che config corrente) | Riproducibilità storica esatta | Un cambio di configurazione non si propagherebbe mai alle pagine già pubblicate senza un flag di "forza rigenerazione"; contraddice l'aspettativa di Site Settings come impostazione realmente globale | La configurazione corrente deve restare la sorgente di verità del rendering |

---

## Conseguenze

- `prop-spec.types.ts`: `RESPONSIVE_BREAKPOINTS` resta l'unione chiusa dei 7 nomi a livello di
  tipo; una nuova funzione (`resolveActiveBreakpoints(settings)`) diventa il punto unico che
  incrocia l'unione chiusa con lo stato di attivazione per sito, usata sia dal validator sia dal
  worker di export — stesso principio "una funzione sola usata da entrambi i percorsi" di ADR-29
  § 4.
- Endpoint nuovo: `GET/PUT app/settings/breakpoints` (superficie amministrativa, Admin+ per la
  scrittura secondo la soglia RBAC di Site Settings), `GET public/global-kit.css` (ADR-77) include
  le media query solo per le chiavi attive.
- Il pannello responsive dell'inspector (icona breakpoint già esistente da ADR-29) mostra solo le
  chiavi attive, più un link "gestisci breakpoint" verso Site Settings (PLAN R1 T7/R3 T9) — nessuna
  chiave disattivata è mai proposta come opzione di editing, anche se il suo valore resta salvato
  su nodi preesistenti (punto 4).
- Disattivare un breakpoint con valori salvati richiede conferma esplicita nell'UI (punto 4): un
  test e2e dedicato copre il caso "disattiva → il CSS sparisce dalla pagina rigenerata → riattiva →
  il valore torna a comparire senza che l'utente lo riscriva".
- Nessuna modifica allo schema PostgreSQL oltre alla riga singleton in `app_settings`, già
  supportata dalla tabella esistente.

## Conformità

- Test del validator: chiave nota+attiva accettata; chiave nota+disattivata accettata (dato letto,
  non perso); chiave fuori dall'unione chiusa rifiutata con `reason: 'type'`.
- Test del worker di export: CSS generato non contiene media query per chiavi disattivate, anche
  se il valore del nodo le porta.
- Test di non-regressione: un valore a 3 chiavi (`default/tablet/mobile`) scritto prima di questa
  ADR valida e renderizza identico dopo, senza bump di `v`.
- Test e2e Site Settings: attivazione/disattivazione di un breakpoint aggiorna il canvas
  dell'editor (frame che si adegua, PLAN R3 T9) coerentemente con la configurazione corrente.

---

## Decisione umana

**Esito**: [x] Approvato così com'è · [ ] Approvato con modifiche (vedi note) · [ ] Rifiutato ·
[ ] Rinviato

**Approvato da**: marketing@antelmagroup.net · **Data**: 2026-09-17

**Note**: Approvazione confermata in sessione per sbloccare l'avvio del Sub-Task S1.1 (PropKind v2 & validatori NestJS).
