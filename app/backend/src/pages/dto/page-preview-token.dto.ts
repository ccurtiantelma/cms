import { ApiProperty } from '@nestjs/swagger';

/**
 * Risposta dell'emissione di un token di anteprima (F04-bis/T2, ADR-25 § 1).
 * Nessun campo di richiesta: l'unico input è il `:guid` nel path e
 * l'identità del chiamante (JWT + ownership), non un body.
 */
export class PagePreviewTokenDto {
  @ApiProperty({
    description:
      'JWT di anteprima, firmato con un segreto dedicato (mai quello di access/refresh). ' +
      'Claim: pageGuid, purpose="page-preview", exp a 15 minuti dall\'emissione. ' +
      'Va passato a "GET api/v1/preview/pages/:token" (rotta separata, mai app/ o public/).',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  token!: string;

  @ApiProperty({
    description: "Scadenza del token (15 minuti dall'emissione, non rinnovabile: nessun refresh).",
    example: '2026-08-19T10:15:00.000Z',
  })
  expiresAt!: Date;
}
