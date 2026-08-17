/** Prefissi tecnici riservati, non assegnabili come slug (business-rules.md § Slug, regola 7). */
const RESERVED_SLUGS = new Set(['api', 'admin', 'public', 'assets', '_health']);

/** Range Unicode dei segni diacritici combinanti (accenti), rimossi dopo normalizzazione NFD. */
const COMBINING_DIACRITICS_REGEX = /[̀-ͯ]/g;

/**
 * Normalizza un titolo o uno slug proposto: minuscolo, senza accenti,
 * separatore `-` (business-rules.md § Slug, regola 3). Può restituire una
 * stringa vuota se l'input non contiene alcun carattere alfanumerico — va
 * respinta dal chiamante.
 */
export function normalizeSlug(input: string): string {
  return input
    .normalize('NFD')
    .replace(COMBINING_DIACRITICS_REGEX, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Vero se lo slug collide con un prefisso tecnico riservato dell'applicazione. */
export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.has(slug);
}
