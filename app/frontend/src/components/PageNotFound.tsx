/**
 * Pagina 404 - Risorsa non trovata.
 */
import { Container, Group, Paper, Text, Title, Button } from '@mantine/core';
import { IconSearchOff, IconHome } from '@tabler/icons-react';
import { useNavigate } from 'react-router-dom';

/**
 * Pagina visualizzata quando una risorsa non viene trovata.
 */
export default function PageNotFound(): JSX.Element {
  const navigate = useNavigate();

  return (
    <Container size="lg" py="xl">
      <Paper withBorder p="xl" radius="md">
        <Group justify="center" mb="md">
          <IconSearchOff size={64} />
        </Group>
        <Title order={2} ta="center" mb="sm">
          Pagina non trovata
        </Title>
        <Text c="dimmed" ta="center" mb="lg">
          La pagina o la risorsa richiesta non esiste o è stata rimossa.
        </Text>
        <Group justify="center">
          <Button leftSection={<IconHome size={16} />} onClick={() => navigate('/dashboard')}>
            Chiudi editor tema
          </Button>
        </Group>
      </Paper>
    </Container>
  );
}
