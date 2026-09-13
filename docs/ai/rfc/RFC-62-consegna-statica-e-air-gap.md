# RFC-62 — Consegna statica e air-gap: scelta dell'adapter di `StaticSiteDeployer`

## Status
[ ] In discussione · [x] Approvato → genera ADR-63 · [ ] Rifiutato

## Proposto da
AI Orchestrator (Senior Solution Architect) · Data: 2026-09-12

---

## ⚠️ Premessa — cosa questa RFC **non** rimette in discussione

`ADR-53` è approvata (2026-09-04) e non si modifica. Questa RFC non la supera e non la
reinterpreta: ne **chiude un'opzione lasciata aperta**. Il § 4 di ADR-53 impone che i file
`.html` e gli asset siano sincronizzati verso «uno storage distribuito (CDN edge, bucket
S3-compatibile o **volume Nginx isolato**)» e che il flusso sia solo push — ma non sceglie
quale dei tre. Restano quindi fermi, e fuori discussione qui:

- **Build-on-Publish** e la coda `static-export` (ADR-45/53 § 1) — nessuna coda nuova.
- **Push, mai pull** (ADR-53 § 4): il worker scrive verso il piano pubblico; il piano
  pubblico non interroga nulla.
- L'interfaccia `StaticSiteDeployer` a **due metodi** (`write`/`remove`) già in produzione
  (`app/backend/src/export/deploy/static-site-deployer.interface.ts`), con
  `LocalFolderDeployer` come unica implementazione attiva. Questa RFC **non** propone un
  terzo metodo, né un registro di provider dinamici: `PLAN-F03` T5 marca esplicitamente
  quel percorso come over-engineering.
- `app/public-site` resta **motore di anteprima sul Piano di Gestione** (ADR-53 § 5), mai
  un processo sul piano pubblico, qualunque adapter si scelga.

Questa RFC risponde a una sola domanda: **quale forma prende il Piano di Erogazione
Pubblica, e a quale prezzo in credenziali, costo, compliance e verificabilità.**

---

## Problema

`PLAN-F03` T5 è bloccato, e T6 con lui per dipendenza dichiarata. Il blocco non è tecnico:
l'interfaccia esiste, l'adapter locale funziona, il refactoring è fatto. Il blocco è che
**scegliere il secondo adapter non è un refactoring ma la scelta di un provider**, e tre
fonti indipendenti la subordinano tutte a una firma che non esiste:

| Fonte | Cosa vieta |
|---|---|
| `CLAUDE.md` § Ask first | «provider esterni (LLM, captcha, **CDN**)» richiedono approvazione umana |
| `PLAN-F03` T5 § Output atteso | «`S3Deployer`/`CloudflarePagesDeployer` restano dichiarati, non implementati, finché un'ADR dedicata non approva un provider concreto» |
| `static-site-deployer.interface.ts` (commento normativo) | vieta perfino lo **stub**: «uno stub non testabile darebbe un falso senso di completamento» |

Il costo del blocco non è solo T5. È che **l'air-gap di ADR-53 oggi non è verificato da
nulla**: `PLAN-F03` § Falle logiche lo registra come *«proprietà auspicata»*, e
`docs/system-architecture.md` § Topologia lo dichiara *«di infrastruttura/rete, verificabile
a livello di configurazione di deploy»* — cioè a livello di un file di deploy che, nella
topologia attuale (`docker-compose.prod.yml`), **non esiste ancora nella forma che
l'air-gap richiede**: backend, frontend e `public-site` stanno oggi su un'unica rete Docker
implicita, e non c'è alcun servizio che serva i file statici.

La scelta dell'adapter e la forma della verifica d'air-gap non sono quindi due decisioni:
sono la stessa decisione guardata da due lati. Un adapter che spedisce a un terzo rende
l'air-gap **strutturale ma non asseribile da CI**; un adapter che scrive su un volume lo
rende **asseribile da CI ma solo a livello di container**. È esattamente il compromesso che
va firmato, non nascosto in un'ADR che dica solo «si usa X».

---

## Soluzione proposta

### 1. Le tre strade, sui quattro assi richiesti

#### Asse A — Credenziali e loro custodia

