/**
 * Dashboard di atterraggio post-login. Non contiene ancora logica di dominio:
 * mostra un saluto, il ruolo dell'utente e collegamenti rapidi ai moduli
 * disponibili (Utenti, Audit Log) per i ruoli abilitati.
 * Ogni progetto che eredita questa base sostituisce questa pagina con le
 * proprie KPI/grafici.
 */
import { Card, Grid, Group, Text, Title } from '@mantine/core';
import { IconHistory, IconUsers } from '@tabler/icons-react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../hooks/useAuth';
import ContentCard from '../../components/ContentCard';
import PageHeader from '../../components/PageHeader';
import { AppUserRoles, ROLE_LABELS } from '../../types/common.types';

/** Pagina dashboard, landing page per tutti i ruoli autenticati. */
export default function PageDashboard(): JSX.Element {
  const user = useAuthStore((state) => state.user);
  const navigate = useNavigate();

  const roleLabel =
    user?.role !== undefined ? (ROLE_LABELS[user.role as AppUserRoles] ?? 'Utente') : '';
  const isAdminOrAbove = user?.role !== undefined && user.role <= AppUserRoles.Admin;

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: 'Dashboard' }]}
        title="Dashboard"
        subtitle={`Benvenuto, ${user?.name ?? ''}`}
      />

      <ContentCard>
        <div data-tour="dashboard-kpi">
          <Title order={3} mb="xs">
            Il tuo account
          </Title>
          <Text c="dimmed" size="sm" mb="lg">
            Sei autenticato come <strong>{roleLabel}</strong>
            {user?.scopeId ? ` — ambito ${user.scopeId}` : ''}.
          </Text>

          {isAdminOrAbove && (
            <Grid>
              <Grid.Col span={{ base: 12, sm: 6, md: 4 }}>
                <Card
                  withBorder
                  radius="md"
                  p="lg"
                  style={{ cursor: 'pointer' }}
                  onClick={() => navigate('/users')}
                >
                  <Group>
                    <IconUsers size={28} />
                    <div>
                      <Text fw={600}>Utenti</Text>
                      <Text size="xs" c="dimmed">
                        Gestisci gli utenti dell'applicazione
                      </Text>
                    </div>
                  </Group>
                </Card>
              </Grid.Col>
              <Grid.Col span={{ base: 12, sm: 6, md: 4 }}>
                <Card
                  withBorder
                  radius="md"
                  p="lg"
                  style={{ cursor: 'pointer' }}
                  onClick={() => navigate('/users?tab=audit-log')}
                >
                  <Group>
                    <IconHistory size={28} />
                    <div>
                      <Text fw={600}>Audit Log</Text>
                      <Text size="xs" c="dimmed">
                        Consulta il registro delle azioni sensibili
                      </Text>
                    </div>
                  </Group>
                </Card>
              </Grid.Col>
            </Grid>
          )}
        </div>
      </ContentCard>
    </div>
  );
}
