/**
 * Demo dal vivo dell'Editor tema (ADR-4 v2): per ogni sezione renderizza i
 * componenti Mantine REALI senza props espliciti dove possibile, così i
 * `defaultProps` applicati dal `ThemeConfig` (variant, size, radius, ombre…)
 * si riflettono immediatamente nell'anteprima. I colori per-scheme usano i
 * token del config sullo scheme in modifica.
 */
import { useState, type ReactNode } from 'react';
import {
  ActionIcon,
  Badge,
  Button,
  Code,
  ColorSwatch,
  Group,
  Loader,
  Modal,
  NumberInput,
  Paper,
  PasswordInput,
  ScrollArea,
  Select,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
  Title,
  Tooltip,
} from '@mantine/core';
import { IconLogin, IconPencil, IconSettings, IconShieldOff } from '@tabler/icons-react';
import ColumnSelector from '../ColumnSelector';
import ContentCard from '../ContentCard';
import ListToolbar from '../ListToolbar';
import RowActionIcon from '../RowActionIcon';
import type { ResponsiveTableColumn } from '../ResponsiveTable';
import { useColumnVisibility } from '../../hooks/useColumnVisibility';
import type { ThemeEditorSection } from '../../config/themeEditorSections';
import { generatePrimaryShades, THEME_SIZE_VALUES, type ThemeConfig } from '../../theme';
import classes from './ThemeEditorDemos.module.css';

/** Riga di esempio della demo "Tabelle" — stessa forma della tabella Utenti reale. */
interface TableDemoRow {
  name: string;
  surname: string;
  email: string;
  role: string;
  roleColor: string;
  scope: string;
  active: boolean;
}

/** Righe di esempio per la demo delle tabelle — stessa forma della tabella Utenti reale. */
const TABLE_DEMO_ROWS: TableDemoRow[] = [
  {
    name: 'Mario',
    surname: 'Rossi',
    email: 'mario.rossi@example.com',
    role: 'Admin',
    roleColor: 'starterPrimary',
    scope: 'Milano',
    active: true,
  },
  {
    name: 'Anna',
    surname: 'Bianchi',
    email: 'anna.bianchi@example.com',
    role: 'Manager',
    roleColor: 'cyan',
    scope: 'Torino',
    active: true,
  },
  {
    name: 'Luca',
    surname: 'Verdi',
    email: 'luca.verdi@example.com',
    role: 'User',
    roleColor: 'green',
    scope: '—',
    active: false,
  },
];

/** Colonne di esempio (per il selettore colonne) — stesse etichette della tabella Utenti reale. */
const TABLE_DEMO_COLUMNS: ResponsiveTableColumn<TableDemoRow>[] = [
  { key: 'name', label: 'Nome' },
  { key: 'surname', label: 'Cognome' },
  { key: 'email', label: 'Email' },
  {
    key: 'role',
    label: 'Ruolo',
    render: (row) => <Badge color={row.roleColor}>{row.role}</Badge>,
  },
  { key: 'scope', label: 'Ambito' },
  {
    key: 'active',
    label: 'Attivo',
    render: (row) => <Switch defaultChecked={row.active} aria-label="Attivo" />,
  },
];

/** Chiave `localStorage` del selettore colonne della demo — distinta da quella della pagina Utenti reale. */
const TABLE_DEMO_COLUMNS_STORAGE_KEY = 'app.columns.themeEditorDemo';

/** Tupla di 10 sfumature attualmente attiva come palette primaria. */
function activePaletteShades(config: ThemeConfig): readonly string[] {
  return generatePrimaryShades(config.colors.primary);
}

/** Demo "Generale": palette attiva, bottoni nelle variant principali, badge. */
function DemoPrimary({ config }: { config: ThemeConfig }): JSX.Element {
  return (
    <Stack gap="md">
      <Group gap={4}>
        {activePaletteShades(config).map((shade, index) => (
          <ColorSwatch key={`${shade}-${index}`} color={shade} size={22} radius="sm" />
        ))}
      </Group>
      <Group gap="sm">
        <Button>Primario</Button>
        <Button variant="light">Light</Button>
        <Button variant="outline">Outline</Button>
        <Button variant="gradient">Gradiente</Button>
        <Badge size="lg">Badge</Badge>
      </Group>
    </Stack>
  );
}

/** Demo "Tipografia": titoli h1–h6, corpi testo alle 5 dimensioni, monospace. */
function DemoTypography({
  config,
  scheme,
}: {
  config: ThemeConfig;
  scheme: 'light' | 'dark';
}): JSX.Element {
  const textColor = { color: config[scheme].textPrimary };
  return (
    <Stack gap="xs">
      {([1, 2, 3, 4, 5, 6] as const).map((order) => (
        <Title key={order} order={order} style={textColor}>
          Titolo H{order}
        </Title>
      ))}
      {THEME_SIZE_VALUES.map((size) => (
        <Text key={size} size={size} style={textColor}>
          Testo {size} — Lorem ipsum dolor sit amet, consectetur adipiscing elit.
        </Text>
      ))}
      <Code block>npm run dev — esempio di testo monospace</Code>
    </Stack>
  );
}

