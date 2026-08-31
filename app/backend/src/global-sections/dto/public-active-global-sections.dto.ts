import { ApiPropertyOptional } from '@nestjs/swagger';

/** Vista pubblica minima di una Sezione Globale attiva (ADR-40): solo ciò che serve al render SSR. */
export class PublicGlobalSectionDto {
  @ApiPropertyOptional({ description: 'Slug admin della Sezione (informativo, non una rotta pubblica)' })
  slug!: string;

  @ApiPropertyOptional({ description: 'Se l\'header è sticky sul viewport', example: true })
  isSticky!: boolean;

  @ApiPropertyOptional({
    description: 'Albero di blocchi, già migrato/validato/sanitizzato in scrittura',
    type: 'object',
    additionalProperties: true,
  })
  content!: Record<string, unknown>;
}

/**
 * Risposta di `GET public/global-sections/active` (ADR-40): sempre `200`, mai
 * `404` — uno slot assente è semplicemente `null` (nessuna Sezione è mai
 * stata assegnata).
 */
export class PublicActiveGlobalSectionsDto {
  @ApiPropertyOptional({ type: PublicGlobalSectionDto, nullable: true })
  header!: PublicGlobalSectionDto | null;

  @ApiPropertyOptional({ type: PublicGlobalSectionDto, nullable: true })
  footer!: PublicGlobalSectionDto | null;
}
