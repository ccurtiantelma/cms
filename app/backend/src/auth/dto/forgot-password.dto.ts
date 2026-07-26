import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty } from 'class-validator';

/** DTO per la richiesta di recupero password (password dimenticata). */
export class ForgotPasswordDto {
  @ApiProperty({
    description: "L'indirizzo email associato all'account da recuperare",
    example: 'utente@example.com',
  })
  @IsEmail({}, { message: "L'email deve essere un indirizzo email valido." })
  @IsNotEmpty({ message: "L'email è obbligatoria." })
  email!: string;
}