| | **CDN edge** (Cloudflare Pages/R2, Fastly, Bunny…) | **Bucket S3-compatibile** (AWS S3, MinIO, Scaleway…) | **Volume Nginx isolato** |
|---|---|---|---|
| Credenziale necessaria | API token del provider, a vita lunga | Coppia access key / secret key | **Nessuna** |
| Dove vive | `.env` del Piano di Gestione + (per un gate di CI) nei secret di GitHub Actions | `.env` del Piano di Gestione, stesso meccanismo già in uso per ADR-8 | — (permessi filesystem, dichiarati in `docker-compose.prod.yml`) |
| Ambito minimo ottenibile | Spesso token "deploy + purge" sull'intera zona: di fatto **scrittura sul volto pubblico del brand** | `PutObject`/`DeleteObject` sul solo bucket statico, `ListBucket` negato | — |
| Rotazione | Manuale, nessun supporto nativo | Manuale, nessun supporto nativo | Non applicabile |
| Superficie di governance nuova | **Sì**: l'account del provider è un secondo registro di identità (utenti, 2FA, ruoli) fuori da RBAC e fuori dall'`audit_log` del CMS | Sì se gestito (stesso problema, ambito minore); **no** se MinIO self-hosted | **No** |

Tre osservazioni che pesano più della tabella:

1. **Una credenziale che non esiste non può trapelare, non va ruotata e non va custodita.**
   È l'unico argomento che nessuna buona pratica di gestione dei segreti pareggia. Il volume
   Nginx isolato è la sola opzione che lo offre.
2. **Riusare `STORAGE_S3_*` per l'export sarebbe un errore, non una scorciatoia.** Quelle
   credenziali (ADR-8, `s3-compatible.driver.ts`) governano il bucket dei **documenti**, che
   contiene upload privati. Il bucket statico è world-readable per definizione. Fondere i due
   domini di fiducia significa che una fuga della chiave del sito pubblico espone i documenti
   riservati. Se si sceglie S3, servono **bucket separato e coppia di chiavi separata**
   (`STATIC_EXPORT_S3_*`), mai le stesse — vedi **M2**.
3. **Un token di deploy in CI riapre il problema che l'air-gap chiudeva.** Se la verifica di
   T6 deve girare contro il provider reale, il token va messo nei secret di GitHub Actions:
   la superficie di custodia si duplica proprio nel punto (la CI) che ha il minor controllo
   d'accesso dell'intero sistema.

#### Asse B — Superficie di costo

| | CDN edge | Bucket S3-compatibile | Volume Nginx isolato |
|---|---|---|---|
| Costo marginale per pagina servita | Richieste + banda in uscita, metrate | Richieste `GET` + banda (se gestito); **zero** se MinIO self-hosted | **Zero** |
| Costo di un full-site rebuild | `PUT`/build minutes proporzionali al catalogo, **a ogni rebuild** | `PUT` proporzionali al catalogo | Scritture su disco locale |
| Prevedibilità | Bassa: il traffico anonimo è la variabile che il CMS non controlla | Media (storage prevedibile, banda no) / **Alta** con MinIO | **Alta**: il costo è la macchina che già esiste |
| Nuove dipendenze npm | Sì (SDK del provider) → `CLAUDE.md` § Ask first, firma a sé | **No**: `@aws-sdk/client-s3` è già in `app/backend` per ADR-8 | **No**: `nginx:1.27-alpine` è già nel parco immagini (`app/frontend/Dockerfile`) |
| Rischio economico asimmetrico | **Sì**: un attacco volumetrico sul pubblico diventa una fattura invece di un'indisponibilità | Attenuato (banda metrata ma senza build minutes) | No: diventa carico sulla macchina, cioè un problema di capacità, non di budget |

Il punto non ovvio è l'interazione fra il costo e il **fan-out di ADR-53 § Conseguenze**: un
cambio di tema, di impostazioni globali o un incremento di `v` nel registro dei blocchi non
invalida chiavi, **rigenera file** — un'operazione O(catalogo) che ADR-53 dichiara «da
schedulare e osservare». Su un CDN a build minutes, ogni rebuild di massa è una voce di
costo; su un volume locale è tempo di CPU già pagato. Con un catalogo piccolo la differenza
è rumore; è a tre o quattro cifre di pagine che diventa la voce dominante — e va firmata
prima, non scoperta dopo.

