/**
 * Pagina di login.
 * Gestisce:
 * 1. Login normale (email + password) -> salva token -> redirect /dashboard
 * 2. Se risposta `mfaRequired`: mostra campo codice TOTP -> chiama /mfa-verify -> salva token -> redirect
 * 3. Se errore "Account non attivato": mostra messaggio chiaro + link a richiesta nuova email
 */

import { useState } from 'react';
import {
  Container,
  Paper,
  Text,
  Button,
  Stack,
  Anchor,
  Group,
  TextInput,
  PasswordInput,
  type TextInputProps,
  type PasswordInputProps,
} from '@mantine/core';
import { useNavigate, Link } from 'react-router-dom';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { IconLock, IconMail, IconShield } from '@tabler/icons-react';
import { loginApi, mfaVerifyApi } from '../../services/auth.service';
import { getErrorMessage } from '../../utils/api.utils';
import { homePathForRole } from '../../utils/auth.utils';
import { useAuthStore } from '../../hooks/useAuth';
import loginStyles from './PageLogin.module.css';

type LoginStep = 'credentials' | 'mfa';

interface LoginFormValues {
  email: string;
  password: string;
  totpCode: string;
}

/* ------------------------------------------------------------------ */
/* Componenti locali per input con icona                              */
/* ------------------------------------------------------------------ */

interface TextInputWithIconProps extends TextInputProps {
  icon: React.ReactNode;
}

function TextInputWithIcon({
  label,
  placeholder,
  icon,
  ...rest
}: TextInputWithIconProps): JSX.Element {
  return (
    <TextInput
      label={label}
      placeholder={placeholder}
      leftSection={icon}
      leftSectionPointerEvents="none"
      leftSectionWidth={36}
      {...rest}
    />
  );
}

interface PasswordInputWithIconProps extends PasswordInputProps {
  icon: React.ReactNode;
}

