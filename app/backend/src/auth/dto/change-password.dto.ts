import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

/**
 * DTO per il cambio password dalla pagina profilo (utente già autenticato).
 * A differenza di `ResetPasswordDto`, richiede la password attuale invece di un token.
 */
export class ChangePasswordDto {
  @ApiProperty({
    description: "La password attuale dell'utente, usata per confermare l'identità",
    example: 'VecchiaPassword2025!',
  })
  @IsString({ message: 'La password attuale deve essere una stringa.' })
  @IsNotEmpty({ message: 'La password attuale è obbligatoria.' })
  currentPassword!: string;

  @ApiProperty({
    description: 'La nuova password conforme alla policy di sicurezza (minimo 12 caratteri)',
    example: 'NuovaSuperPassword2026!',
  })
  @IsString({ message: 'La password deve essere una stringa.' })
  @IsNotEmpty({ message: 'La password è obbligatoria.' })
  newPassword!: string;
}