#### Asse C — Modello di compliance

| | CDN edge | Bucket S3-compatibile | Volume Nginx isolato |
|---|---|---|---|
| Terza parte coinvolta | **Sì**, responsabile del trattamento | Sì se gestito · **No** se MinIO self-hosted | **No** |
| DPA / sub-responsabile da dichiarare | Sì | Sì se gestito | No |
| Residenza del dato | **Globale per costruzione** — la distribuzione sui PoP *è* il prodotto; pinnarla a una regione contraddice il motivo per cui si sceglie un CDN | **Dichiarabile e pinnabile** a una regione (`STORAGE_S3_REGION` è già il pattern) | Dove sta la macchina |
| Dato personale trattato dal terzo | **Sì**: i log d'accesso (IP dei visitatori) sono dato personale, e li tratta il provider | Sì se gestito | No: i log restano nostri |
| Contenuto a rischio | Basso: sull'edge finisce solo contenuto `published`, pubblico per definizione | Idem | Idem |

Il contenuto in sé non è il problema — è pubblico. Il problema di compliance è **il
traffico**: chi vede quali IP, sotto quale giurisdizione, con quale DPA. Vale la pena
notare che oggi l'ingestione delle pageview passa da `app/public-site`
(`ingestPageview`): spostando la consegna su un CDN, il percorso analitico cambia
proprietario e quella scelta va rifatta consapevolmente, non ereditata.

#### Asse D — Forma della verifica d'air-gap resa possibile in T6

È l'asse decisivo, perché `PLAN-F03` T6 § Criterio di Done pretende che le asserzioni girino
**sull'artefatto reale**, non su un mock — e perché `docs/system-architecture.md` dichiara
l'air-gap «verificabile a livello di configurazione di deploy». Una proprietà che nessun test
può toccare è una proprietà che, fra sei mesi, nessuno saprà se vale ancora.

**CDN edge — verifica strutturale, asserzione impossibile in CI.**
L'air-gap è massimo: il piano pubblico è l'infrastruttura di un'altra organizzazione, priva
per costruzione di rotte verso la nostra VPC. Ma non esiste un test che possa asserirlo:
non si ispeziona il firewall di terzi. T6 degrada a *(i)* un test di contratto sull'adapter
(prova che chiama solo `write`/`remove`, mai una lettura di ritorno) e *(ii)* una voce di
checklist di go-live. Per andare oltre servirebbe un account reale raggiungibile dalla CI,
con il token in `secrets` — cioè peggiorare l'asse A per migliorare l'asse D.

**Bucket S3-compatibile — verifica reale, se il bucket è MinIO in compose.**
Con un MinIO avviato come servizio, T6 può girare per intero in CI: il worker scrive via
adapter, il test verifica che l'oggetto esista e sia leggibile solo in lettura anonima, che
il listing sia negato, e che il container che serve il pubblico **non abbia rotta** verso
`postgres`/`redis`/`backend`. Con un provider gestito si ricade nel caso CDN.

**Volume Nginx isolato — la verifica più completa e interamente automatizzabile.**
È l'unica opzione in cui l'air-gap è espresso in un file **di questo repository**
(`docker-compose.prod.yml`), quindi diffabile, revisionabile e asseribile:

```
reti:  mgmt_net  ← backend, postgres, redis, public-site (anteprima), export worker
       edge_net  ← nginx-static  (e solo lui)
volume static_site:  rw per il backend (worker)  ·  ro per nginx-static
```

T6 può allora asserire, sul compose reale e non su un mock:

1. dal container `nginx-static`, una connessione TCP verso `postgres:5432`, `redis:6379`,
   `backend:3000` **fallisce** (DNS irrisolto o connessione rifiutata) — è la Regola
   Air-Gap di ADR-53 § 4 tradotta in asserzione eseguibile;
