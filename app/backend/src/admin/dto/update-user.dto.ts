import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';
import { AppUserRoles } from '../../common/enums';

/**
 * DTO per l'aggiornamento dei dati di un utente da parte di un Admin+.
 * Non include `password` (gestita dai flussi self-service di /auth) né `isActive`
 * (gestito dall'endpoint dedicato `toggle-active`).
 */
export class UpdateUserDto {
  @ApiPropertyOptional({ description: "Nome dell'utente" })
  @IsOptional()
  @IsString({ message: 'Il nome deve essere una stringa.' })
  @MaxLength(100, { message: 'Il nome non può superare i 100 caratteri.' })
  name?: string;

  @ApiPropertyOptional({ description: "Cognome dell'utente" })
  @IsOptional()
  @IsString({ message: 'Il cognome deve essere una stringa.' })
  @MaxLength(100, { message: 'Il cognome non può superare i 100 caratteri.' })
  surname?: string;

  @ApiPropertyOptional({ description: "Email dell'utente" })
  @IsOptional()
  @IsEmail({}, { message: "L'email deve essere un indirizzo email valido." })
  email?: string;

  @ApiPropertyOptional({ description: 'Ruolo assegnato', enum: AppUserRoles })
  @IsOptional()
  @IsEnum(AppUserRoles, { message: 'Ruolo non valido.' })
  role?: AppUserRoles;

  @ApiPropertyOptional({ description: 'Identificatore di scope multi-tenant/multi-sede' })
  @IsOptional()
  @IsString({ message: 'scopeId deve essere una stringa.' })
  @MaxLength(100, { message: 'scopeId non può superare i 100 caratteri.' })
  scopeId?: string;

  @ApiPropertyOptional({
    description:
      "Guid dei ruoli personalizzati aggiuntivi: sostituisce l'insieme attuale. Richiede users:assign_roles; si possono aggiungere solo ruoli con permessi posseduti dal chiamante. Assente: ruoli invariati; [] li rimuove tutti.",
    type: [String],
    example: ['a1b2c3d4e5f6a7b8'],
    maxItems: 50,
  })
  @IsOptional()
  @IsArray({ message: 'roleGuids deve essere un array.' })
  @ArrayUnique({ message: 'roleGuids non può contenere duplicati.' })
  @ArrayMaxSize(50, { message: 'roleGuids non può contenere più di 50 ruoli.' })
  @IsString({ each: true, message: 'Ogni guid di ruolo deve essere una stringa.' })
  @Length(16, 16, { each: true, message: 'Ogni guid di ruolo deve avere 16 caratteri.' })
  roleGuids?: string[];
}
