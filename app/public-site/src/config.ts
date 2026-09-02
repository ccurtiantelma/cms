/**
 * Unico punto di lettura di `process.env` in questo workspace (stesso
 * principio di `AppConstants` nel backend, CLAUDE.md "Divieti assoluti").
 * Nessun `.env` proprio: le variabili arrivano dall'ambiente del processo
 * (Docker/CI, F03/T7), qui solo default difensivi per lo sviluppo locale.
 */
function str(name: string, fallback: string): string {
  const raw = process.env[name];
  return raw && raw.trim() !== '' ? raw.trim() : fallback;
}

function port(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isInteger(n) && n > 0 && n < 65536 ? n : fallback;
}

export const PublicSiteConfig = {
  /** Porta del server HTTP di questo workspace. Combacia col default di `AppConstants.publicSiteUrl` nel backend. */
  port: port('PORT', 55000),
  /** Origine dell'API backend (`api/v1/public/pages`), senza path finale. */
  apiBaseUrl: str('PUBLIC_API_BASE_URL', 'http://localhost:53000'),
  /** Secret server-to-server per l'ingest delle pageview del consumer SSR. */
  analyticsIngestSecret: str('ANALYTICS_INGEST_SECRET', ''),
  /**
   * Origine backend **rivolta al browser** per il submit dei Form (F10-04,
   * RFC-46 D4/D5): `apiBaseUrl` è rivolta al server (in produzione un host di
   * rete interna, stesso motivo di `AppConstants.publicMediaBaseUrl` per i
   * media, ADR-27 § 6) — il `fetch` dell'isola JS lato browser non può
   * usarla. Stesso default locale di `apiBaseUrl` (in sviluppo browser e
   * server raggiungono lo stesso host).
   */
  publicApiBrowserBaseUrl: str('PUBLIC_API_BROWSER_BASE_URL', 'http://localhost:53000'),
  /**
   * Segreto **dedicato** dell'anti-spam headless dei Form (ADR-46 § 3, RFC-46
   * D6): stesso valore di `AppConstants.formAntispamSecret` nel backend —
   * duplicato per env, non condiviso via import (ADR-22 § 5) — necessario
   * perché honeypot/firma sono calcolati qui al momento del render/export
   * (`form-antispam.ts`), mai da un secondo round-trip verso il backend.
   */
  formAntispamSecret: str('FORM_ANTISPAM_SECRET', 'change_me_form_antispam'),
};
