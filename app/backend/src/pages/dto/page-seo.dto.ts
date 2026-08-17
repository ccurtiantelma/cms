import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

/** Coppia domanda/risposta della FAQ GEO (business-rules.md § GEO, campo `faq`). */
export class PageFaqEntryDto {
  @ApiPropertyOptional({ description: 'Domanda' })
  @IsString({ message: 'La domanda deve essere una stringa.' })
  question!: string;

  @ApiPropertyOptional({ description: 'Risposta' })
  @IsString({ message: 'La risposta deve essere una stringa.' })
  answer!: string;
}

/**
 * Metadati SEO/GEO della Pagina (business-rules.md § SEO, § GEO). Fa parte
 * del contratto della Pagina, non un plugin a parte (CLAUDE.md, Modello di
 * contenuto, regola 7). Tutti i campi sono opzionali e puramente consultivi
 * in F01: nessuna validazione di lunghezza è bloccante.
 */
export class PageSeoDto {
  @ApiPropertyOptional({
    description: 'Titolo per i motori di ricerca (fallback al titolo Pagina)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  metaTitle?: string;

  @ApiPropertyOptional({ description: 'Descrizione per i motori di ricerca' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  metaDescription?: string;

  @ApiPropertyOptional({
    description: 'URL canonica (se vuota, calcolata dal percorso della Pagina)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  canonicalUrl?: string;

  @ApiPropertyOptional({ description: 'Direttiva indicizzazione', enum: ['index', 'noindex'] })
  @IsOptional()
  @IsIn(['index', 'noindex'])
  robotsIndex?: string;

  @ApiPropertyOptional({ description: 'Direttiva crawling dei link', enum: ['follow', 'nofollow'] })
  @IsOptional()
  @IsIn(['follow', 'nofollow'])
  robotsFollow?: string;

  @ApiPropertyOptional({ description: 'Titolo Open Graph (fallback a metaTitle)' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  ogTitle?: string;

  @ApiPropertyOptional({ description: 'Descrizione Open Graph (fallback a metaDescription)' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  ogDescription?: string;

  @ApiPropertyOptional({ description: 'Immagine Open Graph (fallback a immagine di copertina)' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  ogImage?: string;

  @ApiPropertyOptional({
    description: 'JSON-LD esteso a mano, oltre a quello generato dal sistema',
  })
  @IsOptional()
  @IsObject()
  structuredData?: Record<string, unknown>;

  @ApiPropertyOptional({
    description: 'Riassunto sintetico e autosufficiente per i motori generativi',
  })
  @IsOptional()
  @IsString()
  aiSummary?: string;

  @ApiPropertyOptional({
    description: 'Affermazioni brevi e verificabili estratte dalla Pagina',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  keyFacts?: string[];

  @ApiPropertyOptional({ description: 'Coppie domanda/risposta', type: [PageFaqEntryDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PageFaqEntryDto)
  faq?: PageFaqEntryDto[];

  @ApiPropertyOptional({ description: 'Entità/argomenti trattati dalla Pagina', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  entities?: string[];

  @ApiPropertyOptional({
    description: "Consenso all'uso del contenuto da parte dei crawler AI (default: consentito)",
  })
  @IsOptional()
  @IsBoolean()
  aiPolicyAllowed?: boolean;
}
