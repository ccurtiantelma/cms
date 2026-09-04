/**
 * Campanella con badge (ADR-12): mostra le notifiche recenti del chiamante
 * (persistite in `notifications`, aggiornate in realtime via Socket.io quando
 * configurato) in un dropdown, con conteggio non lette e azioni di lettura.
 */
import {
  ActionIcon,
  Group,
  Indicator,
  Popover,
  ScrollArea,
  Stack,
  Text,
  UnstyledButton,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconBell } from '@tabler/icons-react';
import { useNotificationsStore } from '../hooks/useNotifications';
import { formatDate } from '../utils/date.utils';
import classes from './NotificationBell.module.css';

export default function NotificationBell(): JSX.Element {
  const [opened, { toggle }] = useDisclosure(false);
  const items = useNotificationsStore((state) => state.items);
  const unreadCount = useNotificationsStore((state) => state.unreadCount);
  const markRead = useNotificationsStore((state) => state.markRead);
  const markAllRead = useNotificationsStore((state) => state.markAllRead);

  return (
    <Popover
      opened={opened}
      onChange={toggle}
      position="bottom-end"
      withArrow
      shadow="md"
      width={340}
    >
      <Popover.Target>
        <Indicator
          label={unreadCount}
          size={16}
          color="red"
          disabled={unreadCount === 0}
          offset={4}
        >
          <ActionIcon
            className={classes.bellButton}
            variant="transparent"
            onClick={toggle}
            aria-label="Notifiche"
          >
            <IconBell size={20} color="var(--app-navbar-text, var(--mantine-color-dark-7))" />
          </ActionIcon>
        </Indicator>
      </Popover.Target>

      <Popover.Dropdown p={0}>
        <Group justify="space-between" p="sm" className={classes.header}>
          <Text fw={600} size="sm">
            Notifiche
          </Text>
          {unreadCount > 0 && (
            <UnstyledButton className={classes.markAllButton} onClick={() => void markAllRead()}>
              Segna tutte come lette
            </UnstyledButton>
          )}
        </Group>

        <ScrollArea.Autosize mah={360}>
          {items.length === 0 ? (
            <Text c="dimmed" size="sm" p="md" ta="center">
              Nessuna notifica
            </Text>
          ) : (
            <Stack gap={0}>
              {items.map((item) => (
                <UnstyledButton
                  key={item.guid}
                  className={item.isRead ? classes.item : `${classes.item} ${classes.itemUnread}`}
                  onClick={() => !item.isRead && void markRead(item.guid)}
                >
                  <Text size="sm" fw={500}>
                    {item.title}
                  </Text>
                  <Text size="xs" c="dimmed" lineClamp={2}>
                    {item.message}
                  </Text>
                  <Text size="xs" c="dimmed" mt={4}>
                    {formatDate(item.createdAt)}
                  </Text>
                </UnstyledButton>
              ))}
            </Stack>
          )}
        </ScrollArea.Autosize>
      </Popover.Dropdown>
    </Popover>
  );
}
