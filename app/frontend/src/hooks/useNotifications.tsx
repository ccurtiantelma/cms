/**
 * Provider/hook delle notifiche persistenti (campanella con badge, ADR-12).
 * Stato iniziale via REST (`GET /app/notifications*`), aggiornamenti in
 * realtime via Socket.io (`notification.new`, namespace `/realtime`) quando
 * `VITE_SOCKET_URL` è configurato e `RealtimeModule` è montato lato backend.
 * Se il socket non si connette la UI resta comunque funzionante (solo senza
 * push istantaneo): nessun polling di fallback nello starter-kit, il progetto
 * verticale lo aggiunge se serve davvero.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
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

interface NotificationsContextValue {
  items: NotificationItem[];
  unreadCount: number;
  isLoading: boolean;
  markRead: (guid: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  refresh: () => Promise<void>;
}

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

/**
 * Provider da montare solo per utenti autenticati (qui: dentro `LayoutProtected`,
 * l'unico layout applicativo protetto — vedi CLAUDE.md).
 */
export function NotificationsProvider({ children }: { children: ReactNode }): JSX.Element {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const socketRef = useRef<Socket | null>(null);

  /** Ricarica lista recente + conteggio non lette dal server (fonte di verità). */
  const refresh = useCallback(async (): Promise<void> => {
    try {
      const [list, unread] = await Promise.all([
        getNotificationsApi({ p: 1, i: RECENT_LIMIT }),
        getUnreadCountApi(),
      ]);
      setItems(list.items);
      setUnreadCount(unread.count);
    } catch (err) {
      mantineNotifications.show({
        color: 'red',
        message: getErrorMessage(err, 'Impossibile caricare le notifiche'),
      });
    }
  }, []);

  useEffect(() => {
    setIsLoading(true);
    void refresh().finally(() => setIsLoading(false));
  }, [refresh]);

  // Connessione Socket.io al namespace /realtime: opt-in via VITE_SOCKET_URL
  // (assente finché il progetto verticale non attiva davvero il canale realtime).
  useEffect(() => {
    if (!SOCKET_URL) return;

    const socket = io(`${SOCKET_URL}/realtime`, {
      auth: (cb) => cb({ token: getToken() }),
      withCredentials: true,
    });
    socketRef.current = socket;

    socket.on('notification.new', (notification: NotificationItem) => {
      setItems((prev) => [notification, ...prev].slice(0, RECENT_LIMIT));
      setUnreadCount((prev) => prev + 1);
      // Feedback immediato (toast), oltre alla persistenza in campanella: la
      // notifica resta comunque consultabile dopo che il toast è scomparso.
      mantineNotifications.show({ title: notification.title, message: notification.message });
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  const markRead = useCallback(
    async (guid: string): Promise<void> => {
      const wasUnread = items.some((item) => item.guid === guid && !item.isRead);
      try {
        const updated = await markNotificationReadApi(guid);
        setItems((prev) => prev.map((item) => (item.guid === guid ? updated : item)));
        if (wasUnread) {
          setUnreadCount((prev) => Math.max(0, prev - 1));
        }
      } catch (err) {
        mantineNotifications.show({
          color: 'red',
          message: getErrorMessage(err, 'Impossibile segnare la notifica come letta'),
        });
      }
    },
    [items],
  );

  const markAllRead = useCallback(async (): Promise<void> => {
    try {
      await markAllNotificationsReadApi();
      setItems((prev) => prev.map((item) => ({ ...item, isRead: true })));
      setUnreadCount(0);
    } catch (err) {
      mantineNotifications.show({
        color: 'red',
        message: getErrorMessage(err, 'Impossibile segnare le notifiche come lette'),
      });
    }
  }, []);

  return (
    <NotificationsContext.Provider
      value={{ items, unreadCount, isLoading, markRead, markAllRead, refresh }}
    >
      {children}
    </NotificationsContext.Provider>
  );
}

/** Hook per accedere allo stato delle notifiche. Va usato dentro `<NotificationsProvider>`. */
export function useNotifications(): NotificationsContextValue {
  const ctx = useContext(NotificationsContext);
  if (!ctx) {
    throw new Error('useNotifications deve essere usato dentro <NotificationsProvider>');
  }
  return ctx;
}
