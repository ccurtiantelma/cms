import { AreaChart } from '@mantine/charts';
import { Card, Group, SegmentedControl, Stack, Text, Title } from '@mantine/core';
import { IconActivity } from '@tabler/icons-react';
import { useState } from 'react';

export type AnalyticsTrafficRange = 'oggi' | '7 giorni' | '30 giorni';

export interface AnalyticsTrafficPoint {
  date: string;
  visite: number;
  visitatori: number;
}

export interface AnalyticsTrafficChartProps {
  data?: AnalyticsTrafficPoint[];
  range?: AnalyticsTrafficRange;
  onRangeChange?: (range: AnalyticsTrafficRange) => void;
}

export const MOCK_TRAFFIC: AnalyticsTrafficPoint[] = [
  { date: '02 ago', visite: 1260, visitatori: 824 },
  { date: '04 ago', visite: 1480, visitatori: 936 },
  { date: '06 ago', visite: 1325, visitatori: 891 },
  { date: '08 ago', visite: 1890, visitatori: 1204 },
  { date: '10 ago', visite: 1760, visitatori: 1132 },
  { date: '12 ago', visite: 2240, visitatori: 1485 },
  { date: '14 ago', visite: 2485, visitatori: 1620 },
  { date: '16 ago', visite: 2310, visitatori: 1548 },
  { date: '18 ago', visite: 2780, visitatori: 1842 },
  { date: '20 ago', visite: 2640, visitatori: 1755 },
  { date: '22 ago', visite: 3120, visitatori: 2068 },
  { date: '24 ago', visite: 2980, visitatori: 1984 },
  { date: '26 ago', visite: 3540, visitatori: 2376 },
  { date: '28 ago', visite: 3420, visitatori: 2290 },
  { date: '30 ago', visite: 3890, visitatori: 2644 },
];

export function AnalyticsTrafficChart({
  data = MOCK_TRAFFIC,
  range: controlledRange,
  onRangeChange,
}: AnalyticsTrafficChartProps): JSX.Element {
  const [internalRange, setInternalRange] = useState<AnalyticsTrafficRange>('30 giorni');
  const range = controlledRange ?? internalRange;

  const handleRangeChange = (value: string) => {
    const nextRange = value as AnalyticsTrafficRange;
    setInternalRange(nextRange);
    onRangeChange?.(nextRange);
  };

  const chartData =
    range === 'oggi' ? data.slice(-1) : range === '7 giorni' ? data.slice(-7) : data;

  return (
    <Card withBorder padding="lg" radius="md">
      <Stack gap="lg">
        <Group justify="space-between" align="flex-start" gap="md">
          <Group gap="sm">
            <IconActivity size={22} color="var(--mantine-color-blue-6)" aria-hidden />
            <div>
              <Title order={3}>Andamento del traffico</Title>
              <Text size="sm" c="dimmed">
                Visite e visitatori nel tempo
              </Text>
            </div>
          </Group>
          <SegmentedControl
            size="xs"
            value={range}
            onChange={handleRangeChange}
            data={['oggi', '7 giorni', '30 giorni']}
          />
        </Group>
        <AreaChart
          h={300}
          data={chartData}
          dataKey="date"
          series={[
            { name: 'visite', label: 'Visite totali', color: 'blue.6' },
            { name: 'visitatori', label: 'Visitatori unici', color: 'teal.6' },
          ]}
          curveType="monotone"
          tickLine="y"
          gridAxis="xy"
          withGradient
          withDots={false}
          withLegend
          valueFormatter={(value) => value.toLocaleString('it-IT')}
        />
      </Stack>
    </Card>
  );
}

export default AnalyticsTrafficChart;
