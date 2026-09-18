/**
 * Risolutore di token dati dinamici (`{{namespace.chiave}}`) su stringhe di
 * contenuto — es. `{{page.title}}`, `{{page.slug}}`, `{{page.publishedAt}}`,
 * `{{user.name}}`. Utility pura e generica: non assume uno schema fisso di
 * namespace, risolve solo contro il `DynamicDataContext` fornito dal
 * chiamante, con fallback difensivo (mai un'eccezione) su token mancanti,
 * malformati o namespace/chiave assenti dal contesto.
 *
 * Scope volutamente ridotto — verificato su `docs/ai/INDEX.md` il
 * 2026-09-18: nessuna ADR/SPEC dedicata esiste per "Dynamic Data Binding"
 * sui blocchi. L'unica ADR affine, `ADR-79-modello-collezioni-content-types.md`
 * ("fondamento di Dynamic Tags e Loop Builder"), è ancora "In discussione"
 * (non firmata). Restano perciò fuori da questo modulo, in attesa di una
 * decisione formale: l'integrazione con le Collezioni/Dynamic Tags,
 * l'engine di visibilità condizionale (`displayConditions`/
 * `shouldRenderBlock`, nessuna ADR nel dominio blocchi — `ADR-88` copre un
 * dominio diverso, le condizioni di assegnazione dei site template) e
 * l'aggancio alla compilazione SSR/export (bloccato anche da `ADR-21 § 2`,
 * "decisione aperta sul consumer HTML"). `{{site.name}}` è un esempio di
 * namespace privo oggi di una sorgente dati reale (`app_settings` non ha
 * una chiave "site name", verificato su `settings.service.ts`): risolve
 * solo se il chiamante lo passa esplicitamente in `context.site`.
 */

export interface DynamicDataContext {
  page?: {
    title?: string | null;
    slug?: string | null;
    publishedAt?: string | Date | null;
  };
  site?: {
    name?: string | null;
  };
  user?: {
    name?: string | null;
  };
  [namespace: string]: unknown;
}

export interface DynamicDataToken {
  /** Il token così come appare nel testo, es. `{{page.title}}`. */
  raw: string;
  namespace: string;
  key: string;
}

const TOKEN_SOURCE = /\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)\.([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}/;

/** Nuova istanza ad ogni chiamata: evita stato condiviso su `lastIndex` (regex globale). */
function tokenPattern(): RegExp {
  return new RegExp(TOKEN_SOURCE.source, 'g');
}

/** Estrae tutti i token `{{namespace.chiave}}` presenti in una stringa, senza risolverli. */
export function extractDynamicTokens(input: string): DynamicDataToken[] {
  if (typeof input !== 'string' || input.length === 0) return [];
  const tokens: DynamicDataToken[] = [];
  for (const match of input.matchAll(tokenPattern())) {
    tokens.push({ raw: match[0], namespace: match[1], key: match[2] });
  }
  return tokens;
}

/** Indica se la stringa contiene almeno un token dinamico ben formato. */
export function hasDynamicTokens(input: string): boolean {
  if (typeof input !== 'string' || input.length === 0) return false;
  return tokenPattern().test(input);
}

/** Valori scalari soltanto: oggetti/array non sono formattabili in una stringa, fallback difensivo. */
function formatTokenValue(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return undefined;
}

/**
 * Sostituisce ogni token `{{namespace.chiave}}` col valore corrispondente in
 * `context`, o con `fallback` (default: stringa vuota) quando il namespace,
 * la chiave o il token stesso non sono risolvibili. Non lancia mai
 * eccezioni: input non stringa viene restituito così com'è.
 */
export function resolveDynamicTokens(
  input: string,
  context: DynamicDataContext,
  fallback = '',
): string {
  if (typeof input !== 'string' || input.length === 0) return input;
  return input.replace(tokenPattern(), (_match, namespace: string, key: string) => {
    const ns = context?.[namespace];
    if (ns === null || typeof ns !== 'object') return fallback;
    const formatted = formatTokenValue((ns as Record<string, unknown>)[key]);
    return formatted === undefined ? fallback : formatted;
  });
}
