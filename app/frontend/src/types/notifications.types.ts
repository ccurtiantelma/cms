/**
 * Tipi del modulo notifiche (campanella con badge, ADR-12).
 * Combaciano con `NotificationDto` di `app/backend/src/notifications/dto/notification.dto.ts`.
 */

export interface NotificationItem {
  guid: string;
  type: string;
  title: string;
  message: string;
  link?: string | null;
  isRead: boolean;
  createdAt: string;
}

export interface UnreadCountResponse {
  count: number;
}

export interface MarkAllReadResponse {
  updated: number;
}

/** Payload dell'evento Socket.io `notification.new` (namespace `/realtime`, room `user:${userId}`). */
export type NotificationNewEvent = NotificationItem;
