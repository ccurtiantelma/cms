import { ApiProperty } from '@nestjs/swagger';

/** Singolo punto della serie temporale, bucketizzato per giorno o ora. */
export class AnalyticsTimeseriesPointDto {
  @ApiProperty({ example: '2026-08-28T00:00:00.000Z', description: 'Inizio del bucket (ISO 8601)' })
  bucket!: string;

  @ApiProperty({ example: 320 })
  views!: number;

  @ApiProperty({ example: 95 })
  uniqueVisitors!: number;
}

/** Serie temporale ordinata in ordine crescente, granularità richiesta in query. */
export class AnalyticsTimeseriesDto {
  @ApiProperty({ enum: ['day', 'hour'], example: 'day' })
  interval!: 'day' | 'hour';

  @ApiProperty({ type: [AnalyticsTimeseriesPointDto] })
  points!: AnalyticsTimeseriesPointDto[];
}
