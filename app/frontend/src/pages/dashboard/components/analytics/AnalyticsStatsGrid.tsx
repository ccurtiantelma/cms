import { Badge, Card, Grid, Group, Text } from '@mantine/core';
import { IconChartLine, IconEye, IconFiles, IconUsers, type TablerIcon } from '@tabler/icons-react';

export interface AnalyticsStat {
  label: string;
  value: string;
  change: number;
  icon: TablerIcon;
}

export interface AnalyticsStatsGridProps {
  stats?: AnalyticsStat[];
}

export const MOCK_STATS: AnalyticsStat[] = [
  { label: 'Visite totali', value: '48.294', change: 12.5, icon: IconEye },
  { label: 'Visitatori unici', value: '31.847', change: 8.2, icon: IconUsers },
  { label: 'Pagine viste per sessione', value: '3,42', change: 4.7, icon: IconFiles },
  { label: 'Frequenza di rimbalzo', value: '38,6%', change: -3.2, icon: IconChartLine },
];

export function AnalyticsStatsGrid({ stats = MOCK_STATS }: AnalyticsStatsGridProps): JSX.Element {
  return (
    <Grid>
      {stats.slice(0, 4).map((stat) => {
        const Icon = stat.icon;
        const isPositive = stat.change >= 0;
        return (
          <Grid.Col key={stat.label} span={{ base: 12, xs: 6, lg: 3 }}>
            <Card withBorder padding="lg" radius="md" h="100%">
              <Group justify="space-between" align="flex-start" mb="lg">
                <Text size="sm" c="dimmed" fw={600}>
                  {stat.label}
                </Text>
                <Icon size={20} stroke={1.7} color="var(--mantine-color-blue-6)" aria-hidden />
              </Group>
              <Group justify="space-between" align="flex-end" gap="xs">
                <Text fz={28} fw={700} lh={1}>
                  {stat.value}
                </Text>
                <Badge color={isPositive ? 'teal' : 'red'} variant="light" size="sm">
                  {isPositive ? '+' : ''}
                  {stat.change.toFixed(1)}%
                </Badge>
              </Group>
              <Text size="xs" c="dimmed" mt="sm">
                rispetto al periodo precedente
              </Text>
            </Card>
          </Grid.Col>
        );
      })}
    </Grid>
  );
}

export default AnalyticsStatsGrid;
