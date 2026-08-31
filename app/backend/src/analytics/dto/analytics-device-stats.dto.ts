import { ApiProperty } from '@nestjs/swagger';

/** Distribuzione percentuale su una singola dimensione (device o browser). */
export class AnalyticsDistributionRowDto {
  @ApiProperty({ example: 'desktop' })
  label!: string;

  @ApiProperty({ example: 3100 })
  count!: number;

  @ApiProperty({ example: 64.3 })
  percentage!: number;
}

/** Distribuzione percentuale per device e, separatamente, per browser, nel range richiesto. */
export class AnalyticsDeviceStatsDto {
  @ApiProperty({ type: [AnalyticsDistributionRowDto] })
  devices!: AnalyticsDistributionRowDto[];

  @ApiProperty({ type: [AnalyticsDistributionRowDto] })
  browsers!: AnalyticsDistributionRowDto[];
}
