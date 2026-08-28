import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional } from 'class-validator';

/** Intervallo inclusivo per la lettura degli aggregati analytics. */
export class AnalyticsQueryDto {
  @ApiPropertyOptional({ description: 'Data iniziale inclusa (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: 'Data finale inclusa (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString()
  to?: string;
}
