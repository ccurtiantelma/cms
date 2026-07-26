/**
 * Policy e validazione della robustezza delle password (NIST/OWASP).
 * Fonte di verità: docs/business-rules.md
 */

export interface PasswordStrengthResult {
  /** Indica se la password rispetta tutti i requisiti di sicurezza */
  valid: boolean;
  /** Punteggio di robustezza da 0 a 4 basato sui criteri soddisfatti */
  score: number;
  /** Elenco delle motivazioni in caso di mancata validità o suggerimenti */
  reasons: string[];
}

/**
 * Valida la forza di una password secondo la policy dello starter-kit (NIST/OWASP):
 * - Minimo 12 caratteri
 * - Almeno 3 delle 4 categorie: lettere maiuscole, lettere minuscole, numeri, simboli
 *
 * @param password La stringa della password da validare.
 * @returns PasswordStrengthResult con esito, score e ragioni dettagliate.
 */
export function validatePasswordStrength(password: string): PasswordStrengthResult {
  const reasons: string[] = [];

  if (!password) {
    return {
      valid: false,
      score: 0,
      reasons: ['La password non può essere vuota.'],
    };
  }

  // 1. Verifica della lunghezza minima (min 12 caratteri)
  const isLengthValid = password.length >= 12;
  if (!isLengthValid) {
    reasons.push('La password deve contenere almeno 12 caratteri.');
  }

  // 2. Verifica delle 4 categorie di caratteri
  const hasUppercase = /[A-Z]/.test(password);
  const hasLowercase = /[a-z]/.test(password);
  const hasDigit = /[0-9]/.test(password);
  const hasSymbol = /[^A-Za-z0-9]/.test(password);

  let categoriesCount = 0;
  if (hasUppercase) categoriesCount++;
  if (hasLowercase) categoriesCount++;
  if (hasDigit) categoriesCount++;
  if (hasSymbol) categoriesCount++;

  const isCategoriesValid = categoriesCount >= 3;
  if (!isCategoriesValid) {
    reasons.push(
      'La password deve includere caratteri appartenenti ad almeno 3 delle seguenti categorie: lettere maiuscole (A-Z), lettere minuscole (a-z), numeri (0-9) e simboli.',
    );
  }

  // Calcolo dell'esito finale e del punteggio
  const valid = isLengthValid && isCategoriesValid;

  // Lo score rispecchia le categorie se la lunghezza è valida, altrimenti è 0
  const score = valid ? categoriesCount : 0;

  return {
    valid,
    score,
    reasons,
  };
}
