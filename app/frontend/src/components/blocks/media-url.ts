/**
 * Compone il `src` pubblico di un'immagine da `mediaRef` (guid) — unica
 * risoluzione, condivisa fra `app/frontend` e `app/public-site` tramite
 * l'alias `@blocks` (ADR-22): comporla in due punti diversi significherebbe
 * due implementazioni che possono divergere (ADR-27 § 6).
 *
 * La base è `VITE_PUBLIC_MEDIA_BASE_URL`, "baked" a build-time da Vite in
 * entrambi i workspace (stesso meccanismo di `VITE_API_BASE_URL` in
 * `services/api.ts`) — mai `PUBLIC_API_BASE_URL`, che in produzione può
 * puntare a un host di rete interna irraggiungibile da un `<img>` nel
 * browser.
 */
/**
 * Esportata (oltre che usata qui) perché `security-headers.ts` in
 * `app/public-site` la legge per popolare `img-src` nella CSP: stessa origine
 * usata da ogni `<img>` dei blocchi, letta da un solo punto invece di
 * duplicare `import.meta.env.VITE_PUBLIC_MEDIA_BASE_URL` una seconda volta.
 */
export const PUBLIC_MEDIA_BASE_URL: string =
  (import.meta.env.VITE_PUBLIC_MEDIA_BASE_URL as string | undefined) || 'http://localhost:53000';

/** Compone l'URL pubblico e leggibile dal browser del media identificato da `mediaRef`. */
export function resolveMediaSrc(mediaRef: string): string {
  return `${PUBLIC_MEDIA_BASE_URL}/api/v1/public/media/${mediaRef}`;
}

/**
 * `mediaRef` segnaposto di un'immagine appena inserita: passa la validazione di forma (16 hex,
 * il backend non verifica l'esistenza a scrittura) ma non punta a nessun file. `Image` lo rende
 * come riquadro "foto" senza richieste di rete; mai una vera richiesta al server media.
 */
export const PLACEHOLDER_MEDIA_REF = '0000000000000000';
