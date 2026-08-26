import { ApiProperty } from '@nestjs/swagger';

/**
 * Voce di elenco del gruppo di traduzione (`GET /app/pages/:guid/translations`,
 * RFC-F05 § 3, dipendenza aperta di T6). Deliberatamente leggero come
 * {@link PageRevisionSummaryDto} — mai `id`/`createdBy`/`updatedBy` numerici,
 * mai `draftContent`/`draftSeo`: l'endpoint non applica `assertRowOwnership`
 * sulle righe sorelle (stessa scelta di `createTranslation`, vedi JSDoc di
 * `PagesService.listTranslations`), quindi non può esporre contenuto di
 * pagine potenzialmente non possedute dal chiamante — solo i campi minimi
 * per popolare uno switcher lingua (guid/locale/title/status).
 */
export class PageTranslationDto {
  @ApiProperty({
    description: 'Identificatore pubblico della Pagina (URL admin)',
    example: 'b1a2c3d4e5f6a7b8',
  })
  guid!: string;

  @ApiProperty({ description: 'Locale della riga', example: 'en-GB' })
  locale!: string;

  @ApiProperty({ description: 'Titolo della riga', example: 'About us' })
  title!: string;

  @ApiProperty({
    description: 'Stato editoriale della riga (draft, review, scheduled, published)',
    example: 'draft',
  })
  status!: string;
}
