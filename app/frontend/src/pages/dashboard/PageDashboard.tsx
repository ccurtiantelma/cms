/** Dashboard con il punto di ingresso per le statistiche del sito e dell'app. */
import { Alert, Group, Loader, Progress, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { IconAlertCircle, IconChartBar, IconDeviceDesktopAnalytics } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { useAuthStore } from '../../hooks/useAuth';
import ContentCard from '../../components/ContentCard';
import { fetchAnalytics } from '../../services/analytics.service';
import type { AnalyticsResponse, AnalyticsSeriesPoint } from '../../types/analytics.types';
import { AppUserRoles } from '../../types/common.types';

interface DailyVisits {
  date: string;
  visits: number;
}

function dateRange(): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - 29);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

function aggregateByDay(series: AnalyticsSeriesPoint[]): DailyVisits[] {
  const totals = new Map<string, number>();
  series.forEach((point) => totals.set(point.date, (totals.get(point.date) ?? 0) + point.visits));
  return [...totals.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, visits]) => ({ date, visits }));
}

function formatDate(date: string): string {
  return new Intl.DateTimeFormat('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(`${date}T00:00:00Z`));
}

function DailySeries({
  series,
  emptyText,
}: {
  series: DailyVisits[];
  emptyText: string;
}): JSX.Element {
  if (series.length === 0)
    return (
      <Text c="dimmed" size="sm">
        {emptyText}
      </Text>
    );
  const maximum = Math.max(...series.map((point) => point.visits), 1);
  return (
    <Stack gap="xs" aria-label="Serie giornaliera visite">
      {series.map((point) => (
        <Group key={point.date} gap="sm" wrap="nowrap">
          <Text size="xs" c="dimmed" w={82}>
            {formatDate(point.date)}
          </Text>
          <Progress
            value={(point.visits / maximum) * 100}
            flex={1}
            aria-label={`${point.visits} visite`}
          />
          <Text size="sm" fw={600} w={36} ta="right">
            {point.visits}
          </Text>
        </Group>
      ))}
    </Stack>
  );
}

function LoadingState(): JSX.Element {
  return (
    <Group justify="center" py="md">
      <Loader size="sm" />
    </Group>
  );
}

function ErrorState(): JSX.Element {
  return (
    <Alert color="red" icon={<IconAlertCircle size={16} />}>
      Statistiche non disponibili.
    </Alert>
  );
}

/** Pagina dashboard, separa il traffico pubblico dall'utilizzo dell'applicazione. */
export default function PageDashboard(): JSX.Element {
  const user = useAuthStore((state) => state.user);
  const [analytics, setAnalytics] = useState<AnalyticsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    if (!user || user.role > AppUserRoles.Admin) return;

    let cancelled = false;
    setIsLoading(true);
    setHasError(false);

    const { from, to } = dateRange();
    void fetchAnalytics(from, to)
      .then((data) => {
        if (!cancelled) setAnalytics(data);
      })
      .catch(() => {
        if (!cancelled) setHasError(true);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const siteSeries = aggregateByDay(analytics?.site.series ?? []);
  const trafficPages = new Set(
    analytics?.site.series.flatMap((point) => (point.path ? [point.path] : [])) ?? [],
  ).size;
  const lastSiteDay = siteSeries.at(-1);

  return (
    <Stack gap="lg" data-tour="dashboard-kpi">
      <ContentCard>
        <Stack gap="xl">
          <div>
            <Title order={2}>Benvenuto, {user?.name ?? ''}</Title>
            <Text c="dimmed" size="sm" mt={4}>
              Panoramica del traffico del sito pubblicato.
            </Text>
          </div>

          <Group gap="sm">
            <IconChartBar size={24} aria-hidden />
            <Title order={3}>Traffico sito pubblico</Title>
          </Group>
          {isLoading ? (
            <LoadingState />
          ) : hasError ? (
            <ErrorState />
          ) : (
            <>
              <SimpleGrid cols={{ base: 1, sm: 3 }}>
                <div>
                  <Text size="xs" c="dimmed">
                    Visite totali
                  </Text>
                  <Text fw={700} size="xl">
                    {analytics?.site.totalVisits ?? 0}
                  </Text>
                </div>
                <div>
                  <Text size="xs" c="dimmed">
                    Pagine con traffico
                  </Text>
                  <Text fw={700} size="xl">
                    {trafficPages}
                  </Text>
                </div>
                <div>
                  <Text size="xs" c="dimmed">
                    Ultimo giorno
                  </Text>
                  <Text fw={700} size="sm">
                    {lastSiteDay
                      ? `${formatDate(lastSiteDay.date)} (${lastSiteDay.visits})`
                      : 'Nessun dato'}
                  </Text>
                </div>
              </SimpleGrid>
              <DailySeries series={siteSeries} emptyText="Nessuna visita registrata nel periodo." />
            </>
          )}
        </Stack>
      </ContentCard>

      <ContentCard>
        <Stack gap="md">
          <Group gap="sm">
            <IconDeviceDesktopAnalytics size={24} aria-hidden />
            <div>
              <Title order={3}>Utilizzo applicazione</Title>
            </div>
          </Group>
          {user && user.role <= AppUserRoles.Admin ? (
            isLoading ? (
              <LoadingState />
            ) : hasError ? (
              <ErrorState />
            ) : (
              <>
                <SimpleGrid cols={{ base: 1, sm: 3 }}>
                  <div>
                    <Text size="xs" c="dimmed">
                      Utenti registrati
                    </Text>
                    <Text fw={700} size="xl">
                      {analytics?.app.registeredUsers ?? 0}
                    </Text>
                  </div>
                  <div>
                    <Text size="xs" c="dimmed">
                      Utenti attivi
                    </Text>
                    <Text fw={700} size="xl">
                      {analytics?.app.activeUsers ?? 0}
                    </Text>
                  </div>
                  <div>
                    <Text size="xs" c="dimmed">
                      Accessi riusciti
                    </Text>
                    <Text fw={700} size="xl">
                      {analytics?.app.successfulLogins ?? 0}
                    </Text>
                  </div>
                </SimpleGrid>
                <DailySeries
                  series={aggregateByDay(analytics?.app.loginSeries ?? [])}
                  emptyText="Nessun accesso registrato nel periodo."
                />
              </>
            )
          ) : (
            <Text c="dimmed" size="sm">
              Le statistiche dell’applicazione sono riservate agli amministratori.
            </Text>
          )}
        </Stack>
      </ContentCard>
    </Stack>
  );
}
