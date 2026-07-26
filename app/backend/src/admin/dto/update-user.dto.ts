import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
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
}
