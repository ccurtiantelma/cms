import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

/** DTO per la disabilitazione della MFA: richiede un codice TOTP valido come conferma. */
export class MfaDisableDto {
  @ApiProperty({
    description: "Codice TOTP a 6 cifre generato dall'app authenticator",
    example: '123456',
  })
  @IsString({ message: 'Il codice deve essere una stringa.' })
  @Length(6, 6, { message: 'Il codice deve essere lungo esattamente 6 cifre.' })
  code!: string;
}