/** Demo "Dimensioni e ombre": ombre xs–xl, radius token, barre della scala di spaziatura. */
function DemoScales(): JSX.Element {
  return (
    <Stack gap="lg">
      <Group gap="lg" align="flex-end">
        {THEME_SIZE_VALUES.map((size) => (
          <Paper key={size} shadow={size} p="md" radius="md" className={classes.shadowSample}>
            <Text size="xs" c="dimmed" ta="center">
              {size}
            </Text>
          </Paper>
        ))}
      </Group>
      <Group gap="lg" align="flex-end">
        {THEME_SIZE_VALUES.map((size) => (
          <Paper key={size} radius={size} withBorder p="md" className={classes.shadowSample}>
            <Text size="xs" c="dimmed" ta="center">
              {size}
            </Text>
          </Paper>
        ))}
      </Group>
      <Stack gap={6}>
        {THEME_SIZE_VALUES.map((size) => (
          <Group key={size} gap="sm" wrap="nowrap">
            <Text size="xs" c="dimmed" className={classes.scaleLabel}>
              {size}
            </Text>
            <div
              className={classes.spacingBar}
              style={{ width: `calc(var(--mantine-spacing-${size}) * 4)` }}
            />
          </Group>
        ))}
      </Stack>
    </Stack>
  );
}

/** Demo "Bottoni e badge": componenti senza props espliciti → mostrano i default del tema. */
function DemoButtons(): JSX.Element {
  return (
    <Stack gap="md">
      <Group gap="sm">
        <Button>Bottone default</Button>
        <Button leftSection={<IconSettings size={16} />}>Con icona</Button>
        <Button disabled>Disabilitato</Button>
      </Group>
      <Group gap="sm">
        <ActionIcon aria-label="Azione di esempio">
          <IconSettings size={18} />
        </ActionIcon>
        <Badge>Badge default</Badge>
        <Badge color="green">Attivo</Badge>
        <Badge color="red">Sospeso</Badge>
      </Group>
    </Stack>
  );
}

/** Demo "Campi input": campi senza props espliciti → mostrano i default del tema. */
function DemoInputs(): JSX.Element {
  return (
    <Stack gap="sm" className={classes.inputsDemo}>
      <TextInput label="Nome" placeholder="Mario Rossi" />
      <PasswordInput label="Password" placeholder="La tua password" />
      <Select
        label="Ruolo"
        placeholder="Seleziona un ruolo"
        data={['SuperAdmin', 'Admin', 'Manager', 'User']}
      />
      <NumberInput label="Quantità" placeholder="10" />
    </Stack>
  );
}

/** Demo "Card": una vera ContentCard (token per-scheme) + una Paper con i default del tema. */
function DemoCard(): JSX.Element {
  return (
    <Group gap="lg" align="stretch">
      <ContentCard className={classes.demoCard}>
        <Text fw={600} mb={4}>
          ContentCard
        </Text>
        <Text size="sm" c="dimmed">
          Sfondo e bordo riflettono i token correnti della sezione.
        </Text>
      </ContentCard>
      <Paper p="md" className={classes.demoCard}>
        <Text fw={600} mb={4}>
          Paper
        </Text>
        <Text size="sm" c="dimmed">
          Ombra, radius, bordo e padding seguono i default componente.
        </Text>
      </Paper>
    </Group>
  );
}

/** Colore per singolo livello di titolo (token `headingH1`–`headingH6`), indicizzato per `order`. */
const HEADING_TOKEN_BY_ORDER = {
  1: 'headingH1',
  2: 'headingH2',
  3: 'headingH3',
  4: 'headingH4',
  5: 'headingH5',
  6: 'headingH6',
} as const;

/**
 * Demo "Testi": gerarchia completa dei titoli h1–h6, ciascuno col proprio
 * colore (token `headingH1`–`headingH6`, non più tutti uguali a `textPrimary`),
 * più testo principale e secondario.
 */
function DemoText({
  config,
  scheme,
}: {
  config: ThemeConfig;
  scheme: 'light' | 'dark';
}): JSX.Element {
  const primary = { color: config[scheme].textPrimary };
  return (
    <Stack gap="xs">
      {([1, 2, 3, 4, 5, 6] as const).map((order) => (
        <Title
          key={order}
          order={order}
          style={{ color: config[scheme][HEADING_TOKEN_BY_ORDER[order]] }}
        >
          Titolo H{order}
        </Title>
      ))}
      <Text size="lg" fw={600} style={primary} mt="sm">
        Testo principale di esempio, un po&apos; più grande per un confronto più leggibile.
      </Text>
      <Text size="lg" style={{ color: config[scheme].textSecondary }}>
        Testo secondario di esempio.
      </Text>
    </Stack>
  );
}

