import { ApiProperty } from '@nestjs/swagger';

/** Riga di classifica per una singola pagina, con percentuale sul totale delle view nel range. */
export class AnalyticsTopPageDto {
  @ApiProperty({ example: '/chi-siamo' })
  path!: string;

  @ApiProperty({ example: 640 })
  views!: number;

  @ApiProperty({ example: 210 })
  uniqueVisitors!: number;

  @ApiProperty({ example: 13.3, description: 'Percentuale sul totale delle view nel range' })
  percentage!: number;
}
