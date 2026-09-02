# ADR-45: Architettura Incrementale SSG (Static Site Generation) e Disaccoppiamento Runtime

* **Stato**: Approvato
* **Data**: 2026-09-01
* **Autore**: Senior Solution Architect & Orchestrator Tecnico EAIDOS
* **Approver**: Project Owner (Human Sign-Off) · **Data approvazione**: 2026-09-01
* **RFC di Riferimento**: RFC-44
* **ADR Reinterpretate/Superate**: ADR-22 (Consumer HTML Pubblico), ADR-23 (Caching e Invalidazione Pubblica)

---

## CONTESTO & PROBLEMA
ADR-22 e ADR-23 stabilivano un'architettura di rendering SSR dinamico servito da Node.js con un layer di caching in-memory/Redis per la superficie pubblica.
Tuttavia, esporre il runtime Node.js e la connessione al Database PostgreSQL verso la rete pubblica espone il sistema a vettori d'attacco Denial of Service (DoS) e non garantisce la resilienza di un'infrastruttura totalmente disaccoppiata ad altissime prestazioni (TTFB < 15ms).

---

## DECISIONE
1. **Disaccoppiamento Statico (SSG Incrementale)**:
   La superficie pubblica viene trasformata in un'infrastruttura static-only. Le pagine pubblicate vengono compilate in file HTML statici memorizzati su filesystem (`dist/static-site/`).

2. **Reinterpretazione di ADR-22**:
   - `app/public-site` cessa di essere un server SSR esposto direttamente al traffico pubblico di produzione.
   - Viene relegato ad ambiente di **Draft Preview** per i redattori (porta 55000) e a **Worker di Rendering Interno** ad uso esclusivo di NestJS (`StaticExportModule`).

3. **Reinterpretazione di ADR-23**:
   - La gestione del caching HTML su Redis viene superata. Il traffico anonimo pubblico viene servito direttamente tramite file HTML/CSS statici disconnessi gestiti da Nginx o CDN.
   - Redis rimane utilizzato esclusivamente come backend per la coda asincrona BullMQ (`static-export`).

4. **Invarianti di Sicurezza e Rendering**:
   - Il backend NestJS non importa librerie React o di rendering DOM (`react-dom/server`).
   - L'esportazione avviene recuperando l'HTML tramite chiamate HTTP interne authenticated/loopback verso `app/public-site`.

5. **Sincronizzazione Media e Rebuild Globale**:
   - Durante il job di esportazione, i file media collegati ai blocchi vengono copiati nella cartella static-export (`dist/static-site/assets/media/<guid>.<ext>`).
   - Le modifiche al tema globale o alle impostazioni di sistema scatenano il fan-out di rebuild dell'intero sito (`enqueueFullSiteExport`).

---

## CONSEGUENZE
- **Sicurezza**: Zero esposizione del Database o del runtime Node.js sul sito pubblico.
- **Prestazioni**: TTFB servito da file statici disconnessi (< 15ms).
- **Invarianza Schema**: Nessuna modifica allo schema PostgreSQL (`schema.ts`).