2. il volume è montato `ro` sul lato pubblico: una scrittura dal container Nginx fallisce;
3. un `GET` sul path di una Pagina pubblicata restituisce **esattamente il file scritto dal
   job di export** — che è già il criterio di T6, qui verificabile senza mock di rete;
4. il tombstone (ADR-45) rende lo stesso path un `404`, e nessun processo lo può
   rigenerare a runtime perché sul piano pubblico non ne esiste nessuno.

> **Rilievo architetturale che non va sotto silenzio.** ADR-53 § Alternative valutate ha
> **scartato** «SSG solo su filesystem locale» con la motivazione: *«il volume è condiviso
> con il piano di gestione: l'air-gap resta dichiarativo»*. L'opzione ammessa dal § 4 non è
> quindi «il volume che già usa `LocalFolderDeployer`»: è un volume **isolato**, ed è
> l'isolamento (rete separata, mount `ro`, nessun processo del Piano di Gestione che lo
> raggiunga oltre al worker) a distinguerla dall'alternativa respinta. Scegliere il volume
> Nginx **senza** M3 significherebbe implementare l'alternativa che ADR-53 ha scartato. M3
> non è decorazione: è la condizione di ammissibilità dell'opzione.

### 2. Sintesi e raccomandazione

| Asse | CDN edge | S3 gestito | S3 / MinIO self-hosted | Volume Nginx isolato |
|---|---|---|---|---|
| Credenziali | 🔴 token ad ampio raggio + governance esterna | 🟡 chiavi dedicate, ambito minimo | 🟡 chiavi dedicate, nessun terzo | 🟢 **nessuna** |
| Costo | 🔴 metrato e non prevedibile | 🟡 metrato, prevedibile | 🟢 zero marginale | 🟢 zero marginale |
| Compliance | 🔴 terzo + residenza globale + IP dei visitatori | 🟡 terzo, residenza pinnabile | 🟢 nessun terzo | 🟢 nessun terzo |
| Verifica in T6 | 🔴 non asseribile da CI | 🔴 non asseribile da CI | 🟢 asseribile per intero | 🟢 **asseribile per intero, nel repo** |
| Distribuzione geografica | 🟢 nativa | 🟡 una regione | 🔴 una macchina | 🔴 una macchina |

**Raccomandazione: `NginxVolumeDeployer` come primo e unico adapter attivo** — cioè
`LocalFolderDeployer` invariato nel codice, reso ammissibile da una topologia di rete che
oggi non esiste (M3). Nessun provider esterno attivato, nessuna credenziale nuova, nessuna
dipendenza npm nuova, e l'unica delle quattro strade che rende l'air-gap una cosa che la CI
può bocciare invece di una frase in un'ADR.

La distribuzione geografica è **l'unica cosa che si rinuncia**, ed è una rinuncia reversibile:
`StaticSiteDeployer` esiste proprio perché il giorno in cui il TTFB fuori Europa diventa un
requisito misurato si aggiunge un secondo adapter senza toccare `ExportProcessor`. Quel
giorno la scelta ricadrà su **S3-compatibile** (M2 già firmata, SDK già presente, residenza
pinnabile) e non sul CDN, a meno di un requisito di banda che oggi nessun NFR esprime:
`docs/non-functional-requirements.md` § Performance pubblica non contiene alcuna soglia
geografica.

### 3. Cosa resta espressamente fuori

- **Nessuna riga di codice** prima della firma, stub compresi (vincolo di
  `static-site-deployer.interface.ts`, qui confermato).
- **Nessun provider attivato**, nessun account aperto, nessuna chiave generata.
- **TLS, dominio e reverse proxy di bordo** restano fuori scope come già dichiarato in
  `docker-compose.prod.yml`: il container Nginx statico serve HTTP sul piano pubblico, il
  terminatore TLS sta davanti nell'ambiente di hosting.
- **Redirect** (debito ADR-24 § 6, ribadito da ADR-53 § Conseguenze) restano a F07.

---

## Alternative valutate

**Attivare il CDN subito, "tanto è la destinazione finale".** Scartata: anticipa una
credenziale, un contratto e un responsabile del trattamento per un requisito — la latenza
intercontinentale — che nessun NFR esprime oggi. È la definizione di over-engineering
contro cui `PLAN-F03` § Rischi mette in guardia per questo stesso task.

