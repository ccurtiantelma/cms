/**
 * Pagina errore 5xx - Errore del server.
 */
import { Container, Group, Paper, Text, Title, Button } from '@mantine/core';
import { IconServer, IconRefresh, IconHome } from '@tabler/icons-react';
import { useNavigate } from 'react-router-dom';

/**
 * Pagina visualizzata in caso di errori server 5xx.
 */
export default function PageServerError(): JSX.Element {
  const navigate = useNavigate();

  const handleRetry = (): void => {
    window.location.reload();
  };

  return (
    <Container size="lg" py="xl">
      <Paper withBorder p="xl" radius="md">
        <Group justify="center" mb="md">
          <IconServer size={64} />
        </Group>
        <Title order={2} ta="center" mb="sm">
          Errore del server
        </Title>
        <Text c="dimmed" ta="center" mb="lg">
          Si è verificato un problema con il server. Riprova più tardi o contatta l&apos;assistenza.
        </Text>
        <Group justify="center" gap="sm">
          <Button leftSection={<IconRefresh size={16} />} onClick={handleRetry}>
            Riprova
          </Button>
          <Button
            variant="default"
            leftSection={<IconHome size={16} />}
            onClick={() => navigate('/dashboard')}
          >
            Dashboard
          </Button>
        </Group>
      </Paper>
    </Container>
  );
}
