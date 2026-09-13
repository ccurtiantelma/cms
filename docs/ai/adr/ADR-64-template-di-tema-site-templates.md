# ADR-64 — Template di tema (`site_templates`) e condizioni di visualizzazione

## Status

[ ] In discussione · [x] **Approvata** · [ ] Rifiutata · [ ] Superseded da ADR-XXX

## Data approvazione

**2026-09-13** — approvata da: marketing@antelmagroup.net

## RFC di riferimento

`docs/ai/rfc/RFC-40-theme-builder-template-registry.md` (esito Modificato, N1–N4). Ratifica codice in produzione dal 2026-08-31.

---

## Decisione

1. **Il Template di tema è un'entità a sé**: tabella `site_templates`, entità mutabile con struttura completa (`version`, `isActive`, audit). Non gestisce header/footer, che restano Sezioni globali (ADR-40). `contentTree` passa per la stessa pipeline di ADR-21 delle Pagine.
2. **Tipi**: `single_page`, `search_results`, `loop_item`, `error_404` sono risolvibili. `single_post` e `archive` sono ammessi in scrittura ma **senza semantica**: il resolver restituisce `null` senza interrogare il database, finché non esiste una decisione sui tipi di contenuto (regola 1 del modello di contenuto).
3. **Risoluzione per rotta, non per Pagina**: `TemplateResolverService.resolveForRoute(path, type, lang)` sceglie tra i Template attivi e pubblicati con quel `type` e `language`, in ordine di `priority` decrescente; vince il primo le cui `displayConditions` verificano il `path`.
4. **Condizioni di visualizzazione**: array di regole `include`/`exclude` × `entire_site` | `specific_page` (uguaglianza esatta col `path`) | `path_pattern` (`*` unico wildcard, il resto escapato). Nessuna regola → vale ovunque; un `exclude` che verifica esclude sempre; con almeno un `include` serve che uno verifichi.
5. **Superfici**: admin `api/v1/app/site-templates` con soglia **Manager (20)**; pubblica `POST api/v1/public/site-templates/resolve`, anonima, con throttle proprio e `404` quando nessun Template si applica.

## Alternative scartate

- **Header/footer dentro `site_templates`**: doppio binario con le Sezioni globali di ADR-40.
- **Rimuovere `single_post`/`archive` dall'enum**: migrazione su righe già scritte, per un valore oggi inerte; si decide insieme ai tipi di contenuto.
- **Risoluzione per `pages.guid`**: accoppierebbe il modulo a `PagesModule`, cosa che ADR-24 non prevede.
- **Soglia Admin (10)**: la riga «Gestire Menu, Template, Sezioni globali» di `business-rules.md` è Manager+, e il codice la applica già.

## Conseguenze

- **Il resolver non ha consumer**: né `app/public-site` né `ExportProcessor` lo chiamano, quindi oggi un Template di tema non cambia il sito pubblicato. Collegarlo all'export statico (ADR-53) richiede una decisione propria: con Build-on-Publish, un cambio di Template diventa una rigenerazione O(catalogo).
- **`language` non è validato contro le lingue del sito**: la UI propone la lingua di default configurata, ma la colonna ha default `IT` nello schema e il DTO accetta qualunque stringa di 2–10 caratteri, mentre le Pagine usano `locale` (ADR-36). Va vincolato prima di collegare il resolver, altrimenti un Template può non verificare mai una Pagina reale.
- Chiude D6 del progress tracker. Un'estensione di `site_templates` (RFC-43 N3) si costruisce su questa ADR, senza un secondo resolver.
- La sigla di roadmap del Theme Builder resta da assegnare: atto umano.
