import { ApiProperty } from '@nestjs/swagger';
import { IsObject, IsString } from 'class-validator';

/**
 * Body di `POST public/forms/:formId/submit` (ADR-46 § 4, RFC-46 D4/D6).
 *
 * **Il campo honeypot non è dichiarato qui.** Il suo nome è derivato per
 * `formKey` (`computeFormHoneypotFieldName`, `form-antispam.util.ts`) e
 * quindi non esprimibile come proprietà statica di una classe. Dichiararlo
 * come `@Body() dto: SubmitFormDto` tipizzato farebbe scattare
 * `ValidationPipe({ forbidNonWhitelisted: true })` (globale, `main.ts`) su
 * qualunque submit di un bot che lo valorizza — un `400` che rivelerebbe
 * esattamente il meccanismo anti-spam, il contrario di quanto richiesto
 * (RFC-46 D6.1, "scartato silenziosamente"). Per questo
 * `PublicFormsController.submit` riceve il body come `Record<string,
 * unknown>` grezzo (che `ValidationPipe` non valida: il metatipo non è una
 * classe) e costruisce/valida questa DTO manualmente in
 * `FormsService.submitForm`, dopo aver letto ed eventualmente scartato il
 * campo honeypot dal body grezzo.
 */
export class SubmitFormDto {
  @ApiProperty({
    description:
      'Firma HMAC-SHA256(formKey, FORM_ANTISPAM_SECRET) calcolata dal renderer al momento del render/export e restituita invariata dal client (ADR-46 § 3, RFC-46 D6.2). Non è un token di sessione: nessuno stato, nessuna scadenza.',
    example: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2',
  })
  @IsString()
  signature!: string;

  @ApiProperty({
    description:
      'Valori dei campi realmente sottomessi, chiave = form-field.name. La whitelist dei nomi ammessi è fatta dal service contro i form-field realmente pubblicati (RFC-46 D4.3), mai da questa DTO.',
    type: 'object',
    additionalProperties: true,
  })
  @IsObject()
  values!: Record<string, unknown>;
}
