import { NotFoundException } from '@nestjs/common';
import { NotificationsService } from '../../../src/notifications/notifications.service';
import { DbService } from '../../../src/db/db.service';
import { AppGateway } from '../../../src/realtime/app.gateway';
import { AppUserRoles } from '../../../src/common/enums';
import { AuthInfo } from '../../../src/common/types';

describe('NotificationsService (unit)', () => {
  let notificationsService: NotificationsService;
  let insertValuesMock: jest.Mock;
  let updateSetMock: jest.Mock;
  let updateWhereMock: jest.Mock;
  let findManyMock: jest.Mock;
  let selectWhereMock: jest.Mock;
  let appGateway: { emitToUser: jest.Mock };

  const buildAuthInfo = (userId: number): AuthInfo => ({
    userId,
    role: AppUserRoles.User,
    name: 'Test',
    scopeId: null,
  });

  const storedRow = {
    id: 1,
    guid: 'a1b2c3d4e5f6a7b8',
    userId: 7,
    type: 'system.info',
    title: 'Titolo',
    message: 'Messaggio',
    link: null,
    isRead: false,
    readAt: null,
    isActive: true,
    createdAt: new Date('2026-07-23T10:00:00.000Z'),
    updatedAt: new Date('2026-07-23T10:00:00.000Z'),
    createdBy: null,
    updatedBy: null,
  };

  beforeEach(() => {
    insertValuesMock = jest
      .fn()
      .mockReturnValue({ returning: jest.fn().mockResolvedValue([storedRow]) });
    updateWhereMock = jest.fn();
    updateSetMock = jest.fn().mockReturnValue({ where: updateWhereMock });
    findManyMock = jest.fn();
    selectWhereMock = jest.fn();

    const dbService = {
      db: {
        insert: jest.fn().mockReturnValue({ values: insertValuesMock }),
        update: jest.fn().mockReturnValue({ set: updateSetMock }),
        select: jest
          .fn()
          .mockReturnValue({ from: jest.fn().mockReturnValue({ where: selectWhereMock }) }),
        query: { notificationEntity: { findMany: findManyMock } },
      },
    } as unknown as DbService;

    appGateway = { emitToUser: jest.fn() };

    notificationsService = new NotificationsService(dbService, appGateway as unknown as AppGateway);
  });

  describe('notify', () => {
    it("crea la notifica in DB e la pusha via gateway sulla room dell'utente destinatario", async () => {
      const result = await notificationsService.notify(7, {
        type: 'system.info',
        title: 'Titolo',
        message: 'Messaggio',
      });

      expect(insertValuesMock).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 7,
          type: 'system.info',
          title: 'Titolo',
          message: 'Messaggio',
          createdBy: null,
          updatedBy: null,
        }),
      );
      expect(appGateway.emitToUser).toHaveBeenCalledWith(
        7,
        'notification.new',
        expect.objectContaining({ guid: storedRow.guid }),
      );
      expect(result).toEqual({
        guid: storedRow.guid,
        type: storedRow.type,
        title: storedRow.title,
        message: storedRow.message,
        link: storedRow.link,
        isRead: storedRow.isRead,
        createdAt: storedRow.createdAt,
      });
    });

    it("registra l'autore quando la notifica è generata da un'azione utente, non dal sistema", async () => {
      await notificationsService.notify(
        7,
        { type: 'system.info', title: 'Titolo', message: 'Messaggio' },
        99,
      );

      expect(insertValuesMock).toHaveBeenCalledWith(
        expect.objectContaining({ createdBy: 99, updatedBy: 99 }),
      );
    });
  });

  describe('findAllForUser', () => {
    it('restituisce la pagina richiesta filtrata sul chiamante', async () => {
      findManyMock.mockResolvedValue([storedRow]);
      selectWhereMock.mockResolvedValue([{ total: 1 }]);
      const authInfo = buildAuthInfo(7);

      const result = await notificationsService.findAllForUser(authInfo, { p: 1, i: 20 });

      expect(findManyMock).toHaveBeenCalledWith(expect.objectContaining({ limit: 20, offset: 0 }));
      expect(result.items).toHaveLength(1);
      expect(result.items[0].guid).toBe(storedRow.guid);
      expect(result.totalItems).toBe(1);
      expect(result.currentPage).toBe(1);
    });
  });

  describe('unreadCount', () => {
    it('restituisce il conteggio delle notifiche non lette del chiamante', async () => {
      selectWhereMock.mockResolvedValue([{ total: 4 }]);
      const authInfo = buildAuthInfo(7);

      await expect(notificationsService.unreadCount(authInfo)).resolves.toBe(4);
    });
  });

  describe('markRead', () => {
    it('segna come letta una notifica del chiamante', async () => {
      updateWhereMock.mockReturnValue({
        returning: jest.fn().mockResolvedValue([{ ...storedRow, isRead: true }]),
      });
      const authInfo = buildAuthInfo(7);

      const result = await notificationsService.markRead(storedRow.guid, authInfo);

      expect(result.isRead).toBe(true);
    });

    it('lancia NotFoundException se il guid non esiste o non è del chiamante (nessun controllo separato dopo il fetch: il filtro è nel WHERE)', async () => {
      updateWhereMock.mockReturnValue({ returning: jest.fn().mockResolvedValue([]) });
      const authInfo = buildAuthInfo(99);

      await expect(
        notificationsService.markRead('guid-di-un-altro-utente', authInfo),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('markAllRead', () => {
    it('segna come lette tutte le non lette del chiamante e ne restituisce il conteggio', async () => {
      updateWhereMock.mockReturnValue({
        returning: jest.fn().mockResolvedValue([storedRow, storedRow]),
      });
      const authInfo = buildAuthInfo(7);

      await expect(notificationsService.markAllRead(authInfo)).resolves.toBe(2);
    });

    it('restituisce 0 quando non ci sono notifiche non lette', async () => {
      updateWhereMock.mockReturnValue({ returning: jest.fn().mockResolvedValue([]) });
      const authInfo = buildAuthInfo(7);

      await expect(notificationsService.markAllRead(authInfo)).resolves.toBe(0);
    });
  });
});
