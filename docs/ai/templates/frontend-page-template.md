# Template — Pagina Frontend Mantine

> Usa questo template per creare nuove pagine frontend.
> Regola base: Mantine out-of-the-box, senza wrapper custom e senza personalizzazione inline dei componenti Mantine.
> `mantine-datatable` è opzionale per tabelle complesse (nuova dipendenza → richiede approvazione, vedi CLAUDE.md → "Ask first").

---

## Service layer (OBBLIGATORIO)

> ⚠️ Le chiamate API non vanno mai nei componenti React. Ogni modulo deve avere il proprio service file.

```typescript
// src/services/[nome].service.ts

import api from './api';
import type { [Nome], [Nome]CreateDto, [Nome]UpdateDto } from '../types/[sezione].types';
import type { Pagination } from '../types/common.types';

export async function get[Nome]List(params: {
  p: number;
  i: number;
  q?: string;
}): Promise<Pagination<[Nome]>> {
  const { data } = await api.get<Pagination<[Nome]>>('/app/[nome]', { params });
  return data;
}

export async function get[Nome]ByGuid(guid: string): Promise<[Nome]> {
  const { data } = await api.get<[Nome]>(`/app/[nome]/${guid}`);
  return data;
}

export async function create[Nome](dto: [Nome]CreateDto): Promise<[Nome]> {
  const { data } = await api.post<[Nome]>('/app/[nome]', dto);
  return data;
}

export async function update[Nome](guid: string, dto: [Nome]UpdateDto): Promise<[Nome]> {
  const { data } = await api.patch<[Nome]>(`/app/[nome]/${guid}`, dto);
  return data;
}

export async function deactivate[Nome](guid: string): Promise<void> {
  await api.delete(`/app/[nome]/${guid}`); // soft delete lato backend, mai DELETE fisico
}
```

---

## Tipi (OBBLIGATORIO)

> ⚠️ I tipi corrispondenti a entità DB vanno definiti qui e NON duplicati inline nei componenti.
> Se disponibili, preferire i tipi generati da OpenAPI in `src/types/api.types.ts`.

```typescript
// src/types/[sezione].types.ts

export interface [Nome] {
  guid: string;
  [campoPrincipale]: string;
  [campoSecondario]: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface [Nome]CreateDto {
  [campoPrincipale]: string;
  [campoSecondario]?: string;
}

export interface [Nome]UpdateDto {
  [campoPrincipale]?: string;
  [campoSecondario]?: string;
}
```

---

## Lista con tabella

```typescript
// src/pages/[sezione]/Page[Nome]List.tsx

import { useEffect, useState } from 'react';
import { Button, Group, TextInput } from '@mantine/core';
import { DataTable } from 'mantine-datatable';
import { notifications } from '@mantine/notifications';
import { IconPlus, IconSearch } from '@tabler/icons-react';
import { useNavigate } from 'react-router-dom';
import type { AxiosError } from 'axios';
import { get[Nome]List } from '../../services/[nome].service';
import type { [Nome] } from '../../types/[sezione].types';

export default function Page[Nome]List() {
  const navigate = useNavigate();
  const [records, setRecords] = useState<[Nome][]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void load();
  }, [page, limit, search]);

  async function load() {
    setLoading(true);
    try {
      const result = await get[Nome]List({ p: page, i: limit, q: search || undefined });
      setRecords(result.items);
      setTotal(result.totalItems);
    } catch (err) {
      const error = err as AxiosError<{ message?: string }>;
      notifications.show({
        color: 'red',
        message: error.response?.data?.message ?? 'Errore nel caricamento',
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Group justify="space-between" mb="md">
        <TextInput
          leftSection={<IconSearch size={16} />}
          placeholder="Cerca..."
          value={search}
          onChange={(e) => {
            setSearch(e.currentTarget.value);
            setPage(1);
          }}
        />

        <Button leftSection={<IconPlus size={16} />} onClick={() => navigate('/[percorso]/nuovo')}>
          Nuovo
        </Button>
      </Group>

      <DataTable
        records={records}
        fetching={loading}
        totalRecords={total}
        recordsPerPage={limit}
        page={page}
        onPageChange={setPage}
        onRecordsPerPageChange={(value) => {
          setLimit(value);
          setPage(1);
        }}
        recordsPerPageOptions={[10, 20, 50]}
        columns={[
          { accessor: '[campoPrincipale]', title: '[Campo Principale]' },
          { accessor: '[campoSecondario]', title: '[Campo Secondario]' },
          {
            accessor: 'azioni',
            title: 'Azioni',
            render: (row) => (
              <Button variant="subtle" onClick={() => navigate(`/[percorso]/${row.guid}`)}>
                Dettaglio
              </Button>
            )
          }
        ]}
      />
    </>
  );
}
```

---

## Dettaglio

