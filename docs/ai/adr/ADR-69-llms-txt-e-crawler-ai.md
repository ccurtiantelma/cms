# ADR-69 — `llms.txt` e direttive per i crawler AI nell'export statico

## Status

[ ] In discussione · [x] **Approvata** · [ ] Rifiutata · [ ] Superseded da ADR-XXX

## Data approvazione

**2026-09-13** — approvata da: marketing@antelmagroup.net

## Riferimento

`docs/business-rules.md` § GEO, regole 1 e 2. Questa ADR fissa le tre scelte che le regole lasciano aperte.

---

## Decisione

1. **`llms.txt`** è rigenerato dall'export negli stessi eventi della sitemap, in formato llmstxt.org: intestazione con l'host pubblico come nome del sito, poi una voce per Pagina con titolo (`metaTitle`, altrimenti il titolo), URL assoluta e `aiSummary` se presente.
2. **Una Pagina `noindex` non compare in `llms.txt`**, anche se consente l'uso AI: chi la nasconde ai motori di ricerca non la vuole elencata altrove.
3. **`robots.txt`**: le Pagine con `aiPolicyAllowed: false` ricevono `Disallow` in un gruppo dedicato a un elenco dichiarato di crawler AI (GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, Claude-User, Claude-SearchBot, anthropic-ai, Google-Extended, PerplexityBot, Perplexity-User, CCBot, Applebot-Extended, Bytespider, meta-externalagent, Amazonbot). Nessun gruppo se nessuna Pagina nega il consenso.
4. **Nel documento** la Pagina porta `<meta name="robots">` con `noindex`/`nofollow` quando impostati e `noai, noimageai` quando nega l'uso AI; con i default il meta non è emesso.

## Alternative scartate

- **Bloccare i crawler AI sull'intero sito per default**: contraddice il default «consentito» delle business rules.
- **Nome del sito da un'impostazione globale**: l'impostazione non esiste; aggiungerla è una modifica di schema per un'intestazione.
- **Elencare anche le Pagine `noindex`**: espone contenuto che l'autore ha scelto di non far trovare.

## Conseguenze

- L'elenco dei crawler va aggiornato quando un operatore pubblica un nuovo user-agent; è una costante in `export.processor.ts`.
- `noai`/`noimageai` non sono uno standard W3C: li rispettano solo i crawler che li adottano. Il vincolo effettivo resta `robots.txt`.
