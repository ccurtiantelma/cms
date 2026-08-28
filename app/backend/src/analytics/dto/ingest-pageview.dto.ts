import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/** Payload server-to-server del consumer SSR per una pageview HTML riuscita. */
export class IngestPageviewDto {
  @ApiProperty({
    description: 'Percorso canonico della pagina HTML pubblicata',
    example: '/chi-siamo',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2048)
  path!: string;
}
