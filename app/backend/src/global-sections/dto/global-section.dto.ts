import { ApiProperty } from '@nestjs/swagger';
import { GlobalSectionLayoutSlot } from '../../common/enums';

/** Rappresentazione admin di una Sezione Globale (F06, ADR-40). */
export class GlobalSectionDto {
  @ApiProperty({ description: 'Guid della Sezione Globale', example: 'a1b2c3d4e5f6a7b8' })
  guid!: string;

  @ApiProperty({ description: 'Titolo della Sezione Globale' })
  title!: string;

  @ApiProperty({ description: 'Slug admin' })
  slug!: string;

  @ApiProperty({ description: 'Slot di layout pubblico', enum: GlobalSectionLayoutSlot })
  layoutSlot!: GlobalSectionLayoutSlot;

  @ApiProperty({ description: 'Se l\'header è sticky sul viewport', example: true })
  isSticky!: boolean;

  @ApiProperty({
    description: 'Albero di blocchi corrente',
    type: 'object',
    additionalProperties: true,
  })
  content!: Record<string, unknown>;

  @ApiProperty({ description: 'Version corrente (lock ottimistico)', example: 1 })
  version!: number;

  @ApiProperty({ description: 'Data creazione' })
  createdAt!: Date;

  @ApiProperty({ description: 'Data ultimo aggiornamento' })
  updatedAt!: Date;
}
