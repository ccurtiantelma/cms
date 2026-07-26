import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ description: "Indirizzo email dell'utente", example: 'admin@example.com' })
  @IsEmail({}, { message: "L'email deve essere un indirizzo email valido." })
  email!: string;

  @ApiProperty({ description: "Password dell'utente", example: 'Password123!' })
  @IsString({ message: 'La password deve essere una stringa.' })
  @MinLength(8, { message: 'La password deve contenere almeno 8 caratteri.' })
  password!: string;
}
