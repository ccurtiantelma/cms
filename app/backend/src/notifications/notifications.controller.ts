import { Controller, Get, Param, Patch, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { NotificationsService } from './notifications.service';
import { NotificationDto, UnreadCountDto, MarkAllReadDto } from './dto/notification.dto';
import { AuthInfo, NotificationsQueryParams } from '../common/types';
import { Pagination } from '../common/pagination';

/**
 * Endpoint self-service delle notifiche (campanella con badge, ADR-12): ogni
 * chiamante autenticato legge/gestisce solo le proprie, nessun guard di ruolo
 * (la barriera è l'appartenenza `userId`, non il livello RBAC).
 */
@ApiTags('Notifications')
@ApiBearerAuth('access-token')
@Controller('app/notifications')
export class NotificationsController {
  /** Inietta il service delle notifiche persistenti. */
  constructor(private readonly notificationsService: NotificationsService) {}

  /** Lista paginata delle notifiche del chiamante (proprie), più recenti prima. */
  @Get()
  @ApiOperation({ summary: 'Lista paginata delle notifiche del chiamante, più recenti prima' })
  @ApiQuery({ name: 'p', required: false, description: 'Pagina (default 1)' })
  @ApiQuery({ name: 'i', required: false, description: 'Elementi per pagina (default 20)' })
  @ApiQuery({
    name: 'unreadOnly',
    required: false,
    description: 'Se "true", restituisce solo le notifiche non lette',
  })
  @ApiResponse({ status: 200, description: 'Lista notifiche paginata' })
  async findAll(
    @Query('p') p: string,
    @Query('i') i: string,
    @Query('unreadOnly') unreadOnly: string,
    @Req() req: Request,
  ): Promise<Pagination<NotificationDto>> {
    const authInfo = req['authInfo'] as AuthInfo;
    const params: NotificationsQueryParams = {
      p: p ? parseInt(p, 10) : 1,
      i: i ? parseInt(i, 10) : 20,
      unreadOnly: unreadOnly === 'true',
    };
    return this.notificationsService.findAllForUser(authInfo, params);
  }

  /** Conteggio non lette del chiamante, per il badge della campanella. */
  @Get('unread-count')
  @ApiOperation({ summary: 'Numero di notifiche non lette del chiamante' })
  @ApiResponse({ status: 200, description: 'Conteggio non lette', type: UnreadCountDto })
  async unreadCount(@Req() req: Request): Promise<UnreadCountDto> {
    const authInfo = req['authInfo'] as AuthInfo;
    const notificationCount = await this.notificationsService.unreadCount(authInfo);
    return { count: notificationCount };
  }

  /** Segna una notifica del chiamante come letta. */
  @Patch(':guid/read')
  @ApiOperation({ summary: 'Segna una notifica come letta (solo se del chiamante)' })
  @ApiResponse({ status: 200, description: 'Notifica aggiornata', type: NotificationDto })
  @ApiResponse({ status: 404, description: 'Notifica non trovata o non del chiamante' })
  async markRead(@Param('guid') guid: string, @Req() req: Request): Promise<NotificationDto> {
    const authInfo = req['authInfo'] as AuthInfo;
    return this.notificationsService.markRead(guid, authInfo);
  }

  /** Segna tutte le notifiche non lette del chiamante come lette. */
  @Patch('read-all')
  @ApiOperation({ summary: 'Segna tutte le notifiche del chiamante come lette' })
  @ApiResponse({ status: 200, description: 'Numero di notifiche aggiornate', type: MarkAllReadDto })
  async markAllRead(@Req() req: Request): Promise<MarkAllReadDto> {
    const authInfo = req['authInfo'] as AuthInfo;
    const updated = await this.notificationsService.markAllRead(authInfo);
    return { updated };
  }
}
