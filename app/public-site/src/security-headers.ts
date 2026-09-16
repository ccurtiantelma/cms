import { randomBytes } from 'node:crypto';
import { PUBLIC_MEDIA_BASE_URL } from '@blocks/media-url';
import { PublicSiteConfig } from './config';

/**
 * Un nonce nuovo per ogni richiesta HTTP (non per ogni `<style>`): i due
 * documenti che ne servono più di uno — `App.tsx`/`PreviewDocument.tsx`
 * (CSS critico) più `ThemeStyleTag.tsx` (tema) — condividono lo stesso
 * valore nella stessa risposta, perché `style-src` in {@link securityHeaders}
 * ammette un solo `'nonce-...'` per volta. Un hash statico non potrebbe
 * coprire questi `<style>`: il contenuto cambia per pagina (CSS critico) o
 * per configurazione del tema, non è mai lo stesso testo due volte.
 */
export function createNonce(): string {
  return randomBytes(16).toString('base64');
}

function originOf(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/**
 * Header di sicurezza imposti su **ogni** risposta di questo processo, senza
 * eccezioni configurabili — successo, `404`, `405`, `308`, `500` — stesso
 * principio già in vigore per `PREVIEW_ROBOTS_HEADER` in `server.ts`, qui
 * esteso a tutte le rotte invece che alla sola `/__preview/`. Centralizzato
 * qui e non ripetuto in ogni `res.writeHead` di `server.ts`.
 *
 * - `X-Content-Type-Options: nosniff` — nessun asset di questo processo deve
 *   mai essere reinterpretato per MIME-sniffing (CSS/JS serviti con
 *   `Content-Type` esplicito, HTML sempre `text/html`).
 * - `Referrer-Policy: strict-origin-when-cross-origin` — default dei browser
 *   moderni, non invasivo: piena origine+path sui link interni, solo
 *   l'origine verso terzi.
 * - `X-Frame-Options: DENY` — nessuna Pagina di questo CMS è pensata per
 *   essere incorniciata da terzi; ridondante con `frame-ancestors 'none'`
 *   della CSP qui sotto ma necessario per i browser che non applicano CSP.
 * - `Content-Security-Policy`:
 *   - `script-src 'self'`: l'unico script eseguito è l'isola di submit dei
 *     Form (F10-04), servita same-origin (`server.ts` → `formSubmitScript`).
 *     Lo `<script type="application/ld+json">` di `App.tsx` non è soggetto a
 *     `script-src`: l'algoritmo HTML "prepare a script" — su cui la CSP si
 *     aggancia per bloccare — considera eseguibili solo i tipi JavaScript,
 *     mai `application/ld+json` (CSP Level 3 §4.2.3.1). Nessun nonce
 *     necessario lì; nessun nonce su questo `script-src` di conseguenza.
 *   - `style-src 'self' 'nonce-<value>'`: i tre `<style>` inline
 *     (`dangerouslySetInnerHTML` di CSS critico in `App.tsx`/
 *     `PreviewDocument.tsx` e tema in `ThemeStyleTag.tsx`, uniche eccezioni
 *     note — vedi `escaping.spec.ts`) portano lo stesso nonce di questa
 *     risposta. Mai `'unsafe-inline'` su questa direttiva, che vanificherebbe
 *     il nonce per qualunque `<style>` iniettato in futuro.
 *   - `style-src-attr 'unsafe-inline'`: direttiva separata (CSP Level 3),
 *     governa solo l'attributo `style="..."` sugli elementi — a differenza di
 *     `<style>`, non esiste un meccanismo di nonce/hash per gli attributi
 *     inline, quindi senza questa direttiva ogni `style` scritto per
 *     proprietà da `Section.tsx`/`Container.tsx`/ecc. (colore di sfondo,
 *     gradiente, overlay — mai stringhe concatenate, vedi quei file) viene
 *     scartato in silenzio dal browser sul sito pubblico, pur passando la
 *     validazione server-side e pur essendo visibile nell'editor (che non ha
 *     questa CSP). Direttiva indipendente da `style-src` sopra: l'assenza di
 *     un nonce qui non "riattiva" `'unsafe-inline'` su `style-src` (la regola
 *     CSP che lo ignorerebbe in presenza di un nonce si applica per singola
 *     direttiva, non fra direttive), quindi i tre `<style>` inline restano
 *     protetti dal nonce esattamente come prima.
 *   - `img-src 'self' <origine media> data:`: ogni `<img>` dei blocchi punta
 *     a `VITE_PUBLIC_MEDIA_BASE_URL` (baked a build time, `media-url.ts`),
 *     mai same-origin — `data:` per eventuali placeholder inline dei blocchi.
 *   - `connect-src 'self' <origine API browser>`: il solo `fetch` lato
 *     browser di questo sito è il submit dei Form (`form-submit.js`) verso
 *     `PUBLIC_API_BROWSER_BASE_URL` — mai `apiBaseUrl`, che in produzione è
 *     un host di rete interna irraggiungibile dal browser.
 *   - `default-src 'none'` + `base-uri 'none'` + `object-src 'none'`:
 *     nessuna richiesta implicita per direttive non elencate esplicitamente.
 *   - `form-action 'self'`: i soli form emessi da questo sito (submit
 *     via `fetch`, non via `<form action>` nativo, ma la direttiva resta la
 *     difesa in profondità corretta se un blocco futuro tornasse a un
 *     `<form>` nativo).
 *   - `frame-ancestors 'none'`: difesa dal clickjacking lato CSP (vedi
 *     `X-Frame-Options` sopra per i browser legacy).
 */
export function securityHeaders(nonce: string): Record<string, string> {
  const mediaOrigin = originOf(PUBLIC_MEDIA_BASE_URL);
  const browserApiOrigin = originOf(PublicSiteConfig.publicApiBrowserBaseUrl);

  const imgSrc = ["'self'", mediaOrigin, 'data:'].filter((value): value is string => Boolean(value));
  const connectSrc = ["'self'", browserApiOrigin].filter((value): value is string => Boolean(value));

  const csp = [
    "default-src 'none'",
    "base-uri 'none'",
    "object-src 'none'",
    "script-src 'self'",
    `style-src 'self' 'nonce-${nonce}'`,
    "style-src-attr 'unsafe-inline'",
    `img-src ${imgSrc.join(' ')}`,
    "font-src 'self'",
    `connect-src ${connectSrc.join(' ')}`,
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');

  return {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Frame-Options': 'DENY',
    'Content-Security-Policy': csp,
  };
}