/**
 * Demo "Tabelle": non la sola `<Table>`, ma l'intero contorno con cui compare
 * nelle pagine elenco reali (es. Utenti) — `ContentCard` + `ListToolbar`
 * (paginazione, righe/pagina, ricerca, totale risultati, selettore colonne,
 * pulsante "Nuovo") sopra la tabella, badge ruolo, switch attivo, icone
 * azione. Componenti Mantine REALI: toolbar e card riflettono già i token
 * delle sezioni "Bottoni e badge"/"Campi input"/"Card", oltre ai controlli
 * dedicati di questa sezione (righe alternate, hover, bordi, spaziatura).
 * Stato locale non persistito lato server: solo per l'anteprima.
 */
function DemoTable(): JSX.Element {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [search, setSearch] = useState('');
  const { visibleColumns, isVisible, toggle } = useColumnVisibility(
    TABLE_DEMO_COLUMNS_STORAGE_KEY,
    TABLE_DEMO_COLUMNS,
  );

  return (
    <ContentCard>
      <ListToolbar
        state={{
          page,
          setPage,
          totalPages: 1,
          limit,
          setLimit,
          total: TABLE_DEMO_ROWS.length,
          search,
          setSearch,
        }}
        newLabel="Nuovo Utente"
        onNew={() => {}}
        columnSelector={
          <ColumnSelector columns={TABLE_DEMO_COLUMNS} isVisible={isVisible} onToggle={toggle} />
        }
      />
      <ScrollArea offsetScrollbars type="auto">
        <Table miw={640}>
          <Table.Thead>
            <Table.Tr>
              {visibleColumns.map((column) => (
                <Table.Th key={String(column.key)}>{column.label}</Table.Th>
              ))}
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {TABLE_DEMO_ROWS.map((row) => (
              <Table.Tr key={row.email}>
                {visibleColumns.map((column) => (
                  <Table.Td key={String(column.key)}>
                    {column.render ? column.render(row) : String(row[column.key])}
                  </Table.Td>
                ))}
                <Table.Td>
                  <Group gap={4} wrap="nowrap" justify="flex-end">
                    <RowActionIcon
                      label="Modifica"
                      icon={<IconPencil size={16} />}
                      onClick={() => {}}
                    />
                    <RowActionIcon
                      label="Reset MFA"
                      color="orange"
                      icon={<IconShieldOff size={16} />}
                      onClick={() => {}}
                    />
                    <RowActionIcon
                      label="Accedi come"
                      color="starterPrimary"
                      icon={<IconLogin size={16} />}
                      onClick={() => {}}
                    />
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </ScrollArea>
    </ContentCard>
  );
}

/** Demo "Modali e overlay": modale reale apribile, tooltip e loader con i default del tema. */
function DemoOverlays(): JSX.Element {
  const [opened, setOpened] = useState(false);
  return (
    <Stack gap="md">
      <Group gap="sm">
        <Button variant="light" onClick={() => setOpened(true)}>
          Apri modale demo
        </Button>
        <Tooltip label="Tooltip di esempio">
          <Button variant="default">Passa qui sopra</Button>
        </Tooltip>
        <Loader />
      </Group>
      <Modal opened={opened} onClose={() => setOpened(false)} title="Modale demo">
        <Text size="sm">
          Radius, ombra, padding e blur dell&apos;overlay seguono i default componente del tema.
        </Text>
        <Group justify="flex-end" mt="md">
          <Button onClick={() => setOpened(false)}>Chiudi</Button>
        </Group>
      </Modal>
    </Stack>
  );
}

interface ThemeEditorSectionDemoProps {
  /** Sezione da renderizzare (da `THEME_EDITOR_SECTIONS`). */
  section: ThemeEditorSection;
  /** Config tema corrente (draft live). */
  config: ThemeConfig;
  /** Scheme in modifica per i token per-scheme. */
  scheme: 'light' | 'dark';
}

/** Demo dal vivo del componente reale associato alla sezione (non un'icona). */
export function ThemeEditorSectionDemo({
  section,
  config,
  scheme,
}: ThemeEditorSectionDemoProps): ReactNode {
  switch (section.key) {
    case 'primary':
      return <DemoPrimary config={config} />;
    case 'typography':
      return <DemoTypography config={config} scheme={scheme} />;
    case 'scales':
      return <DemoScales />;
    case 'buttons':
      return <DemoButtons />;
    case 'inputs':
      return <DemoInputs />;
    case 'card':
      return <DemoCard />;
    case 'text':
      return <DemoText config={config} scheme={scheme} />;
    // 'navbar': nessuna demo nella colonna centrale — la sidebar reale, con gli
    // stessi token applicati live, è già visibile a fianco (LayoutProtected).
    case 'table':
      return <DemoTable />;
    case 'overlays':
      return <DemoOverlays />;
    default:
      return null;
  }
}
