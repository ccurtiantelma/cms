import { createHmac } from 'crypto';
import { AppConstants } from '../common/app-constants';

/**
 * Anti-spam headless dei Form (ADR-46 § 3, RFC-46 D6): due difese derivate
 * dallo **stesso** `HMAC-SHA256(formKey, AppConstants.formAntispamSecret)` —
 * un solo segreto nuovo, non due. Nessuno dei due meccanismi presuppone
 * JavaScript lato client: entrambi i valori sono iniettati come campi
 * nascosti nell'HTML renderizzato/esportato (compito del renderer, F04/F10
 * Frontend, ADR-46 § N8), stabili finché `formKey`/il secret non cambiano.
 */

/** Numero di caratteri hex del digest usati per il nome del campo honeypot. */
export const FORM_HONEYPOT_NAME_LENGTH = 12;

/** Digest HMAC-SHA256 esadecimale di `formKey`, base comune di honeypot e firma. */
function computeFormHmacDigest(formKey: string): string {
  return createHmac('sha256', AppConstants.formAntispamSecret).update(formKey).digest('hex');
}

/**
 * Nome del campo honeypot per questo `formKey`: **non** una stringa fissa
 * (`"website"`/`"honeypot"`), ma un troncamento del digest HMAC — stabile per
 * lo stesso `formKey`, diverso da form a form (RFC-46 D6.1). Un bot che
 * compila alla cieca ogni campo lo valorizza; il server lo scarta in
 * silenzio (`FormsService.submitForm`).
 */
export function computeFormHoneypotFieldName(formKey: string): string {
  return computeFormHmacDigest(formKey).slice(0, FORM_HONEYPOT_NAME_LENGTH);
}

/**
 * Firma HMAC del form (RFC-46 D6.2): stesso digest completo, verificato a
 * submit ricalcolandolo server-side. Non è un token di sessione: nessuno
 * stato, nessuna scadenza — autentica solo "questa sottomissione punta a un
 * form che questo backend ha davvero esportato/renderizzato".
 */
export function computeFormSignature(formKey: string): string {
  return computeFormHmacDigest(formKey);
}
