import { ApiProperty } from '@nestjs/swagger';

/** KPI aggregati dell'intervallo richiesto, con trend percentuale vs il periodo precedente di pari durata. */
export class AnalyticsOverviewDto {
  @ApiProperty({ example: 4820, description: 'Numero totale di pageview nel range' })
  totalViews!: number;

  @ApiProperty({ example: 1230, description: 'Visitatori unici (hash distinti) nel range' })
  uniqueVisitors!: number;

  @ApiProperty({
    example: 42,
    description: 'Numero di percorsi distinti con almeno una pageview nel range',
  })
  pagesWithTraffic!: number;

  @ApiProperty({
    example: 12.5,
    description:
      'Variazione percentuale di totalViews vs il periodo immediatamente precedente di pari durata (null se il periodo precedente non ha traffico)',
    nullable: true,
  })
  trendPercentage!: number | null;
}
