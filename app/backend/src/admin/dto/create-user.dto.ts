import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { AppUserRoles } from '../../common/enums';

/**
 * DTO per la creazione di un utente da parte di un Admin+.
 * La password non è mai fornita dall'Admin: viene sempre inviata un'email di
 * attivazione (pwdSet=false), l'utente la imposta al primo accesso.
 */
export class CreateUserDto {
  @ApiProperty({ description: "Nome dell'utente", example: 'Mario' })
  @IsString({ message: 'Il nome deve essere una stringa.' })
  @MaxLength(100, { message: 'Il nome non può superare i 100 caratteri.' })
  name!: string;

  @ApiPropertyOptional({ description: "Cognome dell'utente", example: 'Rossi' })
  @IsOptional()
  @IsString({ message: 'Il cognome deve essere una stringa.' })
  @MaxLength(100, { message: 'Il cognome non può superare i 100 caratteri.' })
  surname?: string;

  @ApiProperty({ description: "Email dell'utente", example: 'mario.rossi@example.com' })
  @IsEmail({}, { message: "L'email deve essere un indirizzo email valido." })
  email!: string;

  @ApiProperty({ description: 'Ruolo assegnato', enum: AppUserRoles, example: AppUserRoles.User })
  @IsEnum(AppUserRoles, { message: 'Ruolo non valido.' })
  role!: AppUserRoles;

  @ApiPropertyOptional({
    description:
      'Identificatore di scope multi-tenant/multi-sede, a disposizione dei moduli del CMS',
  })
  @IsOptional()
  @IsString({ message: 'scopeId deve essere una stringa.' })
  @MaxLength(100, { message: 'scopeId non può superare i 100 caratteri.' })
  scopeId?: string;
}
