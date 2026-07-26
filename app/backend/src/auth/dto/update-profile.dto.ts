import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/** DTO per l'aggiornamento di nome e cognome dalla pagina profilo (self-service, qualsiasi ruolo autenticato). */
export class UpdateProfileDto {
  @ApiProperty({ description: "Nome dell'utente", example: 'Mario' })
  @IsString({ message: 'Il nome deve essere una stringa.' })
  @IsNotEmpty({ message: 'Il nome è obbligatorio.' })
  @MaxLength(100, { message: 'Il nome non può superare i 100 caratteri.' })
  name!: string;

  @ApiPropertyOptional({ description: "Cognome dell'utente", example: 'Rossi' })
  @IsOptional()
  @IsString({ message: 'Il cognome deve essere una stringa.' })
  @MaxLength(100, { message: 'Il cognome non può superare i 100 caratteri.' })
  surname?: string;
}
