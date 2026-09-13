# ADR-63 — Consegna statica su volume Nginx isolato

## Status

[ ] In discussione · [x] **Approvata** · [ ] Rifiutata · [ ] Superseded da ADR-XXX

## Data approvazione

**2026-09-13** — approvata da: marketing@antelmagroup.net

## RFC di riferimento

`docs/ai/rfc/RFC-62-consegna-statica-e-air-gap.md` (M1–M6). Chiude l'opzione che ADR-53 § 4 lasciava aperta, senza modificarla.

---

## Decisione

1. **Adapter unico: volume Nginx isolato.** `LocalFolderDeployer` resta l'unica implementazione di `StaticSiteDeployer`, invariata nel codice. CDN edge e bucket S3-compatibile non si attivano.
2. **L'isolamento è la condizione di ammissibilità, non un dettaglio.** `docker-compose.prod.yml` dichiara due reti esplicite: `mgmt_net` (backend, worker di export, postgres, redis, `public-site` di anteprima) ed `edge_net`, dove sta **solo** `nginx-static`. Il volume statico è montato `rw` dal backend e `ro` da `nginx-static`. La conf Nginx applica ADR-53 § 2: asset con fingerprint `immutable`, HTML no. `STATIC_EXPORT_PATH` ha lo stesso valore in `.env.example` e in `AppConstants`.
3. **L'air-gap si verifica sulla topologia versionata** (PLAN-F03 T6): da `nginx-static` le connessioni verso `postgres`, `redis` e `backend` falliscono; il mount `ro` non è scrivibile; un `GET` restituisce il file scritto dal job di export; il tombstone rende quel path `404`. Ciò che la CI non vede (firewall reale dell'hosting) va in una checklist di go-live.
4. **Credenziali di ogni adapter futuro**: bucket e coppia di chiavi dedicati (`STATIC_EXPORT_S3_*`), ambito `PutObject`/`DeleteObject`, `ListBucket` negato. Mai le credenziali `STORAGE_S3_*` dei documenti (ADR-8).
5. **Nessuno stub**: `S3Deployer`/`CloudflarePagesDeployer` non si scrivono, nemmeno vuoti, senza un requisito misurato e una firma propria.

## Alternative scartate

- **CDN edge**: token ad ampio raggio, costo metrato, terzo responsabile del trattamento, air-gap non verificabile in CI.
- **Bucket S3 gestito**: stesso limite di verifica del CDN, per una distribuzione geografica che nessun NFR chiede.
- **Due adapter selezionabili via env**: il secondo sarebbe lo stub che il punto 5 vieta.
- **`LocalFolderDeployer` senza reti separate**: è l'alternativa che ADR-53 ha già respinto («l'air-gap resta dichiarativo»).
- **Riusare il bucket documenti di ADR-8**: fonde un bucket privato e uno pubblico nello stesso dominio di fiducia.

## Conseguenze

- Nessuna distribuzione geografica: TTFB da origine singola, capacità limitata dalla macchina. Accettato esplicitamente (M5); reversibile aggiungendo un adapter senza toccare `ExportProcessor`.
- Zero credenziali nuove, zero dipendenze npm, zero terze parti.
- `PLAN-F03` T5 e T6 sono sbloccati. T5 tocca solo config di root (territorio Backend Developer): compose, conf Nginx, `.env.example`.
- `docs/system-architecture.md` § Topologia va reso concreto su questa scelta: atto umano, fuori da questa ADR.
