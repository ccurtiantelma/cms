/**
 * Drawer Crea/Modifica/Visualizza di un ruolo (SPEC-RBAC-F2b § Drawer ruolo, S35). Esegue le
 * scritture e traduce gli errori di dominio; la pagina ricarica lista, catalogo e permessi.
 */
import { useEffect, useState } from 'react';
import { Alert, Button, Center, Loader, Stack, Text, TextInput, Textarea } from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { IconAlertTriangle } from '@tabler/icons-react';
import FormDrawer from '../../components/FormDrawer';
import PermissionMatrix from './PermissionMatrix';
import { createRole, updateRole } from '../../services/roles.service';
import { getErrorCode } from '../../utils/api.utils';
import { roleErrorMessage } from '../../utils/roles-errors.utils';
import type { PermissionGroup, RoleRecord, UpdateRolePayload } from '../../types/roles.types';

/** Modalità del drawer: `view` per i ruoli di sistema o per chi non ha `roles:manage` (S32). */
export type RoleDrawerMode = 'create' | 'edit' | 'view';

/** Stesso pattern di `ROLE_CODE_PATTERN` del backend. Solo UX: il backend lo riverifica. */
const ROLE_CODE_PATTERN = /^[a-z][a-z0-9_]{2,49}$/;
const NAME_MAX = 100;
const DESCRIPTION_MAX = 500;

interface RoleFormValues {
  code: string;
  name: string;
  description: string;
  permissionCodes: string[];
}

function roleToFormValues(role: RoleRecord | null): RoleFormValues {
  return {
    code: role?.code ?? '',
    name: role?.name ?? '',
    description: role?.description ?? '',
    permissionCodes: role ? [...role.permissions] : [],
  };
}

/** Descrizione normalizzata: stringa vuota → `null`. */
function normalizeDescription(value: string): string | null {
  return value.trim() || null;
}

function sameCodes(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((code) => b.includes(code));
}

/**
 * Campi cambiati rispetto al ruolo originale: il `PATCH` invia solo questi e mai `code` (S35).
 * @returns Il payload, vuoto se non è cambiato nulla.
 */
function diffRole(role: RoleRecord, values: RoleFormValues): UpdateRolePayload {
  const payload: UpdateRolePayload = {};
  const name = values.name.trim();
  const description = normalizeDescription(values.description);
  if (name !== role.name) payload.name = name;
  if (description !== role.description) payload.description = description;
  if (!sameCodes(values.permissionCodes, role.permissions)) {
    payload.permissionCodes = values.permissionCodes;
  }
  return payload;
}

interface RoleFormDrawerProps {
  opened: boolean;
  mode: RoleDrawerMode;
  /** Ruolo di partenza; `null` in creazione. */
  role: RoleRecord | null;
  /** Catalogo dei permessi; `null` finché non è caricato. */
  catalog: PermissionGroup[] | null;
  /** Caricamento del catalogo fallito: mostra un avviso con "Riprova". */
  catalogError: boolean;
  /** Permessi effettivi del chiamante, per l'anti-escalation della matrice. */
  callerPermissions: readonly string[];
  onClose: () => void;
  /** Scrittura riuscita: la pagina chiude il drawer, ricarica la lista e i permessi. */
  onSaved: () => void;
  /** Ruolo non più esistente (`404`): la pagina chiude il drawer e ricarica la lista. */
  onRoleMissing: () => void;
  /** Catalogo da (ri)caricare: `INVALID_PERMISSION_CODE` o "Riprova". */
  onReloadCatalog: () => void;
}

