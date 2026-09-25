/**
 * Pagina Profilo Utente — dati anagrafici, cambio password, gestione MFA,
 * sessioni, elenco notifiche ricevute (ADR-12) e preferenza tema.
 * Nessuna tab "Notifiche desktop" (non prevista).
 */
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  Badge,
  Button,
  Card,
  Center,
  Group,
  Image,
  Loader,
  Modal,
  Pagination,
  PasswordInput,
  PinInput,
  SegmentedControl,
  Stack,
  Table,
  Tabs,
  Text,
  TextInput,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  IconBell,
  IconDevices,
  IconLock,
  IconPalette,
  IconShieldLock,
  IconUserCircle,
} from '@tabler/icons-react';
import { useAuthStore } from '../../hooks/useAuth';
import { useColorScheme, type ColorScheme } from '../../hooks/useColorScheme';
import { getErrorMessage } from '../../utils/api.utils';
import { formatDate } from '../../utils/date.utils';
import { parseDeviceLabel } from '../../utils/device.utils';
import PasswordStrengthInput, {
  validatePasswordStrength,
} from '../../components/PasswordStrengthInput';
import ContentCard from '../../components/ContentCard';
import PageHeader from '../../components/PageHeader';
import {
  changePasswordApi,
  getMeApi,
  getSessionsApi,
  mfaDisableApi,
  mfaEnableApi,
  mfaSetupApi,
  revokeSessionApi,
  updateProfileApi,
} from '../../services/auth.service';
import {
  getNotificationsApi,
  markAllNotificationsReadApi,
  markNotificationReadApi,
} from '../../services/notifications.service';
import type { MeResponse, SessionSummary } from '../../types/auth.types';
import type { NotificationItem } from '../../types/notifications.types';
import { AppUserRoles, ROLE_LABELS } from '../../types/common.types';

/** Colore badge per ruolo — le etichette vengono da `ROLE_LABELS` (types/common.types.ts). */
const ROLE_COLORS: Record<AppUserRoles, string> = {
  [AppUserRoles.SuperAdmin]: 'dark',
  [AppUserRoles.Admin]: 'starterPrimary',
  [AppUserRoles.Manager]: 'cyan',
  [AppUserRoles.User]: 'green',
};

interface MfaSetupState {
  secret: string;
  qrCodeDataUrl: string;
  code: string;
}

