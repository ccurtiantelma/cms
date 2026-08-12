/**
 * Banner fisso mostrato durante una sessione di impersonificazione (SuperAdmin only).
 */
import { useState } from 'react';
import { Box, Button, Group, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconUserExclamation } from '@tabler/icons-react';
import { useAuthStore } from '../hooks/useAuth';
import { getImpersonatedBy, setToken, setStoredUser } from '../utils/auth.utils';
import { getErrorMessage } from '../utils/api.utils';
import { endImpersonationApi } from '../services/auth.service';

/**
 * Se il token corrente è una sessione di impersonificazione, mostra un banner fisso
 * con il nome dell'utente impersonato e un pulsante per terminare la sessione e
 * ripristinare il JWT originale del SuperAdmin.
 */
export default function ImpersonationBanner(): JSX.Element | null {
  const user = useAuthStore((state) => state.user);
  const [submitting, setSubmitting] = useState(false);

  if (getImpersonatedBy() === null) return null;

  async function handleEndImpersonation(): Promise<void> {
    setSubmitting(true);
    try {
      const response = await endImpersonationApi();
      setToken(response.accessToken);
      setStoredUser(response.user);
      window.location.href = '/dashboard';
    } catch (err) {
      notifications.show({
        color: 'red',
        message: getErrorMessage(err, "Errore nel terminare l'impersonificazione"),
      });
      setSubmitting(false);
    }
  }

  return (
    <Box bg="orange.9" px="md" py="xs">
      <Group justify="space-between">
        <Group gap="xs">
          <IconUserExclamation size={18} color="white" />
          <Text size="sm" c="white">
            Stai visualizzando come <strong>{user?.name ?? 'utente'}</strong>
          </Text>
        </Group>
        <Button
          size="xs"
          variant="white"
          color="dark"
          loading={submitting}
          onClick={handleEndImpersonation}
        >
          Termina impersonificazione
        </Button>
      </Group>
    </Box>
  );
}
