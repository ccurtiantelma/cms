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
const PUBLIC_MEDIA_BASE_URL: string =
  (import.meta.env.VITE_PUBLIC_MEDIA_BASE_URL as string | undefined) || 'http://localhost:3000';

/** Compone l'URL pubblico e leggibile dal browser del media identificato da `mediaRef`. */
export function resolveMediaSrc(mediaRef: string): string {
  return `${PUBLIC_MEDIA_BASE_URL}/api/v1/public/media/${mediaRef}`;
}
