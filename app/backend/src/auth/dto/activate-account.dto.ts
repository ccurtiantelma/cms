import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Length } from 'class-validator';

/** DTO per la sottomissione dell'attivazione dell'account. */
export class ActivateAccountDto {
  @ApiProperty({
    description: 'Il token di attivazione ricevuto via email (64 caratteri)',
    example: 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a1b2c3d4e5f6',
  })
  @IsString({ message: 'Il token deve essere una stringa.' })
  @IsNotEmpty({ message: 'Il token di attivazione è obbligatorio.' })
  @Length(64, 64, { message: 'Il token deve essere lungo esattamente 64 caratteri.' })
  token!: string;

  @ApiProperty({
    description: "La nuova password da impostare per l'account (minimo 12 caratteri)",
    example: 'SicuraPassword123!',
  })
  @IsString({ message: 'La password deve essere una stringa.' })
  @IsNotEmpty({ message: 'La password è obbligatoria.' })
  password!: string;
}
