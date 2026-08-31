import { DonutChart } from '@mantine/charts';
import { Card, Group, Stack, Text, Title } from '@mantine/core';
import { IconDeviceMobile, IconDeviceTablet, IconDeviceDesktop } from '@tabler/icons-react';
import type { TablerIcon } from '@tabler/icons-react';

export interface AnalyticsDevice {
  name: string;
  value: number;
  color: string;
  icon: TablerIcon;
}

export interface AnalyticsDevicesDonutProps {
  devices?: AnalyticsDevice[];
}

export const MOCK_DEVICES: AnalyticsDevice[] = [
  { name: 'Desktop', value: 54, color: 'blue.6', icon: IconDeviceDesktop },
  { name: 'Mobile', value: 38, color: 'teal.5', icon: IconDeviceMobile },
  { name: 'Tablet', value: 8, color: 'orange.5', icon: IconDeviceTablet },
];

export function AnalyticsDevicesDonut({
  devices = MOCK_DEVICES,
}: AnalyticsDevicesDonutProps): JSX.Element {
  return (
    <Card withBorder padding="lg" radius="md" h="100%">
      <Stack gap="lg">
        <div>
          <Title order={3}>Dispositivi</Title>
          <Text size="sm" c="dimmed">
            Come il pubblico visita il sito
          </Text>
        </div>
        <Group justify="center" align="center" gap="xl" wrap="nowrap">
          <DonutChart data={devices} thickness={22} size={190} withLabelsLine={false} />
          <Stack gap="md">
            {devices.map((device) => {
              const Icon = device.icon;
              return (
                <Group key={device.name} gap="xs" wrap="nowrap">
                  <Icon
                    size={18}
                    color={`var(--mantine-color-${device.color.replace('.', '-')})`}
                    aria-hidden
                  />
                  <div>
                    <Text size="sm" fw={600}>
                      {device.name}
                    </Text>
                    <Text size="xs" c="dimmed">
                      {device.value}% delle visite
                    </Text>
                  </div>
                </Group>
              );
            })}
          </Stack>
        </Group>
      </Stack>
    </Card>
  );
}

export default AnalyticsDevicesDonut;