```typescript
// src/pages/[sezione]/Page[Nome]Detail.tsx

import { useEffect, useState } from 'react';
import { Button, Card, Drawer, Group, Loader, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconEdit } from '@tabler/icons-react';
import { useNavigate, useParams } from 'react-router-dom';
import type { AxiosError } from 'axios';
import { get[Nome]ByGuid } from '../../services/[nome].service';
import type { [Nome] } from '../../types/[sezione].types';
import Form[Nome] from './Form[Nome]';

export default function Page[Nome]Detail() {
  const { guid } = useParams<{ guid: string }>();
  const navigate = useNavigate();
  const [item, setItem] = useState<[Nome] | null>(null);
  const [loading, setLoading] = useState(true);
  const [opened, setOpened] = useState(false);

  useEffect(() => {
    void load();
  }, [guid]);

  async function load() {
    setLoading(true);
    try {
      const result = await get[Nome]ByGuid(guid!);
      setItem(result);
    } catch (err) {
      const error = err as AxiosError<{ message?: string }>;
      notifications.show({
        color: 'red',
        message: error.response?.data?.message ?? 'Elemento non trovato',
      });
      navigate(-1);
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <Loader />;
  if (!item) return null;

  return (
    <>
      <Group justify="space-between" mb="md">
        <Text fw={700}>{item.[campoPrincipale]}</Text>
        <Button leftSection={<IconEdit size={16} />} onClick={() => setOpened(true)}>
          Modifica
        </Button>
      </Group>

      <Card withBorder>
        <Text>[Campo 1]: {item.[campo1]}</Text>
        <Text>[Campo 2]: {item.[campo2]}</Text>
      </Card>

      <Drawer opened={opened} onClose={() => setOpened(false)} title="Modifica [Nome]" position="right">
        <Form[Nome]
          initial={item}
          onSave={() => {
            setOpened(false);
            void load();
          }}
          onCancel={() => setOpened(false)}
        />
      </Drawer>
    </>
  );
}
```

---

## Form entità

```typescript
// src/pages/[sezione]/Form[Nome].tsx

import { Button, Group, Select, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import type { AxiosError } from 'axios';
import { create[Nome], update[Nome] } from '../../services/[nome].service';
import type { [Nome] } from '../../types/[sezione].types';

interface Props {
  initial?: Partial<[Nome]>;
  onSave: () => void;
  onCancel: () => void;
}

interface FormValues {
  [campoPrincipale]: string;
  [campoFk]: string;
}

export default function Form[Nome]({ initial, onSave, onCancel }: Props) {
  const form = useForm<FormValues>({
    initialValues: {
      [campoPrincipale]: initial?.[campoPrincipale] ?? '',
      [campoFk]: initial?.[campoFk]?.toString() ?? ''
    },
    validate: {
      [campoPrincipale]: (value) =>
        value.trim().length === 0 ? 'Campo obbligatorio' : null,
      [campoFk]: (value) =>
        value.trim().length === 0 ? 'Campo obbligatorio' : null
    }
  });

  async function handleSubmit(values: FormValues) {
    try {
      if (initial?.guid) {
        await update[Nome](initial.guid, values);
      } else {
        await create[Nome](values);
      }
      notifications.show({ color: 'green', message: 'Salvato con successo' });
      onSave();
    } catch (err) {
      const error = err as AxiosError<{ message?: string }>;
      notifications.show({
        color: 'red',
        message: error.response?.data?.message ?? 'Errore durante il salvataggio',
      });
    }
  }

  return (
    <form onSubmit={form.onSubmit(handleSubmit)}>
      <TextInput
        label="[Label Campo]"
        withAsterisk
        {...form.getInputProps('[campoPrincipale]')}
      />

      <Select
        mt="sm"
        label="[Label FK]"
        withAsterisk
        data={[{ value: '1', label: 'Opzione 1' }, { value: '2', label: 'Opzione 2' }]}
        {...form.getInputProps('[campoFk]')}
      />

      <Group justify="flex-end" mt="md">
        <Button variant="default" onClick={onCancel}>Annulla</Button>
        <Button type="submit">Salva</Button>
      </Group>
    </form>
  );
}
```

---

## Convenzioni obbligatorie frontend

| Aspetto          | Regola                                                                                  |
| ---------------- | --------------------------------------------------------------------------------------- |
| Notifiche        | Solo `notifications.show(...)` di Mantine                                               |
| Conferme         | `Modal` o `Drawer` Mantine, mai `window.confirm()`                                      |
| Form             | Solo `@mantine/form` (`useForm`) con tipo esplicito `useForm<FormValues>`               |
| Tabelle          | Preferire Mantine; usare `mantine-datatable` solo se necessario                         |
| Navigazione      | Solo `useNavigate()`                                                                    |
| API              | Solo tramite `src/services/<modulo>.service.ts` — mai `api` direttamente nei componenti |
| Tipi             | Definiti in `src/types/<modulo>.types.ts` — mai duplicati inline                        |
| Stili            | CSS Modules (`*.module.css`) + props native Mantine — no stili inline invasivi          |
| Wrapper          | Vietato creare wrapper custom attorno ai componenti Mantine                             |
| Errori async     | `const error = err as AxiosError<{ message?: string }>` — mai `any` non commentato      |
| ID nelle URL     | Usare sempre `guid` (mai l'ID numerico sequenziale)                                     |
| Soft delete      | Usare `isActive: false` tramite il service — mai DELETE fisici                          |

---

## Policy MCP Mantine (assistiva)

- Usare MCP Mantine per velocizzare implementazione e ridurre errori su props/API.
- MCP non è fonte unica: prevalgono sempre `constitution.md` e `specs/`.
- In caso di dubbio: `constitution/spec` → MCP → docs ufficiali.
