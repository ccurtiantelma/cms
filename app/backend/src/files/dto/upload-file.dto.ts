import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Campi opzionali del form multipart (oltre al file stesso) per associare
 * il documento a un'entità di dominio del progetto verticale (ADR-8).
 */
export class UploadFileDto {
  @ApiPropertyOptional({
    description: 'Nome tabella/dominio a cui associare il file',
    example: 'invoice',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  entity?: string;

  @ApiPropertyOptional({
    description: "Id/guid dell'entità di dominio da associare",
    example: 'a1b2c3d4e5f6a7b8',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  entityId?: string;
}
