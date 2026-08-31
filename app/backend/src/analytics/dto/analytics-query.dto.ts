import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

/** Intervallo inclusivo e opzioni di query condivise da tutti gli endpoint di lettura analytics. */
export class AnalyticsQueryDto {
  @ApiPropertyOptional({ description: 'Data iniziale inclusa (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: 'Data finale inclusa (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({
    description: 'Granularità dei bucket per la timeseries. Default: "day" (gestito dal service).',
    enum: ['day', 'hour'],
  })
  @IsOptional()
  @IsIn(['day', 'hour'])
  interval?: 'day' | 'hour';

  @ApiPropertyOptional({
    description:
      'Numero massimo di righe per top-pages/referrers. Default: 10 (gestito dal service).',
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
