import { Card, Grid, Group, Stack, Text, Title } from '@mantine/core';
import { IconChartHistogram } from '@tabler/icons-react';
import AnalyticsDevicesDonut, { MOCK_DEVICES } from './AnalyticsDevicesDonut';
import type { AnalyticsDevice } from './AnalyticsDevicesDonut';
import AnalyticsStatsGrid, { MOCK_STATS } from './AnalyticsStatsGrid';
import type { AnalyticsStat } from './AnalyticsStatsGrid';
import AnalyticsTopPagesTable, { MOCK_TOP_PAGES } from './AnalyticsTopPagesTable';
import type { AnalyticsTopPage } from './AnalyticsTopPagesTable';
import AnalyticsTrafficChart, { MOCK_TRAFFIC } from './AnalyticsTrafficChart';
import type { AnalyticsTrafficPoint } from './AnalyticsTrafficChart';

export interface AnalyticsOverviewData {
  stats: AnalyticsStat[];
  traffic: AnalyticsTrafficPoint[];
  topPages: AnalyticsTopPage[];
  devices: AnalyticsDevice[];
}

export interface AnalyticsOverviewPanelProps {
  data?: Partial<AnalyticsOverviewData>;
}

export const MOCK_ANALYTICS_OVERVIEW: AnalyticsOverviewData = {
  stats: MOCK_STATS,
  traffic: MOCK_TRAFFIC,
  topPages: MOCK_TOP_PAGES,
  devices: MOCK_DEVICES,
};

export function AnalyticsOverviewPanel({ data }: AnalyticsOverviewPanelProps): JSX.Element {
  const overview = { ...MOCK_ANALYTICS_OVERVIEW, ...data };
  return (
    <Stack gap="lg">
      <Group gap="sm">
        <IconChartHistogram size={24} color="var(--mantine-color-blue-6)" aria-hidden />
        <div>
          <Title order={2}>Analytics</Title>
          <Text c="dimmed" size="sm">
            Panoramica delle prestazioni del sito
          </Text>
        </div>
      </Group>
      <AnalyticsStatsGrid stats={overview.stats} />
      <AnalyticsTrafficChart data={overview.traffic.length > 0 ? overview.traffic : undefined} />
      <Grid>
        <Grid.Col span={{ base: 12, lg: 8 }}>
          <Card withBorder padding="lg" radius="md" h="100%">
            <Stack gap="lg">
              <div>
                <Title order={3}>Pagine più viste</Title>
                <Text size="sm" c="dimmed">
                  Le pagine che generano più traffico
                </Text>
              </div>
              <AnalyticsTopPagesTable
                pages={overview.topPages.length > 0 ? overview.topPages : undefined}
              />
            </Stack>
          </Card>
        </Grid.Col>
        <Grid.Col span={{ base: 12, lg: 4 }}>
          <AnalyticsDevicesDonut
            devices={overview.devices.length > 0 ? overview.devices : undefined}
          />
        </Grid.Col>
      </Grid>
    </Stack>
  );
}

export default AnalyticsOverviewPanel;
