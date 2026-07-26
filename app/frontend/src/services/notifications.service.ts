/**
 * Service del modulo notifiche (campanella con badge, ADR-12).
 * Chiama gli endpoint reali `api/v1/app/notifications/*`, sempre limitati alle
 * notifiche del chiamante (nessun parametro utente: l'ownership è nel JWT).
 */
import api from './api';
import type { Pagination } from '../types/common.types';
import type {
  MarkAllReadResponse,
  NotificationItem,
  UnreadCountResponse,
} from '../types/notifications.types';

const NOTIFICATIONS_PREFIX = 'app/notifications';

/** Lista paginata delle notifiche del chiamante, più recenti prima. */
export async function getNotificationsApi(params: {
  p?: number;
  i?: number;
  unreadOnly?: boolean;
}): Promise<Pagination<NotificationItem>> {
  const { data } = await api.get<Pagination<NotificationItem>>(NOTIFICATIONS_PREFIX, {
    params: { p: params.p, i: params.i, unreadOnly: params.unreadOnly },
  });
  return data;
}

/** Conteggio delle notifiche non lette del chiamante, per il badge della campanella. */
export async function getUnreadCountApi(): Promise<UnreadCountResponse> {
  const { data } = await api.get<UnreadCountResponse>(`${NOTIFICATIONS_PREFIX}/unread-count`);
  return data;
}

/** Segna una notifica del chiamante come letta. */
export async function markNotificationReadApi(guid: string): Promise<NotificationItem> {
  const { data } = await api.patch<NotificationItem>(`${NOTIFICATIONS_PREFIX}/${guid}/read`);
  return data;
}

/** Segna tutte le notifiche del chiamante come lette. */
export async function markAllNotificationsReadApi(): Promise<MarkAllReadResponse> {
  const { data } = await api.patch<MarkAllReadResponse>(`${NOTIFICATIONS_PREFIX}/read-all`);
  return data;
}
