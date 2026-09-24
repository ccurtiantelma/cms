import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/**
 * Body di `POST app/admin/roles` (SPEC-RBAC-F2a). Valida solo la forma (S14):
 * formato fine del `code`, appartenenza al registro, codici riservati e
 * anti-escalation restano in `RolesService`, che risponde con i codici
 * d'errore del contratto F1 (`INVALID_ROLE_CODE`, `INVALID_PERMISSION_CODE`,
 * `RESERVED_PERMISSION`, `PERMISSION_ESCALATION`).
 */
export class CreateRoleDto {
  @ApiProperty({
    description:
      'Slug univoco e immutabile del ruolo (minuscole, cifre e underscore, da 3 a 50 caratteri, inizia con una lettera)',
    example: 'seo_specialist',
    maxLength: 50,
  })
  @IsString({ message: 'Il codice deve essere una stringa.' })
  @IsNotEmpty({ message: 'Il codice è obbligatorio.' })
  @MaxLength(50, { message: 'Il codice non può superare i 50 caratteri.' })
  code!: string;

  @ApiProperty({
    description: 'Nome leggibile del ruolo',
    example: 'SEO Specialist',
    maxLength: 100,
  })
  @IsString({ message: 'Il nome deve essere una stringa.' })
  @IsNotEmpty({ message: 'Il nome è obbligatorio.' })
  @MaxLength(100, { message: 'Il nome non può superare i 100 caratteri.' })
  name!: string;

  @ApiPropertyOptional({
    description: 'Descrizione del ruolo',
    nullable: true,
    maxLength: 500,
    example: 'Modifica e pubblica le Pagine per le campagne SEO.',
  })
  @IsOptional()
  @IsString({ message: 'La descrizione deve essere una stringa.' })
  @MaxLength(500, { message: 'La descrizione non può superare i 500 caratteri.' })
  description?: string | null;

  @ApiProperty({
    description:
      'Codici permesso del registro (`GET app/admin/permissions`). Non ammesso: roles:manage, riservato ai ruoli di sistema.',
    type: [String],
    example: ['pages:create', 'pages:edit_any'],
    maxItems: 100,
  })
  @IsArray({ message: 'permissionCodes deve essere un array.' })
  @ArrayUnique({ message: 'permissionCodes non può contenere duplicati.' })
  @ArrayMaxSize(100, { message: 'permissionCodes non può contenere più di 100 codici.' })
  @IsString({ each: true, message: 'Ogni codice permesso deve essere una stringa.' })
  permissionCodes!: string[];
}
