import { ApiProperty } from '@nestjs/swagger';

export class AnalyticsSeriesPointDto {
  @ApiProperty({ example: '2026-08-28' })
  date!: string;

  @ApiProperty({ example: 42 })
  visits!: number;

  @ApiProperty({ required: false, example: '/chi-siamo' })
  path?: string;
}

export class SiteAnalyticsDto {
  @ApiProperty({ example: 420 })
  totalVisits!: number;

  @ApiProperty({ type: [AnalyticsSeriesPointDto] })
  series!: AnalyticsSeriesPointDto[];
}

export class AppAnalyticsDto {
  @ApiProperty({ example: 12 })
  registeredUsers!: number;

  @ApiProperty({ example: 10 })
  activeUsers!: number;

  @ApiProperty({ example: 84 })
  successfulLogins!: number;

  @ApiProperty({ type: [AnalyticsSeriesPointDto] })
  loginSeries!: AnalyticsSeriesPointDto[];
}

export class AnalyticsResponseDto {
  @ApiProperty({ type: SiteAnalyticsDto })
  site!: SiteAnalyticsDto;

  @ApiProperty({ type: AppAnalyticsDto })
  app!: AppAnalyticsDto;
}
