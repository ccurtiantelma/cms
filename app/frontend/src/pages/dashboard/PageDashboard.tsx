/** Dashboard con il punto di ingresso al pannello Analytics del sito pubblico. */
import { Alert, Group, SegmentedControl, Skeleton, Stack, Text, Title } from '@mantine/core';
import {
  IconAlertCircle,
  IconChartLine,
  IconDeviceDesktop,
  IconDeviceMobile,
  IconDeviceTablet,
  IconDeviceUnknown,
  IconEye,
  IconFiles,
  IconUsers,
  type TablerIcon,
} from '@tabler/icons-react';
import { useEffect } from 'react';
import { useAuthStore } from '../../hooks/useAuth';
import { useAnalyticsStore } from '../../hooks/useAnalyticsStore';
import ContentCard from '../../components/ContentCard';
import AnalyticsOverviewPanel from './components/analytics/AnalyticsOverviewPanel';
import type { AnalyticsOverviewData } from './components/analytics/AnalyticsOverviewPanel';
import type { AnalyticsStat } from './components/analytics/AnalyticsStatsGrid';
import type { AnalyticsTrafficPoint } from './components/analytics/AnalyticsTrafficChart';
import type { AnalyticsTopPage } from './components/analytics/AnalyticsTopPagesTable';
import type { AnalyticsDevice } from './components/analytics/AnalyticsDevicesDonut';
import type { AnalyticsOverview } from '../../types/analytics.types';
import type { components } from '../../types/api.types';
import { AppUserRoles } from '../../types/common.types';

type AnalyticsTimeseriesPointDto = components['schemas']['AnalyticsTimeseriesPointDto'];
type AnalyticsTopPageDto = components['schemas']['AnalyticsTopPageDto'];
type AnalyticsDistributionRowDto = components['schemas']['AnalyticsDistributionRowDto'];

type PresetRange = '7' | '30' | '90';

const numberFormatter = new Intl.NumberFormat('it-IT');
const chartDateFormatter = new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: 'short' });

/** Icone/colori deterministici per le etichette di dispositivo note; fallback generico per le altre. */
const DEVICE_PRESETS: Record<string, { color: string; icon: TablerIcon }> = {
  desktop: { color: 'blue.6', icon: IconDeviceDesktop },
  mobile: { color: 'teal.5', icon: IconDeviceMobile },
  tablet: { color: 'orange.5', icon: IconDeviceTablet },
};
const DEVICE_FALLBACK = { color: 'gray.5', icon: IconDeviceUnknown };

/** Calcola `{ from, to }` in UTC per gli ultimi `days` giorni inclusa la data odierna. */
function rangeFromDays(days: number): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - (days - 1));
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

/** Mappa `AnalyticsOverview` sulle 4 card di `AnalyticsStatsGrid`. */
function toStats(overview: AnalyticsOverview | null): AnalyticsStat[] {
  if (!overview) return [];
  const trend = overview.trendPercentage;
  return [
    {
      label: 'Visite totali',
      value: numberFormatter.format(overview.totalViews),
      change: trend ?? 0,
      icon: IconEye,
    },
    {
      label: 'Visitatori unici',
      value: numberFormatter.format(overview.uniqueVisitors),
      change: 0,
      icon: IconUsers,
    },
    {
      label: 'Pagine con traffico',
      value: numberFormatter.format(overview.pagesWithTraffic),
      change: 0,
      icon: IconFiles,
    },
    {
      label: 'Andamento traffico',
      value: trend !== null ? `${trend.toFixed(1)}%` : 'n/d',
      change: trend ?? 0,
      icon: IconChartLine,
    },
  ];
}

/** Mappa i punti della timeseries sulla forma attesa da `AnalyticsTrafficChart`. */
function toTraffic(points: AnalyticsTimeseriesPointDto[]): AnalyticsTrafficPoint[] {
  return points.map((point) => ({
    date: chartDateFormatter.format(new Date(point.bucket)),
    visite: point.views,
    visitatori: point.uniqueVisitors,
  }));
}

