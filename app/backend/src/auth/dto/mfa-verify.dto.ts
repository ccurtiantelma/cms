import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Length } from 'class-validator';

/** DTO per la verifica del codice TOTP dopo un login con MFA abilitata. */
export class MfaVerifyDto {
  @ApiProperty({
    description: 'Token temporaneo restituito da /auth/login quando è richiesta la MFA',
    example: 'a1b2c3...',
  })
  @IsString({ message: 'Il token temporaneo deve essere una stringa.' })
  @IsNotEmpty({ message: 'Il token temporaneo è obbligatorio.' })
  tmpToken!: string;

  @ApiProperty({
    description: "Codice TOTP a 6 cifre generato dall'app authenticator",
    example: '123456',
  })
  @IsString({ message: 'Il codice deve essere una stringa.' })
  @Length(6, 6, { message: 'Il codice deve essere lungo esattamente 6 cifre.' })
  code!: string;
}
