import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

/**
 * DTO per l'abilitazione della MFA: solo il codice TOTP, il secret generato da
 * `POST /auth/mfa-setup` è già stato memorizzato temporaneamente lato server.
 */
export class MfaEnableDto {
  @ApiProperty({
    description:
      "Codice TOTP a 6 cifre generato dall'app authenticator con il secret ricevuto da mfa-setup",
    example: '123456',
  })
  @IsString({ message: 'Il codice deve essere una stringa.' })
  @Length(6, 6, { message: 'Il codice deve essere lungo esattamente 6 cifre.' })
  code!: string;
}
