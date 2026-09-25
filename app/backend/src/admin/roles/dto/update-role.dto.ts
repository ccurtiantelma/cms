import { ApiPropertyOptional } from '@nestjs/swagger';
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
 * Body di `PATCH app/admin/roles/:guid` (SPEC-RBAC-F2a). Stessi vincoli di
 * forma di `CreateRoleDto`, tutti opzionali. `code` è immutabile (S23): non
 * essendo dichiarato, `forbidNonWhitelisted` lo rifiuta con `400`. Un body
 * senza campi viene rifiutato dal controller.
 */
export class UpdateRoleDto {
  @ApiPropertyOptional({ description: 'Nome leggibile del ruolo', maxLength: 100 })
  @IsOptional()
  @IsString({ message: 'Il nome deve essere una stringa.' })
  @IsNotEmpty({ message: 'Il nome non può essere vuoto.' })
  @MaxLength(100, { message: 'Il nome non può superare i 100 caratteri.' })
  name?: string;

  @ApiPropertyOptional({
    description: 'Descrizione del ruolo',
    type: String,
    nullable: true,
    maxLength: 500,
  })
  @IsOptional()
  @IsString({ message: 'La descrizione deve essere una stringa.' })
  @MaxLength(500, { message: 'La descrizione non può superare i 500 caratteri.' })
  description?: string | null;

  @ApiPropertyOptional({
    description:
      "Nuovo insieme completo dei codici permesso (sostituisce l'attuale). Non ammesso: roles:manage.",
    type: [String],
    example: ['pages:create', 'pages:edit_any', 'pages:publish'],
    maxItems: 100,
  })
  @IsOptional()
  @IsArray({ message: 'permissionCodes deve essere un array.' })
  @ArrayUnique({ message: 'permissionCodes non può contenere duplicati.' })
  @ArrayMaxSize(100, { message: 'permissionCodes non può contenere più di 100 codici.' })
  @IsString({ each: true, message: 'Ogni codice permesso deve essere una stringa.' })
  permissionCodes?: string[];
}
