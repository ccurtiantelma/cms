import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AppUserRoles } from '../../common/enums';

/**
 * Risposta di `GET auth/me` (solo Swagger, controparte di
 * `MeWithPermissionsResponse`). `permissions` sono i permessi effettivi
 * dell'utente (in impersonificazione, dell'utente impersonato): la UI li usa
 * solo per l'esperienza utente, l'autorità resta il backend (ADR-99 § 10).
 */
export class MeResponseDto {
  @ApiProperty({ description: "Id numerico dell'utente autenticato", example: 12 })
  userId!: number;

  @ApiProperty({
    description: 'Livello di ruolo base',
    enum: AppUserRoles,
    example: AppUserRoles.User,
  })
  role!: AppUserRoles;

  @ApiProperty({ description: 'Nome', example: 'Mario' })
  name!: string;

  @ApiProperty({ description: 'Scope multi-tenant/multi-sede', type: String, nullable: true })
  scopeId!: string | null;

  @ApiPropertyOptional({
    description: 'Presente solo in impersonificazione: id del SuperAdmin reale',
    example: 1,
  })
  impersonatedBy?: number;

  @ApiProperty({ description: "Guid dell'utente", example: 'a1b2c3d4e5f6a7b8' })
  guid!: string;

  @ApiProperty({ description: 'Cognome', type: String, nullable: true, example: 'Rossi' })
  surname!: string | null;

  @ApiProperty({ description: 'Email', example: 'mario.rossi@example.com' })
  email!: string;

  @ApiProperty({ description: 'MFA abilitata' })
  isMfaEnabled!: boolean;

  @ApiProperty({
    description:
      'Permessi effettivi (ruolo di sistema ∪ ruoli personalizzati), in ordine alfabetico',
    type: [String],
    example: ['pages:create', 'pages:edit_own', 'pages:submit_review'],
  })
  permissions!: string[];
}
