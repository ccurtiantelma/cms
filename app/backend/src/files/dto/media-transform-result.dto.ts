import { ApiProperty } from '@nestjs/swagger';

/**
 * Esito dell'accodamento di una trasformazione media (ADR-49): la
 * generazione della variante è asincrona, questa risposta conferma solo che
 * il job è stato accodato con successo.
 */
export class MediaTransformResultDto {
  @ApiProperty({
    description: 'Id del job BullMQ accodato per la generazione della variante',
    example: '42',
  })
  jobId!: string;
}
