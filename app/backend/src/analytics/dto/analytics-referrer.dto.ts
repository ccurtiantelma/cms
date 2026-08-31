import { ApiProperty } from '@nestjs/swagger';

/** Riga di classifica per un referrer (`'direct'` quando l'header `Referer` è assente/vuoto). */
export class AnalyticsReferrerDto {
  @ApiProperty({ example: 'https://www.google.com/' })
  referrer!: string;

  @ApiProperty({ example: 340 })
  count!: number;

  @ApiProperty({ example: 27.4, description: 'Percentuale sul totale degli eventi nel range' })
  percentage!: number;
}