/** Pagina Profilo Utente: tab "Dati anagrafici", "Cambio password", "Sicurezza MFA", "Tema". */
export default function PageProfile(): JSX.Element {
  const { colorScheme, setColorScheme } = useColorScheme();
  const updateUserProfile = useAuthStore((state) => state.updateUserProfile);
  const setMfaEnabled = useAuthStore((state) => state.setMfaEnabled);

  // Tab preselezionato in navigazione (es. da MfaPromptModal → tab "mfa").
  const location = useLocation();
  const initialTab =
    (location.state as { activeTab?: string } | null)?.activeTab === 'mfa' ? 'mfa' : 'anagrafica';

  const [profile, setProfile] = useState<MeResponse | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = await getMeApi();
        if (active) setProfile(data);
      } catch (err) {
        notifications.show({
          color: 'red',
          message: getErrorMessage(err, 'Errore nel recupero del profilo'),
        });
      } finally {
        if (active) setLoadingProfile(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // --- Dati anagrafici (nome/cognome, self-service per qualsiasi ruolo) ---
  const [nome, setNome] = useState('');
  const [cognome, setCognome] = useState('');
  const [savingAnagrafica, setSavingAnagrafica] = useState(false);

  useEffect(() => {
    if (profile) {
      setNome(profile.name);
      setCognome(profile.surname ?? '');
    }
  }, [profile]);

  const anagraficaInvariata =
    profile != null && nome === profile.name && cognome === (profile.surname ?? '');

  const handleSalvaAnagrafica = async (): Promise<void> => {
    if (!nome.trim()) {
      notifications.show({ color: 'red', message: 'Il nome è obbligatorio.' });
      return;
    }
    setSavingAnagrafica(true);
    try {
      const data = await updateProfileApi({
        name: nome.trim(),
        surname: cognome.trim() || undefined,
      });
      setProfile((prev) => (prev ? { ...prev, name: data.name, surname: data.surname } : prev));
      updateUserProfile(data.name, data.surname);
      notifications.show({ color: 'green', message: 'Dati anagrafici aggiornati con successo' });
    } catch (err) {
      notifications.show({
        color: 'red',
        message: getErrorMessage(err, "Errore nell'aggiornamento dei dati anagrafici"),
      });
    } finally {
      setSavingAnagrafica(false);
    }
  };

  // --- Cambio password ---
  const [vecchiaPassword, setVecchiaPassword] = useState('');
  const [nuovaPassword, setNuovaPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  const handleCambiaPassword = async (): Promise<void> => {
    if (!validatePasswordStrength(nuovaPassword).valid) {
      notifications.show({
        color: 'red',
        message: 'La nuova password non rispetta la policy di sicurezza.',
      });
      return;
    }
    setSavingPassword(true);
    try {
      await changePasswordApi({ currentPassword: vecchiaPassword, newPassword: nuovaPassword });
      notifications.show({ color: 'green', message: 'Password aggiornata con successo' });
      setVecchiaPassword('');
      setNuovaPassword('');
    } catch (err) {
      notifications.show({
        color: 'red',
        message: getErrorMessage(err, 'Errore nel cambio password'),
      });
    } finally {
      setSavingPassword(false);
    }
  };

  // --- Gestione MFA ---
  const [mfaSetup, setMfaSetupState] = useState<MfaSetupState | null>(null);
  const [mfaLoading, setMfaLoading] = useState(false);
  const [confirmMode, setConfirmMode] = useState<'disattiva' | 'rigenera' | null>(null);
  const [confirmCode, setConfirmCode] = useState('');

  const avviaSetupMfa = async (): Promise<void> => {
    setMfaLoading(true);
    try {
      const { secret, qrCodeDataUrl } = await mfaSetupApi();
      setMfaSetupState({ secret, qrCodeDataUrl, code: '' });
    } catch (err) {
      notifications.show({
        color: 'red',
        message: getErrorMessage(err, 'Errore nella generazione del QR code MFA'),
      });
    } finally {
      setMfaLoading(false);
    }
  };

  const confermaSetupMfa = async (): Promise<void> => {
    if (!mfaSetup) return;
    setMfaLoading(true);
    try {
      await mfaEnableApi({ code: mfaSetup.code });
      notifications.show({ color: 'green', message: 'MFA attivata con successo' });
      setMfaSetupState(null);
      setProfile((prev) => (prev ? { ...prev, isMfaEnabled: true } : prev));
      setMfaEnabled(true);
    } catch (err) {
      notifications.show({ color: 'red', message: getErrorMessage(err, 'Codice non valido') });
    } finally {
      setMfaLoading(false);
    }
  };

  /**
   * Conferma identità (codice TOTP corrente) per disattivare o rigenerare la MFA.
   * Non esiste un endpoint dedicato "rigenera": la rigenerazione disattiva il
   * secret corrente (`mfa-disable`) e avvia subito un nuovo setup (`mfa-setup`),
   * da confermare con `mfa-enable` come una prima attivazione.
   */
  const handleConfirmCode = async (): Promise<void> => {
    if (!confirmMode) return;
    setMfaLoading(true);
    try {
      await mfaDisableApi({ code: confirmCode });
      setProfile((prev) => (prev ? { ...prev, isMfaEnabled: false } : prev));
      setMfaEnabled(false);
      setConfirmCode('');

      if (confirmMode === 'disattiva') {
        notifications.show({ color: 'green', message: 'MFA disattivata con successo' });
        setConfirmMode(null);
      } else {
        setConfirmMode(null);
        await avviaSetupMfa();
        notifications.show({
          color: 'blue',
          message: 'Scansiona il nuovo QR code per completare la rigenerazione',
        });
      }
    } catch (err) {
      notifications.show({ color: 'red', message: getErrorMessage(err, 'Codice non valido') });
    } finally {
      setMfaLoading(false);
    }
  };

  // --- Sessioni attive (dispositivi) ---
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [revokingSessionId, setRevokingSessionId] = useState<string | null>(null);
  const [sessionPendingRevoke, setSessionPendingRevoke] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = await getSessionsApi();
        if (active) setSessions(data);
      } catch (err) {
        notifications.show({
          color: 'red',
          message: getErrorMessage(err, 'Errore nel recupero delle sessioni attive'),
        });
      } finally {
        if (active) setLoadingSessions(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const handleRevokeSession = async (): Promise<void> => {
    if (!sessionPendingRevoke) return;
    const sessionId = sessionPendingRevoke;
    setRevokingSessionId(sessionId);
    try {
      await revokeSessionApi(sessionId);
      setSessions((prev) => prev.filter((s) => s.sessionId !== sessionId));
      notifications.show({ color: 'green', message: 'Sessione revocata con successo' });
    } catch (err) {
      notifications.show({
        color: 'red',
        message: getErrorMessage(err, 'Errore nella revoca della sessione'),
      });
    } finally {
      setRevokingSessionId(null);
      setSessionPendingRevoke(null);
    }
  };

  // --- Notifiche ricevute (lista paginata, ADR-12) ---
  const [notifItems, setNotifItems] = useState<NotificationItem[]>([]);
  const [notifPage, setNotifPage] = useState(1);
  const [notifTotalPages, setNotifTotalPages] = useState(1);
  const [loadingNotifs, setLoadingNotifs] = useState(true);
  const [markingAll, setMarkingAll] = useState(false);

  useEffect(() => {
    let active = true;
    setLoadingNotifs(true);
    (async () => {
      try {
        const data = await getNotificationsApi({ p: notifPage, i: 20 });
        if (!active) return;
        setNotifItems(data.items);
        setNotifTotalPages(Math.max(data.totalPages, 1));
      } catch (err) {
        notifications.show({
          color: 'red',
          message: getErrorMessage(err, 'Errore nel recupero delle notifiche'),
        });
      } finally {
        if (active) setLoadingNotifs(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [notifPage]);

  const handleMarkRead = async (guid: string): Promise<void> => {
    try {
      await markNotificationReadApi(guid);
      setNotifItems((prev) => prev.map((n) => (n.guid === guid ? { ...n, isRead: true } : n)));
    } catch (err) {
      notifications.show({
        color: 'red',
        message: getErrorMessage(err, 'Errore nel segnare la notifica come letta'),
      });
    }
  };

  const handleMarkAllRead = async (): Promise<void> => {
    setMarkingAll(true);
    try {
      await markAllNotificationsReadApi();
      setNotifItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
    } catch (err) {
      notifications.show({
        color: 'red',
        message: getErrorMessage(err, 'Errore nel segnare le notifiche come lette'),
      });
    } finally {
      setMarkingAll(false);
    }
  };

  if (loadingProfile) {
    return (
      <Center p="xl">
        <Loader />
      </Center>
    );
  }

  const roleValue = profile?.role as AppUserRoles | undefined;

  return (
    <div>
      <PageHeader breadcrumbs={[{ label: 'Profilo Utente' }]} title="Profilo Utente" />

      <ContentCard>
        <Stack gap="lg">
          <Tabs defaultValue={initialTab}>
            <Tabs.List>
              <Tabs.Tab value="anagrafica" leftSection={<IconUserCircle size={16} />}>
                Dati anagrafici
              </Tabs.Tab>
              <Tabs.Tab value="password" leftSection={<IconLock size={16} />}>
                Cambio password
              </Tabs.Tab>
              <Tabs.Tab value="mfa" leftSection={<IconShieldLock size={16} />}>
                Sicurezza MFA
              </Tabs.Tab>
              <Tabs.Tab value="sessioni" leftSection={<IconDevices size={16} />}>
                Sessioni attive
              </Tabs.Tab>
              <Tabs.Tab value="notifiche" leftSection={<IconBell size={16} />}>
                Notifiche
              </Tabs.Tab>
              <Tabs.Tab value="tema" leftSection={<IconPalette size={16} />}>
                Tema
              </Tabs.Tab>
            </Tabs.List>

            <Tabs.Panel value="anagrafica" pt="md">
              <Card withBorder maw={700}>
                <Stack>
                  <TextInput
                    label="Nome"
                    value={nome}
                    onChange={(event) => setNome(event.currentTarget.value)}
                  />
                  <TextInput
                    label="Cognome"
                    value={cognome}
                    onChange={(event) => setCognome(event.currentTarget.value)}
                  />
                  <TextInput label="Email" value={profile?.email ?? ''} readOnly />
                  <Group>
                    <Text size="sm" fw={500}>
                      Ruolo
                    </Text>
                    <Badge color={roleValue !== undefined ? ROLE_COLORS[roleValue] : 'gray'}>
                      {roleValue !== undefined ? ROLE_LABELS[roleValue] : 'N/D'}
                    </Badge>
                  </Group>
                  {profile?.scopeId && (
                    <Group>
                      <Text size="sm" fw={500}>
                        Ambito
                      </Text>
                      <Badge color="starterPrimary" variant="light">
                        {profile.scopeId}
                      </Badge>
                    </Group>
                  )}
                  <Group justify="flex-end">
                    <Button
                      color="starterPrimary"
                      loading={savingAnagrafica}
                      disabled={anagraficaInvariata}
                      onClick={handleSalvaAnagrafica}
                    >
                      Salva
                    </Button>
                  </Group>
                </Stack>
              </Card>
            </Tabs.Panel>

            <Tabs.Panel value="password" pt="md">
              <Card withBorder maw={700}>
                <Stack>
                  <PasswordInput
                    label="Password attuale"
                    value={vecchiaPassword}
                    onChange={(event) => setVecchiaPassword(event.currentTarget.value)}
                  />
                  <PasswordStrengthInput
                    label="Nuova password"
                    value={nuovaPassword}
                    onChange={setNuovaPassword}
                  />
                  <Group justify="flex-end">
                    <Button
                      color="starterPrimary"
                      loading={savingPassword}
                      disabled={!vecchiaPassword || !nuovaPassword}
                      onClick={handleCambiaPassword}
                    >
                      Aggiorna password
                    </Button>
                  </Group>
                </Stack>
              </Card>
            </Tabs.Panel>

            <Tabs.Panel value="mfa" pt="md">
              <Card withBorder maw={700}>
                <Stack>
                  <Group>
                    <Text size="sm" fw={500}>
                      Stato MFA
                    </Text>
                    <Badge color={profile?.isMfaEnabled ? 'green' : 'gray'}>
                      {profile?.isMfaEnabled ? 'Attiva' : 'Non attiva'}
                    </Badge>
                  </Group>

                  {mfaSetup ? (
                    <Stack align="center">
                      <Image
                        src={mfaSetup.qrCodeDataUrl}
                        alt="QR code MFA"
                        w={200}
                        h={200}
                        fit="contain"
                      />
                      <Text size="xs" c="dimmed">
                        Scansiona il QR code con la tua app di autenticazione, poi inserisci il
                        codice generato.
                      </Text>
                      <PinInput
                        length={6}
                        type="number"
                        value={mfaSetup.code}
                        onChange={(code) =>
                          setMfaSetupState((prev) => (prev ? { ...prev, code } : prev))
                        }
                      />
                      <Group>
                        <Button variant="default" onClick={() => setMfaSetupState(null)}>
                          Annulla
                        </Button>
                        <Button
                          color="starterPrimary"
                          loading={mfaLoading}
                          disabled={mfaSetup.code.length !== 6}
                          onClick={confermaSetupMfa}
                        >
                          Verifica e attiva
                        </Button>
                      </Group>
                    </Stack>
                  ) : (
                    <Group>
                      {profile?.isMfaEnabled ? (
                        <>
                          <Button
                            color="red"
                            variant="light"
                            onClick={() => setConfirmMode('disattiva')}
                          >
                            Disattiva MFA
                          </Button>
                          <Button variant="default" onClick={() => setConfirmMode('rigenera')}>
                            Rigenera
                          </Button>
                        </>
                      ) : (
                        <Button color="starterPrimary" loading={mfaLoading} onClick={avviaSetupMfa}>
                          Attiva MFA
                        </Button>
                      )}
                    </Group>
                  )}
                </Stack>
              </Card>

              <Modal
                opened={confirmMode !== null}
                onClose={() => {
                  setConfirmMode(null);
                  setConfirmCode('');
                }}
                title={confirmMode === 'rigenera' ? 'Rigenera MFA' : 'Disattiva MFA'}
                centered
              >
                <Stack align="center">
                  <Text size="sm">
                    Inserisci il codice generato dalla tua app di autenticazione per confermare
                    l'operazione.
                  </Text>
                  <PinInput
                    length={6}
                    type="number"
                    value={confirmCode}
                    onChange={setConfirmCode}
                  />
                  <Button
                    color="starterPrimary"
                    fullWidth
                    loading={mfaLoading}
                    disabled={confirmCode.length !== 6}
                    onClick={handleConfirmCode}
                  >
                    Conferma
                  </Button>
                </Stack>
              </Modal>
            </Tabs.Panel>

            <Tabs.Panel value="sessioni" pt="md">
              <Card withBorder maw={900}>
                <Stack>
                  <Text size="sm" c="dimmed">
                    Dispositivi con accesso attivo al tuo account. Revoca le sessioni che non
                    riconosci.
                  </Text>
                  {loadingSessions ? (
                    <Center p="md">
                      <Loader size="sm" />
                    </Center>
                  ) : sessions.length === 0 ? (
                    <Text size="sm" c="dimmed">
                      Nessuna sessione attiva.
                    </Text>
                  ) : (
                    <Table.ScrollContainer minWidth={600}>
                      <Table verticalSpacing="sm">
                        <Table.Thead>
                          <Table.Tr>
                            <Table.Th>Dispositivo</Table.Th>
                            <Table.Th>Ultimo accesso</Table.Th>
                            <Table.Th>Prima attivazione</Table.Th>
                            <Table.Th />
                          </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                          {sessions.map((session) => (
                            <Table.Tr key={session.sessionId}>
                              <Table.Td>
                                <Stack gap={2}>
                                  <Group gap="xs">
                                    <Text size="sm">
                                      {parseDeviceLabel(session.userAgent) ??
                                        'Dispositivo sconosciuto'}
                                    </Text>
                                    {session.current && (
                                      <Badge size="xs" color="starterPrimary" variant="light">
                                        Questo dispositivo
                                      </Badge>
                                    )}
                                  </Group>
                                  {session.ip && (
                                    <Text size="xs" c="dimmed">
                                      {session.ip}
                                    </Text>
                                  )}
                                </Stack>
                              </Table.Td>
                              <Table.Td>
                                <Text size="sm">{formatDate(session.lastUsedAt)}</Text>
                              </Table.Td>
                              <Table.Td>
                                <Text size="sm">{formatDate(session.createdAt)}</Text>
                              </Table.Td>
                              <Table.Td>
                                <Button
                                  size="xs"
                                  color="red"
                                  variant="light"
                                  disabled={session.current}
                                  loading={revokingSessionId === session.sessionId}
                                  onClick={() => setSessionPendingRevoke(session.sessionId)}
                                >
                                  Revoca
                                </Button>
                              </Table.Td>
                            </Table.Tr>
                          ))}
                        </Table.Tbody>
                      </Table>
                    </Table.ScrollContainer>
                  )}
                </Stack>
              </Card>

              <Modal
                opened={sessionPendingRevoke !== null}
                onClose={() => setSessionPendingRevoke(null)}
                title="Revoca sessione"
                centered
              >
                <Stack align="center">
                  <Text size="sm" ta="center">
                    Il dispositivo verrà disconnesso immediatamente e dovrà effettuare nuovamente il
                    login. Continuare?
                  </Text>
                  <Group>
                    <Button variant="default" onClick={() => setSessionPendingRevoke(null)}>
                      Annulla
                    </Button>
                    <Button
                      color="red"
                      loading={revokingSessionId !== null}
                      onClick={handleRevokeSession}
                    >
                      Revoca sessione
                    </Button>
                  </Group>
                </Stack>
              </Modal>
            </Tabs.Panel>

            <Tabs.Panel value="notifiche" pt="md">
              <Card withBorder maw={900}>
                <Stack>
                  <Group justify="space-between">
                    <Text size="sm" c="dimmed">
                      Tutte le notifiche ricevute, dalla più recente.
                    </Text>
                    <Button
                      size="xs"
                      variant="light"
                      loading={markingAll}
                      disabled={notifItems.every((n) => n.isRead)}
                      onClick={handleMarkAllRead}
                    >
                      Segna tutte come lette
                    </Button>
                  </Group>
                  {loadingNotifs ? (
                    <Center p="md">
                      <Loader size="sm" />
                    </Center>
                  ) : notifItems.length === 0 ? (
                    <Text size="sm" c="dimmed">
                      Nessuna notifica ricevuta.
                    </Text>
                  ) : (
                    <Stack gap="xs">
                      {notifItems.map((n) => (
                        <Card key={n.guid} withBorder padding="sm">
                          <Group justify="space-between" wrap="nowrap" align="flex-start">
                            <Stack gap={2}>
                              <Group gap="xs">
                                <Text size="sm" fw={n.isRead ? 400 : 700}>
                                  {n.title}
                                </Text>
                                {!n.isRead && (
                                  <Badge size="xs" color="starterPrimary" variant="light">
                                    Nuova
                                  </Badge>
                                )}
                              </Group>
                              <Text size="sm">{n.message}</Text>
                              <Text size="xs" c="dimmed">
                                {formatDate(n.createdAt)}
                              </Text>
                            </Stack>
                            {!n.isRead && (
                              <Button
                                size="xs"
                                variant="subtle"
                                onClick={() => handleMarkRead(n.guid)}
                              >
                                Segna come letta
                              </Button>
                            )}
                          </Group>
                        </Card>
                      ))}
                    </Stack>
                  )}
                  {notifTotalPages > 1 && (
                    <Group justify="center">
                      <Pagination
                        value={notifPage}
                        onChange={setNotifPage}
                        total={notifTotalPages}
                      />
                    </Group>
                  )}
                </Stack>
              </Card>
            </Tabs.Panel>

            <Tabs.Panel value="tema" pt="md">
              <Card withBorder maw={700}>
                <Stack>
                  <Text size="sm" fw={500}>
                    Tema dell'applicazione
                  </Text>
                  <SegmentedControl
                    value={colorScheme}
                    onChange={(value) => setColorScheme(value as ColorScheme)}
                    data={[
                      { label: 'Sistema', value: 'auto' },
                      { label: 'Chiaro', value: 'light' },
                      { label: 'Scuro', value: 'dark' },
                    ]}
                  />
                </Stack>
              </Card>
            </Tabs.Panel>
          </Tabs>
        </Stack>
      </ContentCard>
    </div>
  );
}
