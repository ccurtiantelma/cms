import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Request } from 'express';
import { AuthInfo } from '../../common/types';
import { Permissions } from '../../permissions/permissions.decorator';
import { CreateRoleDto } from './dto/create-role.dto';
import {
  PermissionGroupResponseDto,
  RoleGuidResponseDto,
  RoleResponseDto,
} from './dto/role-response.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { RolesService } from './roles.service';
import { PermissionGroup, RoleView } from './roles.types';

const GUID_PARAM = { name: 'guid', description: 'Guid (16 caratteri) del ruolo' } as const;

/**
 * Ruoli personalizzati e catalogo permessi (ADR-99 § 7, SPEC-RBAC-F2a). Unico
 * cancello: `@Permissions` per rotta, senza `GuardAdmin` (S16). I guard girano
 * prima delle pipe: chi non ha il permesso riceve `403` anche con un body non
 * valido. I controlli di dominio restano in `RolesService` (S15).
 */
@ApiTags('Roles')
@ApiBearerAuth('access-token')
@Controller('app/admin')
export class RolesController {
  /** Inietta il service di dominio dei ruoli. */
  constructor(private readonly rolesService: RolesService) {}

  /** Tutti i ruoli, prima quelli di sistema, con i rispettivi permessi. */
  @Get('roles')
  @Permissions('roles:read')
  @ApiOperation({ summary: 'Lista dei ruoli con i rispettivi permessi' })
  @ApiResponse({
    status: 200,
    description: 'Ruoli di sistema, poi personalizzati',
    type: [RoleResponseDto],
  })
  @ApiResponse({ status: 401, description: 'Non autenticato' })
  @ApiResponse({ status: 403, description: 'Permesso roles:read mancante' })
  async list(): Promise<RoleView[]> {
    return this.rolesService.list();
  }

  /** Crea un ruolo personalizzato (`is_system = false`). */
  @Post('roles')
  @Permissions('roles:manage')
  @ApiOperation({ summary: 'Crea un ruolo personalizzato (SuperAdmin)' })
  @ApiBody({ type: CreateRoleDto })
  @ApiResponse({ status: 201, description: 'Ruolo creato', type: RoleGuidResponseDto })
  @ApiResponse({
    status: 400,
    description:
      'Body non valido · INVALID_ROLE_CODE · INVALID_PERMISSION_CODE · RESERVED_PERMISSION (roles:manage)',
  })
  @ApiResponse({ status: 401, description: 'Non autenticato' })
  @ApiResponse({
    status: 403,
    description: 'Permesso roles:manage mancante · PERMISSION_ESCALATION',
  })
  @ApiResponse({ status: 409, description: 'ROLE_CODE_DUPLICATE' })
  async create(@Body() dto: CreateRoleDto, @Req() req: Request): Promise<{ guid: string }> {
    const authInfo = req['authInfo'] as AuthInfo;
    return this.rolesService.create(dto, authInfo, req.ip);
  }

  /** Modifica nome, descrizione e/o permessi di un ruolo personalizzato. */
  @Patch('roles/:guid')
  @Permissions('roles:manage')
  @ApiOperation({ summary: 'Modifica un ruolo personalizzato (SuperAdmin)' })
  @ApiParam(GUID_PARAM)
  @ApiBody({ type: UpdateRoleDto })
  @ApiResponse({ status: 200, description: 'Ruolo aggiornato', type: RoleGuidResponseDto })
  @ApiResponse({
    status: 400,
    description:
      'Body non valido o vuoto (code non ammesso) · INVALID_PERMISSION_CODE · RESERVED_PERMISSION',
  })
  @ApiResponse({ status: 401, description: 'Non autenticato' })
  @ApiResponse({
    status: 403,
    description: 'Permesso roles:manage mancante · SYSTEM_ROLE_READONLY · PERMISSION_ESCALATION',
  })
  @ApiResponse({ status: 404, description: 'Ruolo non trovato' })
  async update(
    @Param('guid') guid: string,
    @Body() dto: UpdateRoleDto,
    @Req() req: Request,
  ): Promise<{ guid: string }> {
    if (
      dto.name === undefined &&
      dto.description === undefined &&
      dto.permissionCodes === undefined
    ) {
      throw new BadRequestException('Nessun campo da aggiornare.');
    }
    const authInfo = req['authInfo'] as AuthInfo;
    return this.rolesService.update(guid, dto, authInfo, req.ip);
  }

  /** Elimina un ruolo personalizzato non assegnato a nessun utente. */
  @Delete('roles/:guid')
  @Permissions('roles:manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Elimina un ruolo personalizzato non assegnato (SuperAdmin)' })
  @ApiParam(GUID_PARAM)
  @ApiResponse({ status: 204, description: 'Ruolo eliminato' })
  @ApiResponse({ status: 401, description: 'Non autenticato' })
  @ApiResponse({
    status: 403,
    description: 'Permesso roles:manage mancante · SYSTEM_ROLE_READONLY · PERMISSION_ESCALATION',
  })
  @ApiResponse({ status: 404, description: 'Ruolo non trovato' })
  @ApiResponse({
    status: 409,
    description: 'ROLE_IN_USE: il ruolo è assegnato ad almeno un utente, attivo o no',
  })
  async delete(@Param('guid') guid: string, @Req() req: Request): Promise<void> {
    const authInfo = req['authInfo'] as AuthInfo;
    await this.rolesService.delete(guid, authInfo, req.ip);
  }

  /** Catalogo dei permessi del registro, raggruppati per categoria (ADR-99 § 7). */
  @Get('permissions')
  @Permissions('roles:read')
  @ApiOperation({ summary: 'Catalogo dei permessi raggruppati per categoria' })
  @ApiResponse({
    status: 200,
    description: "Gruppi nell'ordine di PERMISSION_CATEGORIES, senza categorie vuote",
    type: [PermissionGroupResponseDto],
  })
  @ApiResponse({ status: 401, description: 'Non autenticato' })
  @ApiResponse({ status: 403, description: 'Permesso roles:read mancante' })
  async listPermissions(): Promise<PermissionGroup[]> {
    return this.rolesService.listPermissions();
  }
}
