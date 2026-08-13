/**
 * Store Zustand delle notifiche persistenti (campanella con badge, ADR-12).
 * Stato iniziale via REST (`GET /app/notifications*`), aggiornamenti in
 * realtime via Socket.io (`notification.new`, namespace `/realtime`) quando
 * `VITE_SOCKET_URL` è configurato e `RealtimeModule` è montato lato backend.
 * Se il socket non si connette la UI resta comunque funzionante (solo senza
 * push istantaneo): nessun polling di fallback, da aggiungere solo se
 * servirà davvero.
 */
import { useEffect } from 'react';
import { create } from 'zustand';
import { io, type Socket } from 'socket.io-client';
import { notifications as mantineNotifications } from '@mantine/notifications';
import { getToken } from '../utils/auth.utils';
import { getErrorMessage } from '../utils/api.utils';
import {
  getNotificationsApi,
  getUnreadCountApi,
  markAllNotificationsReadApi,
  markNotificationReadApi,
} from '../services/notifications.service';
import type { NotificationItem } from '../types/notifications.types';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL as string | undefined;
/** Numero massimo di notifiche recenti tenute in stato per il dropdown della campanella. */
const RECENT_LIMIT = 20;

interface NotificationsStoreState {
  items: NotificationItem[];
  unreadCount: number;
  isLoading: boolean;
  socket: Socket | null;
  /** Carica lo stato REST iniziale e apre il socket realtime, se configurato. */
  connect: () => void;
  /** Chiude il socket realtime e azzera lo stato (a logout / smontaggio del layout protetto). */
  disconnect: () => void;
  refresh: () => Promise<void>;
  markRead: (guid: string) => Promise<void>;
  markAllRead: () => Promise<void>;
}

export const useNotificationsStore = create<NotificationsStoreState>((set, get) => ({
  items: [],
  unreadCount: 0,
  isLoading: true,
  socket: null,

  /** Ricarica lista recente + conteggio non lette dal server (fonte di verità). */
  refresh: async (): Promise<void> => {
    try {
      const [list, unread] = await Promise.all([
        getNotificationsApi({ p: 1, i: RECENT_LIMIT }),
        getUnreadCountApi(),
      ]);
      set({ items: list.items, unreadCount: unread.count });
    } catch (err) {
      mantineNotifications.show({
        color: 'red',
        message: getErrorMessage(err, 'Impossibile caricare le notifiche'),
      });
    }
  },

  connect: (): void => {
    // Evita doppie connessioni (es. doppio mount di React StrictMode in sviluppo).
    if (get().socket) return;

    set({ isLoading: true });
    void get()
      .refresh()
      .finally(() => set({ isLoading: false }));

    // Connessione Socket.io al namespace /realtime: opt-in via VITE_SOCKET_URL
    // (assente finché il progetto verticale non attiva davvero il canale realtime).
    if (!SOCKET_URL) return;

    const socket = io(`${SOCKET_URL}/realtime`, {
      auth: (cb) => cb({ token: getToken() }),
      withCredentials: true,
    });

    socket.on('notification.new', (notification: NotificationItem) => {
      set((state) => ({
        items: [notification, ...state.items].slice(0, RECENT_LIMIT),
        unreadCount: state.unreadCount + 1,
      }));
      // Feedback immediato (toast), oltre alla persistenza in campanella: la
      // notifica resta comunque consultabile dopo che il toast è scomparso.
      mantineNotifications.show({ title: notification.title, message: notification.message });
    });

    set({ socket });
  },

  disconnect: (): void => {
    get().socket?.disconnect();
    set({ socket: null, items: [], unreadCount: 0, isLoading: true });
  },

  markRead: async (guid): Promise<void> => {
    const wasUnread = get().items.some((item) => item.guid === guid && !item.isRead);
    try {
      const updated = await markNotificationReadApi(guid);
      set((state) => ({
        items: state.items.map((item) => (item.guid === guid ? updated : item)),
        unreadCount: wasUnread ? Math.max(0, state.unreadCount - 1) : state.unreadCount,
      }));
    } catch (err) {
      mantineNotifications.show({
        color: 'red',
        message: getErrorMessage(err, 'Impossibile segnare la notifica come letta'),
      });
    }
  },

  markAllRead: async (): Promise<void> => {
    try {
      await markAllNotificationsReadApi();
      set((state) => ({
        items: state.items.map((item) => ({ ...item, isRead: true })),
        unreadCount: 0,
      }));
    } catch (err) {
      mantineNotifications.show({
        color: 'red',
        message: getErrorMessage(err, 'Impossibile segnare le notifiche come lette'),
      });
    }
  },
}));

/**
 * Connette il canale notifiche (REST + Socket.io) al mount, disconnette allo
 * smontaggio. Va montato solo per utenti autenticati (qui: dentro
 * `LayoutProtected`, l'unico layout applicativo protetto — vedi CLAUDE.md);
 * sostituisce il vecchio `<NotificationsProvider>`.
 */
export function useNotificationsInit(): void {
  const connect = useNotificationsStore((state) => state.connect);
  const disconnect = useNotificationsStore((state) => state.disconnect);
  useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect]);
}
