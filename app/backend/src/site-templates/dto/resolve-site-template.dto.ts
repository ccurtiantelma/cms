import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsString, MaxLength } from 'class-validator';
import { SiteTemplateType } from '../../common/enums';
import { SiteTemplateResponseDto } from './site-template.dto';

/** Richiesta di risoluzione di un Template di tema per una rotta pubblica (consumer SSR, ADR-22). */
export class ResolveSiteTemplateDto {
  @ApiProperty({ description: 'Path pubblico da risolvere', example: '/blog/il-mio-articolo' })
  @IsString({ message: 'path deve essere una stringa.' })
  @MaxLength(2048, { message: 'path non può superare i 2048 caratteri.' })
  path!: string;

  @ApiProperty({ description: 'Tipo di Template richiesto', enum: SiteTemplateType })
  @IsEnum(SiteTemplateType, { message: 'type non valido.' })
  type!: SiteTemplateType;

  @ApiProperty({ description: 'Lingua richiesta', example: 'IT' })
  @IsString({ message: 'lang deve essere una stringa.' })
  @MaxLength(10, { message: 'lang non può superare i 10 caratteri.' })
  lang!: string;
}

/** Template risolto per la rotta richiesta, sola lettura pubblica (`isPublished` sempre `true`). */
export class ResolvedSiteTemplateDto extends SiteTemplateResponseDto {}