**Implementare due adapter e sceglierli via env (`STATIC_EXPORT_DRIVER`).** Scartata ora:
il secondo adapter senza un provider firmato è precisamente lo stub che
`static-site-deployer.interface.ts` vieta. Il pattern a env (`STORAGE_DRIVER` di ADR-8) resta
la forma corretta **il giorno in cui** il secondo adapter avrà una firma propria — non è una
strada diversa, è la stessa rimandata.

**Lasciare `LocalFolderDeployer` così com'è, senza topologia di rete.** Scartata: è
letteralmente l'alternativa che ADR-53 ha già respinto («l'air-gap resta dichiarativo»).
Sbloccherebbe T5 sulla carta lasciando T6 senza nulla da verificare.

**Rsync/SSH verso una macchina pubblica separata (option C su due host).** Scartata per ora:
è "S3 fatto in casa" — reintroduce una credenziale (chiave SSH) e un canale da monitorare,
per ottenere una separazione che a questa scala la separazione di rete fra container già
fornisce. Resta la via naturale di crescita se il piano pubblico dovrà stare su un host
proprio, e allora vale M2 nello spirito (credenziale dedicata, ambito minimo).

**Riusare il bucket documenti di ADR-8 per i file statici.** Scartata senza riserve: fonde
un bucket privato e uno world-readable nello stesso dominio di fiducia. Registrata qui
perché è la scorciatoia che si presenterà da sola a chi implementerà M2.

---

## Impatto

**Backend.** Nessuna modifica a `ExportProcessor` né a `StaticSiteDeployer`:
`LocalFolderDeployer` è già l'implementazione corretta della strada raccomandata. Se in
futuro si firma S3 (M2), si aggiunge un file adapter e cinque costanti `AppConstants`, mai
`process.env` diretto.

**Config di root (territorio Backend Developer, assegnazione del 2026-08-17).**
`docker-compose.prod.yml` guadagna un servizio `nginx-static`, due reti esplicite e un volume
condiviso con mount asimmetrico (`rw` worker / `ro` Nginx). `.env.example` guadagna, se
serve, la sola porta del servizio statico.

**Test.** T6 di `PLAN-F03` diventa scrivibile: si sblocca insieme a T5.

**Frontend / `app/public-site`.** Nessun impatto: resta dov'è, sul Piano di Gestione, con la
sola rotta di anteprima (ADR-25).

**Documentazione.** `docs/system-architecture.md` § Topologia descrive già la forma a due
piani: la scelta di M1 la rende concreta senza contraddirla. L'aggiornamento di quel file
resta però **atto umano** (`CLAUDE.md` § Documentation Policy): non è incluso qui.

**Contratti API.** Nessuno: nessun endpoint nuovo o modificato, nessun `openapi:export`.

---

## Rischi

| Rischio | Probabilità | Impatto | Mitigazione |
|---|---|---|---|
| Si firma M1 (volume) ma non M3 (reti separate): si ottiene l'alternativa che ADR-53 ha scartato, con l'air-gap di nuovo dichiarativo | **Media** — M3 è la parte noiosa | **Alto**: vanifica l'intero obiettivo | M1 e M3 vanno firmate insieme o non firmate: dichiarato sopra e ribadito in § Decisione umana |
| `STATIC_EXPORT_PATH` è la radice che Nginx deve montare, ma oggi `.env.example` (`./dist/static-export`) e `AppConstants` (default `dist/static-site`) **non concordano** | Alta finché non si allinea | Medio: un mount che punta alla cartella sbagliata produce un sito vuoto e un `404` uniforme indistinguibile da un tombstone | Allineare i due valori è precondizione di M3, non un dettaglio di implementazione |
| Il test di irraggiungibilità di T6 passa in CI ma la produzione gira su una topologia diversa (host singolo senza compose, provider PaaS) | Media | Alto: si verifica un'infrastruttura che non è quella servita | La checklist di go-live di M4 copre ciò che la CI non può vedere; il test CI asserisce il compose *versionato*, che è la topologia dichiarata |
| Nessuna distribuzione geografica: TTFB fuori dalla regione dell'host resta quello di un'origine singola | Alta (è la conseguenza scelta) | Basso oggi, crescente col pubblico | Accettato esplicitamente in **M5**; reversibile aggiungendo un adapter senza toccare `ExportProcessor` |
| Nginx serve il volume con header di cache sbagliati (HTML immutabile o asset senza `immutable`) | Media | Medio: contenuto stantio o banda sprecata | Fuori dal codice applicativo, dentro la conf Nginx: va nella stessa firma di M3, con la regola di ADR-53 § 2 (asset con fingerprint = `immutable`, HTML no) |
| Un secondo adapter viene aggiunto in futuro "per simmetria" senza requisito misurato | Bassa | Basso | M6 conferma il divieto di stub finché non esiste un requisito e una firma propria |

