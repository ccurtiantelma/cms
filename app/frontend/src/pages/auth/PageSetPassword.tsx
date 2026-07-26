/**
 * Pagina condivisa per attivazione account (`/activate?token=...`) e
 * reimpostazione password (`/reset-password?token=...`): il flusso è
 * distinto in base al pathname corrente.
 */
import { useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Container, Paper, Text, Button, Stack, Anchor, Alert } from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { activateAccountApi, resetPasswordApi } from '../../services/auth.service';
import { getErrorMessage } from '../../utils/api.utils';
import PasswordStrengthInput, {
  validatePasswordStrength,
} from '../../components/PasswordStrengthInput';
import setPasswordStyles from './PageSetPassword.module.css';

interface FormValues {
  password: string;
  confirmPassword: string;
}

/** Pagina di attivazione account / reimpostazione password (token via query string). */
export default function PageSetPassword(): JSX.Element {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const path = window.location.pathname;
  const source: 'activation' | 'reset' | null = path.includes('activate')
    ? 'activation'
    : path.includes('reset-password')
      ? 'reset'
      : null;

  const form = useForm<FormValues>({
    mode: 'controlled',
    initialValues: {
      password: '',
      confirmPassword: '',
    },
    validate: {
      password: (value) => {
        if (!value) return 'Password obbligatoria';
        const strength = validatePasswordStrength(value);
        if (!strength.valid) return strength.reasons[0] ?? 'Password non conforme alla policy';
        return null;
      },
      confirmPassword: (value, values) => {
        if (value !== values.password) return 'Le password non corrispondono';
        return null;
      },
    },
  });

  const handleSubmit = async (values: FormValues): Promise<void> => {
    if (!token || !source) return;
    setIsSubmitting(true);
    try {
      if (source === 'activation') {
        await activateAccountApi({ token, password: values.password });
      } else {
        await resetPasswordApi({ token, password: values.password });
      }

      notifications.show({
        color: 'green',
        title: 'Operazione completata',
        message:
          source === 'activation'
            ? 'Account attivato con successo. Effettua il login.'
            : 'Password reimpostata con successo. Effettua il login.',
      });
      window.location.href = '/login';
    } catch (err) {
      const message = getErrorMessage(err, 'Impossibile impostare la password');

      if (
        message.toLowerCase().includes('non valido') ||
        message.toLowerCase().includes('scaduto')
      ) {
        notifications.show({
          color: 'red',
          title: 'Link non valido',
          message: 'Il link è scaduto o non è più valido. Richiedine uno nuovo.',
        });
      } else {
        notifications.show({ color: 'red', title: 'Errore', message });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!token || !source) {
    return (
      <div className={setPasswordStyles.wrapper}>
        <Container size="xs" className={setPasswordStyles.container}>
          <Text ta="center" fw={800} size="xl" mb="md">
            Starter Kit
          </Text>

          <Paper withBorder shadow="md" p="xl" radius="md" w="100%">
            <Stack gap="md" align="center">
              <Text size="lg" fw={700} ta="center">
                Link non valido
              </Text>
              <Alert color="red" variant="light" title="Token mancante o non valido" w="100%">
                Il link utilizzato non contiene un token valido o è scaduto. Richiedi una nuova
                email di attivazione o recupero password.
              </Alert>
              <Anchor href="/forgot-password" size="sm">
                Richiedi nuova email
              </Anchor>
            </Stack>
          </Paper>
        </Container>
      </div>
    );
  }

  const title = source === 'activation' ? 'Attiva il tuo account' : 'Reimposta password';

  const subtitle =
    source === 'activation'
      ? 'Imposta la tua password per completare la registrazione.'
      : 'Inserisci una nuova password per il tuo account.';

  return (
    <div className={setPasswordStyles.wrapper}>
      <Container size="xs" className={setPasswordStyles.container}>
        <Text ta="center" fw={800} size="xl" mb="md">
          Starter Kit
        </Text>

        <Paper withBorder shadow="md" p="xl" radius="md" w="100%">
          <Stack gap="md">
            <Text size="lg" fw={700} ta="center">
              {title}
            </Text>
            <Text size="sm" c="dimmed" ta="center">
              {subtitle}
            </Text>

            <Alert color="blue" variant="light" title="Requisiti password" w="100%">
              Minimo 12 caratteri. Almeno 3 su: maiuscole, minuscole, numeri, simboli.
            </Alert>

            <form onSubmit={form.onSubmit(handleSubmit)}>
              <Stack gap="xs">
                <PasswordStrengthInput
                  label="Nuova password"
                  name="password"
                  value={form.values.password}
                  onChange={(password) => form.setFieldValue('password', password)}
                  error={
                    typeof form.errors.password === 'string' ? form.errors.password : undefined
                  }
                  placeholder="La tua nuova password"
                />
                <PasswordStrengthInput
                  label="Conferma password"
                  name="confirmPassword"
                  value={form.values.confirmPassword}
                  onChange={(password) => form.setFieldValue('confirmPassword', password)}
                  error={
                    typeof form.errors.confirmPassword === 'string'
                      ? form.errors.confirmPassword
                      : undefined
                  }
                  placeholder="Ripeti la password"
                  showGenerateButton={false}
                />

                <Button
                  type="submit"
                  color="starterPrimary"
                  fullWidth
                  loading={isSubmitting}
                  mt="sm"
                >
                  {source === 'activation' ? 'Attiva account' : 'Reimposta password'}
                </Button>
              </Stack>
            </form>

            <Anchor
              component={Link}
              to="/login"
              size="sm"
              c="dimmed"
              ta="center"
              w="100%"
              display="block"
            >
              Torna al login
            </Anchor>
          </Stack>
        </Paper>
      </Container>
    </div>
  );
}
