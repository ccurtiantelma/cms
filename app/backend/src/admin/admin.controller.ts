import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { GuardAdmin, GuardSuperAdmin } from '../auth/guard';
import { AdminService } from './admin.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { AuditLogQueryParams, AuthInfo, PaginationParams } from '../common/types';
import { Pagination } from '../common/pagination';

/** Endpoint amministrativi: gestione utenti e audit log (Admin+), dati demo (SuperAdmin only). */
@ApiTags('Admin')
@ApiBearerAuth('access-token')
@Controller('app/admin')
export class AdminController {
  /** Inietta il servizio applicativo per la gestione utenti/audit log/dati demo. */
  constructor(private readonly adminService: AdminService) {}

  // ─── Sistema (SuperAdmin only) ───────────────────────────────────────────

  /** Carica i dati demo (SuperAdmin only). */
  @Post('system/seed-demo')
  @UseGuards(GuardSuperAdmin)
  @ApiOperation({ summary: 'Carica i dati demo (SuperAdmin only)' })
  @ApiResponse({ status: 200, description: 'Summary record creati per tabella' })
  async seedDemo(@Req() req: Request): Promise<Record<string, number>> {
    const authInfo = req['authInfo'] as AuthInfo;
    return this.adminService.seedDemo(authInfo, req.ip);
  }

  /** Cancella tutti i dati tranne il SuperAdmin (SuperAdmin only, irreversibile). */
  @Post('system/reset-demo')
  @UseGuards(GuardSuperAdmin)
  @ApiOperation({
    summary: 'Cancella tutti i dati tranne il SuperAdmin (SuperAdmin only, irreversibile)',
  })
  @ApiResponse({ status: 200, description: 'Summary record cancellati per tabella' })
  async resetDemo(@Req() req: Request): Promise<Record<string, number>> {
    const authInfo = req['authInfo'] as AuthInfo;
    return this.adminService.resetDemo(authInfo, req.ip);
  }

  // ─── Gestione utenti (Admin+) ────────────────────────────────────────────

  /** Lista utenti paginata (un Admin non vede gli utenti SuperAdmin). */
  @Get('users')
  @UseGuards(GuardAdmin)
  @ApiOperation({ summary: 'Lista utenti paginata (un Admin non vede gli utenti SuperAdmin)' })
  @ApiQuery({ name: 'p', required: false, description: 'Pagina (default 1)' })
  @ApiQuery({ name: 'i', required: false, description: 'Elementi per pagina (default 20)' })
  @ApiQuery({ name: 'q', required: false, description: 'Ricerca testuale su nome, cognome, email' })
  @ApiQuery({
    name: 'o',
    required: false,
    description: 'Campo di ordinamento (name, surname, email, role, createdAt)',
  })
  @ApiQuery({
    name: 'd',
    required: false,
    description: 'Direzione ordinamento (asc|desc, default asc)',
  })
  @ApiResponse({ status: 200, description: 'Lista utenti paginata' })
  async findAllUsers(
    @Query('p') p: string,
    @Query('i') i: string,
    @Query('q') q: string,
    @Query('o') o: string,
    @Query('d') d: string,
    @Req() req: Request,
  ): Promise<Pagination<unknown>> {
    const authInfo = req['authInfo'] as AuthInfo;
    const params: PaginationParams = {
      p: p ? parseInt(p, 10) : 1,
      i: i ? parseInt(i, 10) : 20,
      q,
      o,
      d,
    };
    return this.adminService.findAllUsers(authInfo, params);
  }

  /** Dettaglio utente (un Admin non vede gli utenti SuperAdmin). */
  @Get('users/:guid')
  @UseGuards(GuardAdmin)
  @ApiOperation({ summary: 'Dettaglio utente (un Admin non vede gli utenti SuperAdmin)' })
  @ApiResponse({ status: 200, description: 'Utente trovato' })
  @ApiResponse({ status: 403, description: "Target SuperAdmin non gestibile dall'Admin" })
  @ApiResponse({ status: 404, description: 'Utente non trovato' })
  async findOneUser(@Param('guid') guid: string, @Req() req: Request): Promise<unknown> {
    const authInfo = req['authInfo'] as AuthInfo;
    return this.adminService.findOneUser(guid, authInfo);
  }

