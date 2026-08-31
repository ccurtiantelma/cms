import { Progress, Table, Text } from '@mantine/core';

export interface AnalyticsTopPage {
  path: string;
  visits: number;
  visitors: number;
  percentage: number;
}

export interface AnalyticsTopPagesTableProps {
  pages?: AnalyticsTopPage[];
}

export const MOCK_TOP_PAGES: AnalyticsTopPage[] = [
  { path: '/', visits: 12480, visitors: 8742, percentage: 25.8 },
  { path: '/servizi', visits: 8360, visitors: 5920, percentage: 17.3 },
  { path: '/chi-siamo', visits: 6210, visitors: 4785, percentage: 12.9 },
  { path: '/blog/strategie-digitali-2025', visits: 4850, visitors: 3862, percentage: 10.0 },
  { path: '/contatti', visits: 3940, visitors: 3184, percentage: 8.2 },
  { path: '/servizi/web-design', visits: 3280, visitors: 2490, percentage: 6.8 },
  { path: '/blog/guida-seo', visits: 2860, visitors: 2248, percentage: 5.9 },
  { path: '/portfolio', visits: 2410, visitors: 1876, percentage: 5.0 },
  { path: '/faq', visits: 1890, visitors: 1540, percentage: 3.9 },
  { path: '/risorse', visits: 1450, visitors: 1210, percentage: 3.0 },
];

const numberFormatter = new Intl.NumberFormat('it-IT');

export function AnalyticsTopPagesTable({
  pages = MOCK_TOP_PAGES,
}: AnalyticsTopPagesTableProps): JSX.Element {
  return (
    <div style={{ overflowX: 'auto' }}>
      <Table horizontalSpacing="md" verticalSpacing="sm" highlightOnHover miw={620}>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Percorso URL</Table.Th>
            <Table.Th ta="right">Visite totali</Table.Th>
            <Table.Th ta="right">Visitatori unici</Table.Th>
            <Table.Th w={170}>Percentuale sul totale</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {pages.slice(0, 10).map((page) => (
            <Table.Tr key={page.path}>
              <Table.Td>
                <Text size="sm" fw={600} truncate maw={280}>
                  {page.path}
                </Text>
              </Table.Td>
              <Table.Td ta="right">
                <Text size="sm">{numberFormatter.format(page.visits)}</Text>
              </Table.Td>
              <Table.Td ta="right">
                <Text size="sm">{numberFormatter.format(page.visitors)}</Text>
              </Table.Td>
              <Table.Td>
                <Text size="xs" c="dimmed" mb={4}>
                  {page.percentage.toFixed(1)}%
                </Text>
                <Progress value={page.percentage} size="xs" color="blue" />
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </div>
  );
}

export default AnalyticsTopPagesTable;
