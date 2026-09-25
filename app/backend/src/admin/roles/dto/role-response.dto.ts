import { ApiProperty } from '@nestjs/swagger';
import {
  PERMISSION_CATEGORIES,
  PermissionCategory,
} from '../../../permissions/permissions.registry';

/** Ruolo con i suoi codici permesso (specchio di `RoleView`, SPEC-RBAC-F2a § DTO). */
export class RoleResponseDto {
  @ApiProperty({ description: 'Guid del ruolo', example: 'a1b2c3d4e5f6a7b8' })
  guid!: string;

  @ApiProperty({ description: 'Codice univoco e immutabile', example: 'seo_specialist' })
  code!: string;

  @ApiProperty({ description: 'Nome leggibile', example: 'SEO Specialist' })
  name!: string;

  @ApiProperty({ description: 'Descrizione', type: String, nullable: true })
  description!: string | null;

  @ApiProperty({ description: 'Ruolo di sistema (sola lettura, ADR-99 P3)' })
  isSystem!: boolean;

  @ApiProperty({
    description: 'Livello `AppUserRoles` del ruolo di sistema; null per i ruoli personalizzati',
    type: Number,
    nullable: true,
    example: null,
  })
  level!: number | null;

  @ApiProperty({
    description: 'Codici permesso del ruolo',
    type: [String],
    example: ['pages:create', 'pages:edit_any'],
  })
  permissions!: string[];

  @ApiProperty({ description: 'Data creazione', type: String, format: 'date-time', nullable: true })
  createdAt!: Date | null;

  @ApiProperty({
    description: 'Data ultimo aggiornamento',
    type: String,
    format: 'date-time',
    nullable: true,
  })
  updatedAt!: Date | null;
}

/** Voce del catalogo permessi. */
export class PermissionItemResponseDto {
  @ApiProperty({ description: 'Codice `risorsa:azione`', example: 'pages:publish' })
  code!: string;

  @ApiProperty({
    description: 'Descrizione leggibile',
    type: String,
    nullable: true,
    example: 'Pubblicare, programmare e archiviare una Pagina',
  })
  description!: string | null;
}

/** Gruppo del catalogo permessi, nell'ordine di `PERMISSION_CATEGORIES`. */
export class PermissionGroupResponseDto {
  @ApiProperty({ description: 'Categoria', enum: PERMISSION_CATEGORIES, example: 'pages' })
  category!: PermissionCategory;

  @ApiProperty({ description: 'Permessi della categoria', type: [PermissionItemResponseDto] })
  permissions!: PermissionItemResponseDto[];
}

/** Ruolo personalizzato assegnato a un utente (dettaglio utente, SPEC S19). */
export class UserRoleSummaryDto {
  @ApiProperty({ description: 'Guid del ruolo', example: 'a1b2c3d4e5f6a7b8' })
  guid!: string;

  @ApiProperty({ description: 'Codice del ruolo', example: 'seo_specialist' })
  code!: string;

  @ApiProperty({ description: 'Nome leggibile', example: 'SEO Specialist' })
  name!: string;
}

/** Risposta di creazione/modifica di un ruolo. */
export class RoleGuidResponseDto {
  @ApiProperty({ description: 'Guid del ruolo', example: 'a1b2c3d4e5f6a7b8' })
  guid!: string;
}