  /** Crea un nuovo utente (un Admin non può creare utenti SuperAdmin). */
  @Post('users')
  @UseGuards(GuardAdmin)
  @ApiOperation({ summary: 'Crea un nuovo utente (un Admin non può creare utenti SuperAdmin)' })
  @ApiResponse({ status: 201, description: 'Utente creato' })
  @ApiResponse({
    status: 403,
    description: "Tentativo di creare un utente SuperAdmin da parte dell'Admin",
  })
  async createUser(@Body() dto: CreateUserDto, @Req() req: Request): Promise<{ guid: string }> {
    const authInfo = req['authInfo'] as AuthInfo;
    return this.adminService.createUser(dto, authInfo, req.ip);
  }

  /** Aggiorna i dati di un utente. */
  @Patch('users/:guid')
  @UseGuards(GuardAdmin)
  @ApiOperation({ summary: 'Aggiorna i dati di un utente' })
  @ApiResponse({ status: 200, description: 'Utente aggiornato' })
  @ApiResponse({ status: 403, description: "Target SuperAdmin non gestibile dall'Admin" })
  @ApiResponse({ status: 404, description: 'Utente non trovato' })
  async updateUser(
    @Param('guid') guid: string,
    @Body() dto: UpdateUserDto,
    @Req() req: Request,
  ): Promise<{ guid: string }> {
    const authInfo = req['authInfo'] as AuthInfo;
    return this.adminService.updateUser(guid, dto, authInfo, req.ip);
  }

  /** Abilita/disabilita un utente senza eliminarlo (soft toggle). */
  @Patch('users/:guid/toggle-active')
  @UseGuards(GuardAdmin)
  @ApiOperation({ summary: 'Abilita/disabilita un utente senza eliminarlo' })
  @ApiResponse({ status: 200, description: 'Stato isActive invertito' })
  @ApiResponse({ status: 403, description: "Target SuperAdmin non gestibile dall'Admin" })
  @ApiResponse({ status: 404, description: 'Utente non trovato' })
  async toggleActiveUser(
    @Param('guid') guid: string,
    @Req() req: Request,
  ): Promise<{ guid: string; isActive: boolean }> {
    const authInfo = req['authInfo'] as AuthInfo;
    return this.adminService.toggleActiveUser(guid, authInfo, req.ip);
  }

  /** Resetta l'MFA di un utente (potrà ri-configurarla al prossimo login). */
  @Post('users/:guid/reset-mfa')
  @UseGuards(GuardAdmin)
  @ApiOperation({ summary: "Resetta l'MFA di un utente (potrà ri-configurarla al prossimo login)" })
  @ApiResponse({ status: 200, description: 'MFA resettata con successo' })
  @ApiResponse({ status: 403, description: "Target SuperAdmin non gestibile dall'Admin" })
  @ApiResponse({ status: 404, description: 'Utente non trovato' })
  async resetMfaUser(
    @Param('guid') guid: string,
    @Req() req: Request,
  ): Promise<{ success: boolean }> {
    const authInfo = req['authInfo'] as AuthInfo;
    return this.adminService.resetMfaUser(guid, authInfo, req.ip);
  }

  // ─── Audit log (Admin+, sola lettura) ────────────────────────────────────

  /** Lista paginata degli eventi di audit log (Admin+). */
  @Get('audit-log')
  @UseGuards(GuardAdmin)
  @ApiOperation({ summary: 'Lista paginata degli eventi di audit log (Admin+)' })
  @ApiQuery({ name: 'p', required: false, description: 'Pagina (default 1)' })
  @ApiQuery({ name: 'i', required: false, description: 'Elementi per pagina (default 20)' })
  @ApiQuery({ name: 'userId', required: false, description: "Filtra per id dell'utente autore" })
  @ApiQuery({
    name: 'action',
    required: false,
    description: 'Filtra per azione (ricerca parziale, es. "login")',
  })
  @ApiQuery({ name: 'from', required: false, description: 'Data/ora inizio (ISO 8601)' })
  @ApiQuery({ name: 'to', required: false, description: 'Data/ora fine (ISO 8601)' })
  @ApiResponse({ status: 200, description: 'Lista audit log paginata' })
  async findAuditLog(
    @Query('p') p: string,
    @Query('i') i: string,
    @Query('userId') userId: string,
    @Query('action') action: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ): Promise<Pagination<unknown>> {
    const params: AuditLogQueryParams = {
      p: p ? parseInt(p, 10) : 1,
      i: i ? parseInt(i, 10) : 20,
      userId: userId ? parseInt(userId, 10) : undefined,
      action,
      from,
      to,
    };
    return this.adminService.findAuditLog(params);
  }
}
