import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { and, count, desc, eq } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { notificationEntity } from '../db/schema';
import { AppGateway } from '../realtime/app.gateway';
import { AuthInfo, NotificationsQueryParams } from '../common/types';
import { Pagination } from '../common/pagination';
import { Utils } from '../common/utils';
import { NotificationDto } from './dto/notification.dto';

/** Contenuto di una nuova notifica, passato a {@link NotificationsService.notify}. */
export interface NotifyInput {
  type: string;
  title: string;
  message: string;
  link?: string;
}

/**
 * Notifiche persistenti per-utente (campanella con badge in UI, ADR-12).
 * `notify()` è il building block pensato per essere chiamato dai moduli di
 * dominio del CMS su eventi applicativi (nessun trigger registrato finché non
 * esistono moduli di dominio che lo usano).
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  /** Inietta l'accesso al DB e il gateway realtime (push best-effort al client connesso). */
  constructor(
    private readonly db: DbService,
    private readonly appGateway: AppGateway,
  ) {}

  /**
   * Crea una notifica per `targetUserId` e la pusha in realtime (evento
   * `notification.new` sulla room `user:${targetUserId}` di `AppGateway`) se un
   * client dell'utente è connesso. La persistenza in `notifications` resta la
   * fonte di verità: la lista/il badge del frontend si sincronizzano comunque
   * via `GET /app/notifications*` anche se il push realtime viene perso.
   * @param targetUserId Destinatario della notifica.
   * @param input Contenuto della notifica.
   * @param authorUserId Autore formale (createdBy), opzionale — assente per notifiche generate dal sistema.
   */
  async notify(
    targetUserId: number,
    input: NotifyInput,
    authorUserId?: number,
  ): Promise<NotificationDto> {
    const [row] = await this.db.db
      .insert(notificationEntity)
      .values({
        guid: Utils.randomString(16),
        userId: targetUserId,
        type: input.type,
        title: input.title,
        message: input.message,
        link: input.link ?? null,
        createdBy: authorUserId ?? null,
        updatedBy: authorUserId ?? null,
      })
      .returning();

    const dto = this.toDto(row);
    this.appGateway.emitToUser(targetUserId, 'notification.new', dto);
    this.logger.log(
      `Notifica creata (guid=${dto.guid}, userId=${targetUserId}, type=${input.type}).`,
    );
    return dto;
  }

  /**
   * Lista paginata delle notifiche del chiamante. Filtra sempre su
   * `userId = authInfo.userId`: nessun `Utils.applyScopeFilter`, la visibilità
   * qui è per singolo utente (mailbox personale), non multi-tenant/multi-sede.
   */
  async findAllForUser(
    authInfo: AuthInfo,
    params: NotificationsQueryParams,
  ): Promise<Pagination<NotificationDto>> {
    const page = params.p > 0 ? params.p : 1;
    const perPage = params.i > 0 ? params.i : 20;

    const conditions = [
      eq(notificationEntity.userId, authInfo.userId),
      eq(notificationEntity.isActive, true),
    ];
    if (params.unreadOnly) {
      conditions.push(eq(notificationEntity.isRead, false));
    }
    const where = and(...conditions);

    const [items, [{ total }]] = await Promise.all([
      this.db.db.query.notificationEntity.findMany({
        where,
        orderBy: desc(notificationEntity.createdAt),
        limit: perPage,
        offset: (page - 1) * perPage,
      }),
      this.db.db.select({ total: count() }).from(notificationEntity).where(where),
    ]);

    return new Pagination(
      items.map((row) => this.toDto(row)),
      total,
      page,
      perPage,
    );
  }

  /** Numero di notifiche non lette del chiamante (per il badge della campanella). */
  async unreadCount(authInfo: AuthInfo): Promise<number> {
    const [{ total }] = await this.db.db
      .select({ total: count() })
      .from(notificationEntity)
      .where(
        and(
          eq(notificationEntity.userId, authInfo.userId),
          eq(notificationEntity.isActive, true),
          eq(notificationEntity.isRead, false),
        ),
      );
    return total;
  }

  /**
   * Segna una notifica come letta. Il filtro `userId = authInfo.userId` nel
   * WHERE (non un controllo separato dopo il fetch) fa sì che un `guid` di
   * un'altra persona torni semplicemente 404, senza rivelarne l'esistenza.
   */
  async markRead(guid: string, authInfo: AuthInfo): Promise<NotificationDto> {
    const [row] = await this.db.db
      .update(notificationEntity)
      .set({ isRead: true, readAt: new Date(), updatedAt: new Date(), updatedBy: authInfo.userId })
      .where(
        and(
          eq(notificationEntity.guid, guid),
          eq(notificationEntity.userId, authInfo.userId),
          eq(notificationEntity.isActive, true),
        ),
      )
      .returning();

    if (!row) {
      throw new NotFoundException('Notifica non trovata.');
    }
    return this.toDto(row);
  }

  /** Segna come lette tutte le notifiche non lette del chiamante. Restituisce il numero aggiornato. */
  async markAllRead(authInfo: AuthInfo): Promise<number> {
    const rows = await this.db.db
      .update(notificationEntity)
      .set({ isRead: true, readAt: new Date(), updatedAt: new Date(), updatedBy: authInfo.userId })
      .where(
        and(
          eq(notificationEntity.userId, authInfo.userId),
          eq(notificationEntity.isActive, true),
          eq(notificationEntity.isRead, false),
        ),
      )
      .returning();

    return rows.length;
  }

  /** Converte una riga DB nel DTO pubblico (mai `userId`, implicito nel chiamante). */
  private toDto(row: typeof notificationEntity.$inferSelect): NotificationDto {
    return {
      guid: row.guid,
      type: row.type,
      title: row.title,
      message: row.message,
      link: row.link,
      isRead: row.isRead,
      createdAt: row.createdAt!,
    };
  }
}