function PasswordInputWithIcon({
  label,
  placeholder,
  icon,
  ...rest
}: PasswordInputWithIconProps): JSX.Element {
  return (
    <PasswordInput
      label={label}
      placeholder={placeholder}
      leftSection={icon}
      leftSectionPointerEvents="none"
      leftSectionWidth={36}
      {...rest}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Pagina principale                                                   */
/* ------------------------------------------------------------------ */

/**
 * Form di login a due step (credenziali + MFA opzionale).
 */
export default function PageLogin(): JSX.Element {
  const navigate = useNavigate();
  const login = useAuthStore((state) => state.login);
  const [step, setStep] = useState<LoginStep>('credentials');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingTmpToken, setPendingTmpToken] = useState<string | null>(null);
  const [activationError, setActivationError] = useState<string | null>(null);

  const form = useForm<LoginFormValues>({
    mode: 'controlled',
    initialValues: {
      email: '',
      password: '',
      totpCode: '',
    },
    validate: {
      email: (value) => {
        if (!value.trim()) return 'Email obbligatoria';
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return 'Email non valida';
        return null;
      },
      password: (value) => {
        if (!value) return 'Password obbligatoria';
        return null;
      },
      // Validazione TOTP solo nello step MFA.
      totpCode: (value) => {
        if (step !== 'mfa') return null;
        if (!value || value.trim().length === 0) return 'Codice TOTP obbligatorio';
        if (!/^\d{6}$/.test(value.trim())) return 'Inserisci un codice a 6 cifre';
        return null;
      },
    },
  });

  /** Primo step: invio credenziali. */
  const handleCredentialsSubmit = async (values: LoginFormValues): Promise<void> => {
    setIsSubmitting(true);
    setActivationError(null);
    try {
      const response = await loginApi({
        email: values.email.trim(),
        password: values.password,
      });

      if (response.mfaRequired && response.tmpToken) {
        setPendingTmpToken(response.tmpToken);
        setStep('mfa');
        form.setFieldValue('totpCode', '');
        return;
      }

      if (response.accessToken && response.user) {
        login(response.accessToken, response.user);
        notifications.show({ color: 'green', title: 'Accesso effettuato', message: 'Benvenuto' });
        navigate(homePathForRole(response.user.role), { replace: true });
      }
    } catch (err) {
      const message = getErrorMessage(err, 'Credenziali non valide');

      if (message.toLowerCase().includes('non attiv')) {
        setActivationError(
          'Account non attivato. Controlla la tua email o richiedi una nuova email di attivazione.',
        );
      } else {
        notifications.show({ color: 'red', title: 'Accesso negato', message });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  /** Secondo step: verifica codice MFA. */
  const handleMfaSubmit = async (values: LoginFormValues): Promise<void> => {
    if (!pendingTmpToken) return;
    setIsSubmitting(true);
    try {
      const response = await mfaVerifyApi({
        tmpToken: pendingTmpToken,
        code: values.totpCode.trim(),
      });

      login(response.accessToken, response.user);
      notifications.show({ color: 'green', title: 'Accesso effettuato', message: 'Benvenuto' });
      navigate(homePathForRole(response.user.role), { replace: true });
    } catch (err) {
      notifications.show({
        color: 'red',
        title: 'Codice non valido',
        message: getErrorMessage(err, 'Verifica il codice e riprova'),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = step === 'credentials' ? handleCredentialsSubmit : handleMfaSubmit;
  const isCredentialsStep = step === 'credentials';

  return (
    <div className={loginStyles.wrapper}>
      <Container size="xs" className={loginStyles.container}>
        {/* Placeholder testuale al posto del logo immagine (nessun logo aziendale definito). */}
        <Text ta="center" fw={800} size="xl" mb="md">
          CMS
        </Text>

        <Paper withBorder shadow="md" p="xl" radius="md" w="100%">
          <Stack gap="md">
            <Text size="lg" fw={700} ta="center">
              {isCredentialsStep ? 'Accedi' : 'Verifica MFA'}
            </Text>

            {isCredentialsStep && (
              <Text size="sm" c="dimmed" ta="center">
                Inserisci le tue credenziali per accedere
              </Text>
            )}

            {!isCredentialsStep && (
              <Text size="sm" c="dimmed" ta="center">
                Inserisci il codice generato dall'app di autenticazione
              </Text>
            )}

            {activationError && isCredentialsStep && (
              <Text size="sm" c="red" ta="center">
                {activationError}{' '}
                <Anchor component={Link} to="/forgot-password" size="sm" fw={500}>
                  Richiedi nuova email
                </Anchor>
              </Text>
            )}

            <form onSubmit={form.onSubmit(handleSubmit)}>
              <Stack gap="xs">
                {isCredentialsStep ? (
                  <>
                    <TextInputWithIcon
                      label="Email"
                      name="email"
                      placeholder="nome@azienda.it"
                      icon={<IconMail size={16} />}
                      {...form.getInputProps('email')}
                    />
                    <PasswordInputWithIcon
                      label="Password"
                      name="password"
                      placeholder="La tua password"
                      icon={<IconLock size={16} />}
                      {...form.getInputProps('password')}
                    />
                  </>
                ) : (
                  <TextInputWithIcon
                    label="Codice TOTP"
                    name="totpCode"
                    placeholder="123456"
                    icon={<IconShield size={16} />}
                    maxLength={6}
                    {...form.getInputProps('totpCode')}
                  />
                )}

                <Button
                  type="submit"
                  color="starterPrimary"
                  fullWidth
                  loading={isSubmitting}
                  disabled={!!activationError && isCredentialsStep}
                  mt="sm"
                >
                  {isCredentialsStep ? 'Accedi' : 'Verifica'}
                </Button>
              </Stack>
            </form>

            <Group justify="space-between" mt="xs">
              {isCredentialsStep && (
                <Anchor component={Link} to="/forgot-password" size="sm" c="dimmed">
                  Password dimenticata?
                </Anchor>
              )}

              {!isCredentialsStep && (
                <Button
                  variant="subtle"
                  size="xs"
                  onClick={() => {
                    setStep('credentials');
                    setPendingTmpToken(null);
                    form.reset();
                  }}
                >
                  Torna al login
                </Button>
              )}
            </Group>
          </Stack>
        </Paper>
      </Container>
    </div>
  );
}
