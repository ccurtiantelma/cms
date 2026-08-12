import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Legge una variabile da `process.env` (priorità, utile in CI) o, in fallback,
 * da `app/backend/.env` (dev locale) — evita di duplicare credenziali demo
 * (es. `SUPERADMIN_PASSWORD`, generata random per progetto) in un secondo file
 * di config solo per l'E2E browser (ADR-16).
 */
export function readBackendEnv(key: string): string {
  if (process.env[key]) return process.env[key]!;

  const envPath = resolve(__dirname, '../../../app/backend/.env');
  const content = readFileSync(envPath, 'utf-8');
  const line = content
    .split('\n')
    .find((l) => l.trim().startsWith(`${key}=`) && !l.trim().startsWith('#'));

  if (!line) {
    throw new Error(
      `readBackendEnv: variabile "${key}" non trovata né in process.env né in app/backend/.env`,
    );
  }
  return line.split('=').slice(1).join('=').trim();
}
