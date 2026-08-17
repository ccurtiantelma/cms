import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsISO8601, IsOptional } from 'class-validator';
import { PAGE_STATUSES, PageStatus } from '../pages.state-machine';

/**
 * Payload di `POST /app/pages/:guid/status` (SPEC-F01 § Endpoint). La
 * transizione ammessa dipende dallo stato corrente della riga: validata nel
 * service contro la macchina a stati (`pages.state-machine.ts`), mai qui.
 */
export class ChangeStatusDto {
  @ApiProperty({
    description: 'Stato di destinazione',
    enum: PAGE_STATUSES,
    example: 'published',
  })
  @IsIn(PAGE_STATUSES, { message: `status deve essere uno tra: ${PAGE_STATUSES.join(', ')}.` })
  status!: PageStatus;

  @ApiPropertyOptional({
    description: 'Data/ora futura di pubblicazione programmata, obbligatoria se status=scheduled',
    example: '2026-09-01T09:00:00.000Z',
  })
  @IsOptional()
  @IsISO8601({}, { message: 'scheduledAt deve essere una data ISO8601 valida.' })
  scheduledAt?: string;
}
