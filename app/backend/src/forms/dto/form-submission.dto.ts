import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Rappresentazione amministrativa di un Invio (`form_submissions`). Mai `id`
 * numerico (CLAUDE.md: solo `guid`/`slug` nelle URL); `ipHash` esposto (mai
 * l'IP grezzo, che non è comunque persistito) solo come riferimento tecnico
 * per il supporto anti-abuso, non identifica una persona da solo.
 */
export class FormSubmissionDto {
  @ApiProperty({
    description: "Identificatore pubblico dell'Invio",
    example: 'a1b2c3d4e5f6a7b8',
  })
  guid!: string;

  @ApiProperty({ description: 'Chiave editoriale del modulo (form.formKey)', example: 'contatti' })
  formKey!: string;

  @ApiProperty({
    description: 'Guid della Pagina che conteneva il blocco form al momento della sottomissione',
    example: 'f6a7b8a1b2c3d4e5',
  })
  pageGuid!: string;

  @ApiProperty({
    description: 'Valori sottomessi, chiave = form-field.name',
    type: 'object',
    additionalProperties: true,
  })
  payload!: Record<string, unknown>;

  @ApiProperty({ description: 'Hash SHA-256 del visitatore (mai IP grezzo)', example: 'a1b2...c3d4' })
  ipHash!: string;

  @ApiPropertyOptional({ description: 'User-Agent del client al momento della sottomissione', nullable: true })
  userAgent!: string | null;

  @ApiProperty({ description: 'Data di sottomissione' })
  createdAt!: Date;

  @ApiProperty({ description: "Falso se l'Invio è stato soft-eliminato da un editore", example: true })
  isActive!: boolean;
}