---

## Decisione umana

**Esito**: [x] Approvato · [ ] Rifiutato · [ ] Modificato

**Punti che richiedono una firma esplicita, singolarmente:**

- [x] **M1** — **Scelta dell'adapter di consegna**: il **volume Nginx isolato** è il primo e
  unico adapter attivo (`LocalFolderDeployer` invariato nel codice). CDN edge e bucket
  S3-compatibile restano non attivati, senza stub. *(Da firmare insieme a M3: separate non
  producono l'air-gap, vedi § Rischi riga 1.)*

- [x] **M2** — **Regola di custodia delle credenziali per ogni adapter futuro con
  credenziale**: bucket dedicato e coppia di chiavi dedicata (`STATIC_EXPORT_S3_*`), ambito
  minimo `PutObject`/`DeleteObject`, `ListBucket` negato — **mai** le credenziali
  `STORAGE_S3_*` dei documenti (ADR-8). Firma preventiva: vincola il giorno in cui il
  secondo adapter arriverà, senza attivarlo oggi.

- [x] **M3** — **Topologia di rete dell'air-gap in `docker-compose.prod.yml`** (⚠️ tocca la
  configurazione di produzione): due reti esplicite (`mgmt_net`/`edge_net`), servizio
  `nginx-static` **solo** su `edge_net`, volume statico montato `rw` per il worker e `ro`
  per Nginx, conf Nginx con le regole di cache di ADR-53 § 2. Include l'allineamento di
  `STATIC_EXPORT_PATH` fra `.env.example` e `AppConstants`.

- [x] **M4** — **Forma della verifica d'air-gap in T6**: test automatico sulla topologia
  versionata (connessione dal piano pubblico verso `postgres`/`redis`/`backend` che **deve**
  fallire; mount `ro` non scrivibile; `GET` che restituisce il file scritto dal job di
  export; tombstone → `404`), **più** una checklist di go-live per ciò che la CI non può
  asserire (firewall reale dell'ambiente di hosting).

- [x] **M5** — **Accettazione esplicita delle conseguenze di M1**: nessuna distribuzione
  geografica, TTFB a origine singola, capacità del pubblico limitata dalla macchina.
  In cambio: zero credenziali, zero costo marginale, zero terze parti, air-gap verificabile.

- [x] **M6** — **Conferma del divieto di stub**: `S3Deployer`/`CloudflarePagesDeployer` non
  si scrivono — nemmeno come classe vuota — finché un requisito misurato e una firma propria
  non li giustificano. Riafferma il vincolo già scritto in
  `static-site-deployer.interface.ts` e in `PLAN-F03` T5.

**Note**: M1–M6 firmate insieme, come la RFC richiede per M1 e M3. Firma data in chat il
2026-09-13, come conferma esplicita punto per punto dell'autorizzazione già concessa nella
sessione precedente (chiusa senza registrarla).

**Approvato da**: marketing@antelmagroup.net · **Data**: 2026-09-13

**Azione successiva**: [x] Genera **ADR-63** (primo numero libero: ADR-62 è occupata dal
contratto del tema v8) · [x] Sblocca `PLAN-F03` T5 e T6 · [ ] Archivio

> Nessun codice e nessun provider sono stati prodotti o attivati da questa RFC. L'ADR
> conseguente è `ADR-63-consegna-statica-volume-nginx-isolato.md`.