/** Mappa le righe top-pages sulla forma attesa da `AnalyticsTopPagesTable`. */
function toTopPages(pages: AnalyticsTopPageDto[]): AnalyticsTopPage[] {
  return pages.map((page) => ({
    path: page.path,
    visits: page.views,
    visitors: page.uniqueVisitors,
    percentage: page.percentage,
  }));
}

/** Mappa le righe di distribuzione dispositivi sulla forma attesa da `AnalyticsDevicesDonut`. */
function toDevices(rows: AnalyticsDistributionRowDto[]): AnalyticsDevice[] {
  return rows.map((row) => {
    const preset = DEVICE_PRESETS[row.label.toLowerCase()] ?? DEVICE_FALLBACK;
    return { name: row.label, value: row.percentage, color: preset.color, icon: preset.icon };
  });
}

/** Skeleton del pannello Analytics durante il caricamento. */
function AnalyticsSkeleton(): JSX.Element {
  return (
    <Stack gap="lg">
      <Group gap="md">
        <Skeleton height={92} radius="md" flex={1} />
        <Skeleton height={92} radius="md" flex={1} />
        <Skeleton height={92} radius="md" flex={1} />
        <Skeleton height={92} radius="md" flex={1} />
      </Group>
      <Skeleton height={340} radius="md" />
      <Group gap="md" align="flex-start">
        <Skeleton height={320} radius="md" flex={2} />
        <Skeleton height={320} radius="md" flex={1} />
      </Group>
    </Stack>
  );
}

/** Pagina dashboard: saluto e pannello Analytics del sito pubblico (riservato ad Admin/SuperAdmin). */
export default function PageDashboard(): JSX.Element {
  const user = useAuthStore((state) => state.user);
  const overview = useAnalyticsStore((state) => state.overview);
  const timeseries = useAnalyticsStore((state) => state.timeseries);
  const topPages = useAnalyticsStore((state) => state.topPages);
  const devices = useAnalyticsStore((state) => state.devices);
  const isLoading = useAnalyticsStore((state) => state.isLoading);
  const error = useAnalyticsStore((state) => state.error);
  const fetchAnalytics = useAnalyticsStore((state) => state.fetchAnalytics);
  const setDateRange = useAnalyticsStore((state) => state.setDateRange);

  const canViewAnalytics = Boolean(user && user.role <= AppUserRoles.Admin);

  useEffect(() => {
    if (!canViewAnalytics) return;
    void fetchAnalytics();
  }, [canViewAnalytics, fetchAnalytics]);

  const handlePresetChange = (value: string) => {
    const days = Number(value as PresetRange);
    const { from, to } = rangeFromDays(days);
    setDateRange(from, to);
  };

  const overviewData: Partial<AnalyticsOverviewData> = {
    stats: toStats(overview),
    traffic: toTraffic(timeseries?.points ?? []),
    topPages: toTopPages(topPages),
    devices: toDevices(devices?.devices ?? []),
  };

  return (
    <Stack gap="lg" data-tour="dashboard-kpi">
      <ContentCard>
        <Group justify="space-between" align="flex-start" wrap="wrap" gap="md">
          <div>
            <Title order={2}>Benvenuto, {user?.name ?? ''}</Title>
            <Text c="dimmed" size="sm" mt={4}>
              Panoramica del traffico del sito pubblicato.
            </Text>
          </div>
          {canViewAnalytics && (
            <SegmentedControl
              size="sm"
              defaultValue="30"
              onChange={handlePresetChange}
              data={[
                { label: '7 giorni', value: '7' },
                { label: '30 giorni', value: '30' },
                { label: '90 giorni', value: '90' },
              ]}
            />
          )}
        </Group>
      </ContentCard>

      {canViewAnalytics && (
        <ContentCard>
          {isLoading ? (
            <AnalyticsSkeleton />
          ) : error ? (
            <Alert
              color="red"
              icon={<IconAlertCircle size={16} />}
              title="Statistiche non disponibili"
            >
              {error}
            </Alert>
          ) : (
            <AnalyticsOverviewPanel data={overviewData} />
          )}
        </ContentCard>
      )}
    </Stack>
  );
}
