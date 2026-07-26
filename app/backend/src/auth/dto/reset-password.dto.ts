import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Length } from 'class-validator';

/** DTO per la reimpostazione della password dopo aver ricevuto l'email di recupero. */
export class ResetPasswordDto {
  @ApiProperty({
    description: 'Il token di reimpostazione ricevuto via email (64 caratteri)',
    example: 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a1b2c3d4e5f6',
  })
  @IsString({ message: 'Il token deve essere una stringa.' })
  @IsNotEmpty({ message: 'Il token di reimpostazione è obbligatorio.' })
  @Length(64, 64, { message: 'Il token deve essere lungo esattamente 64 caratteri.' })
  token!: string;

  @ApiProperty({
    description: 'La nuova password conforme alla policy di sicurezza (minimo 12 caratteri)',
    example: 'NuovaSuperPassword2026!',
  })
  @IsString({ message: 'La password deve essere una stringa.' })
  @IsNotEmpty({ message: 'La password è obbligatoria.' })
  password!: string;
}
