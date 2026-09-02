import { createHmac } from 'node:crypto';
import { PublicSiteConfig } from './config';

/**
 * Anti-spam headless dei Form (ADR-46 § 3, RFC-46 D6), lato renderer pubblico.
 * Stesso identico algoritmo di `app/backend/src/forms/form-antispam.util.ts`
 * (HMAC-SHA256(formKey, secret), honeypot = digest troncato a 12 caratteri
 * hex, firma = digest completo): i due digest devono combaciare byte per
 * byte, perché è il backend a riverificarli a submit. Duplicato qui invece di
 * importato — `app/backend` non è un import ammesso da `app/public-site`
 * (ADR-22 § 5, nessuna dipendenza applicativa fra i due workspace) — e questo
 * file gira solo lato server (SSR/export, F10-04): il secret non è mai letto
 * né spedito al client, solo il valore già calcolato finisce nell'HTML.
 */

const FORM_HONEYPOT_NAME_LENGTH = 12;

function computeFormHmacDigest(formKey: string): string {
  return createHmac('sha256', PublicSiteConfig.formAntispamSecret).update(formKey).digest('hex');
}

export function computeFormHoneypotFieldName(formKey: string): string {
  return computeFormHmacDigest(formKey).slice(0, FORM_HONEYPOT_NAME_LENGTH);
}

export function computeFormSignature(formKey: string): string {
  return computeFormHmacDigest(formKey);
}
