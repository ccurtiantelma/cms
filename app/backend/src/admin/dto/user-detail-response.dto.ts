import { ApiProperty } from '@nestjs/swagger';
import { AppUserRoles } from '../../common/enums';
import { UserRoleSummaryDto } from '../roles/dto/role-response.dto';

/**
 * Risposta di `GET app/admin/users/:guid` (solo Swagger). Campi pubblici della
 * riga `users`, senza le colonne sensibili (`SENSITIVE_USER_COLUMNS`), più
 * `roles`: i soli ruoli personalizzati di `user_roles` (SPEC-RBAC-F2a S19).
 */
export class UserDetailResponseDto {
  @ApiProperty({ description: "Guid dell'utente", example: 'a1b2c3d4e5f6a7b8' })
  guid!: string;

  @ApiProperty({ description: 'Nome', example: 'Mario' })
  name!: string;

  @ApiProperty({ description: 'Cognome', type: String, nullable: true, example: 'Rossi' })
  surname!: string | null;

  @ApiProperty({ description: 'Email', example: 'mario.rossi@example.com' })
  email!: string;

  @ApiProperty({
    description: 'Livello di ruolo base',
    enum: AppUserRoles,
    example: AppUserRoles.User,
  })
  role!: AppUserRoles;

  @ApiProperty({ description: 'Scope multi-tenant/multi-sede', type: String, nullable: true })
  scopeId!: string | null;

  @ApiProperty({ description: 'Utente attivo' })
  isActive!: boolean;

  @ApiProperty({ description: 'Password già impostata (attivazione completata)' })
  pwdSet!: boolean;

  @ApiProperty({ description: 'MFA abilitata' })
  isMfaEnabled!: boolean;

  @ApiProperty({ description: 'Data creazione', type: String, format: 'date-time', nullable: true })
  createdAt!: Date | null;

  @ApiProperty({
    description: 'Data ultimo aggiornamento',
    type: String,
    format: 'date-time',
    nullable: true,
  })
  updatedAt!: Date | null;

  @ApiProperty({
    description: 'Ruoli personalizzati aggiuntivi; mai i ruoli di sistema (S19)',
    type: [UserRoleSummaryDto],
  })
  roles!: UserRoleSummaryDto[];
}
