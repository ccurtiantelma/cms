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
  port: port('PORT', 54000),
  /** Origine dell'API backend (`api/v1/public/pages`), senza path finale. */
  apiBaseUrl: str('PUBLIC_API_BASE_URL', 'http://localhost:53000'),
};