/** Drawer di creazione, modifica o consultazione di un ruolo. */
export default function RoleFormDrawer({
  opened,
  mode,
  role,
  catalog,
  catalogError,
  callerPermissions,
  onClose,
  onSaved,
  onRoleMissing,
  onReloadCatalog,
}: RoleFormDrawerProps): JSX.Element {
  const [submitting, setSubmitting] = useState(false);
  const readOnly = mode === 'view';
  const isCreate = mode === 'create';

  const form = useForm<RoleFormValues>({
    mode: 'controlled',
    initialValues: roleToFormValues(null),
    validateInputOnChange: ['code'],
    validate: {
      code: (value) =>
        !isCreate || ROLE_CODE_PATTERN.test(value)
          ? null
          : 'Minuscole, cifre e underscore, da 3 a 50 caratteri, inizia con una lettera',
      name: (value) => {
        if (value.trim().length === 0) return 'Nome obbligatorio';
        return value.trim().length > NAME_MAX ? `Massimo ${NAME_MAX} caratteri` : null;
      },
      description: (value) =>
        value.trim().length > DESCRIPTION_MAX ? `Massimo ${DESCRIPTION_MAX} caratteri` : null,
    },
  });

  // Riallinea il form al ruolo a ogni apertura. `form` è stabile fra i render.
  useEffect(() => {
    if (!opened) return;
    form.setValues(roleToFormValues(role));
    form.clearErrors();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo all'apertura o al cambio ruolo
  }, [opened, role]);

  async function handleSubmit(values: RoleFormValues): Promise<void> {
    if (readOnly) return;
    let payload: UpdateRolePayload | null = null;
    if (!isCreate && role) {
      payload = diffRole(role, values);
      // Il backend risponderebbe `400` a un body vuoto: nessuna modifica, nessuna richiesta.
      if (Object.keys(payload).length === 0) {
        onClose();
        return;
      }
    }
    setSubmitting(true);
    try {
      if (isCreate) {
        await createRole({
          code: values.code,
          name: values.name.trim(),
          description: normalizeDescription(values.description),
          permissionCodes: values.permissionCodes,
        });
        notifications.show({ color: 'green', message: 'Ruolo creato' });
      } else if (role && payload) {
        await updateRole(role.guid, payload);
        notifications.show({ color: 'green', message: 'Ruolo aggiornato' });
      }
      onSaved();
    } catch (err) {
      const code = getErrorCode(err);
      if (code === 'INVALID_PERMISSION_CODE') onReloadCatalog();
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 404) {
        onRoleMissing();
        return;
      }
      const feedback = roleErrorMessage(
        err,
        isCreate ? 'Errore nella creazione del ruolo' : "Errore nell'aggiornamento del ruolo",
      );
      if (feedback) {
        if (feedback.field) form.setFieldError(feedback.field, feedback.message);
        notifications.show({ color: 'red', message: feedback.message });
      }
    } finally {
      setSubmitting(false);
    }
  }

  const title = isCreate
    ? 'Nuovo ruolo'
    : readOnly
      ? `Ruolo: ${role?.name ?? ''}`
      : `Modifica ruolo: ${role?.name ?? ''}`;

  return (
    <FormDrawer
      opened={opened}
      onClose={onClose}
      title={title}
      onSubmit={form.onSubmit((values) => void handleSubmit(values))}
      canSubmit={form.isValid() && catalog !== null}
      submitting={submitting}
      readOnly={readOnly}
    >
      <Stack gap="sm">
        {isCreate ? (
          <TextInput
            label="Codice"
            description="Identificativo stabile, non modificabile dopo la creazione"
            placeholder="es. redattore_senior"
            withAsterisk
            {...form.getInputProps('code')}
          />
        ) : (
          <div>
            <Text size="sm" fw={500}>
              Codice
            </Text>
            <Text ff="monospace" size="sm" data-testid="role-code">
              {role?.code}
            </Text>
          </div>
        )}
        <TextInput
          label="Nome"
          withAsterisk={!readOnly}
          disabled={readOnly}
          {...form.getInputProps('name')}
        />
        <Textarea
          label="Descrizione"
          autosize
          minRows={2}
          disabled={readOnly}
          {...form.getInputProps('description')}
        />
        {catalog ? (
          <PermissionMatrix
            groups={catalog}
            value={form.values.permissionCodes}
            onChange={(next) => form.setFieldValue('permissionCodes', next)}
            callerPermissions={callerPermissions}
            readOnly={readOnly}
          />
        ) : catalogError ? (
          <Alert color="orange" icon={<IconAlertTriangle size={16} />}>
            <Stack gap="xs" align="flex-start">
              <Text size="sm">Impossibile caricare il catalogo dei permessi.</Text>
              <Button size="xs" variant="light" onClick={onReloadCatalog}>
                Riprova
              </Button>
            </Stack>
          </Alert>
        ) : (
          <Center py="md">
            <Loader size="sm" aria-label="Caricamento del catalogo dei permessi" />
          </Center>
        )}
      </Stack>
    </FormDrawer>
  );
}
