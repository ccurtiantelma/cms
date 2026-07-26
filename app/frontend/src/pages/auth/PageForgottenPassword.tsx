/**
 * Pagina "Password dimenticata?".
 * Risposta generica identica sia se l'email esiste sia se non esiste (anti user-enumeration).
 */
import { useState } from 'react';
import {
  Container,
  Paper,
  Text,
  Button,
  Stack,
  Anchor,
  TextInput,
  type TextInputProps,
} from '@mantine/core';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { IconMail } from '@tabler/icons-react';
import { forgotPasswordApi } from '../../services/auth.service';
import { getErrorMessage } from '../../utils/api.utils';
import styles from './PageForgottenPassword.module.css';

interface FormValues {
  email: string;
}

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

/** Pagina di richiesta reimpostazione password (POST /auth/forgot-password). */
export default function PageForgottenPassword(): JSX.Element {
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const form = useForm<FormValues>({
    mode: 'controlled',
    initialValues: { email: '' },
    validate: {
      email: (value) => {
        if (!value.trim()) return 'Email obbligatoria';
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return 'Email non valida';
        return null;
      },
    },
  });

  const handleSubmit = async (values: FormValues): Promise<void> => {
    setIsSubmitting(true);
    try {
      await forgotPasswordApi({ email: values.email.trim() });
      setSubmitted(true);
      notifications.show({
        color: 'green',
        title: 'Richiesta inviata',
        message:
          "Se l'indirizzo email esiste, riceverai le istruzioni per reimpostare la password.",
      });
    } catch (err) {
      notifications.show({
        color: 'red',
        title: 'Errore',
        message: getErrorMessage(err, 'Impossibile completare la richiesta.'),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className={styles.wrapper}>
        <Container size="xs" className={styles.container}>
          <Text ta="center" fw={800} size="xl" mb="md">
            Starter Kit
          </Text>
          <Paper withBorder shadow="md" p="xl" radius="md" w="100%">
            <Stack gap="md" align="center">
              <Text size="lg" fw={700} ta="center">
                Controlla la tua email
              </Text>
              <Text size="sm" c="dimmed" ta="center">
                Se l'indirizzo email esiste, riceverai un messaggio con le istruzioni.
              </Text>
              <Button variant="subtle" onClick={() => navigate('/login')} mt="md">
                Torna al login
              </Button>
            </Stack>
          </Paper>
        </Container>
      </div>
    );
  }

  return (
    <div className={styles.wrapper}>
      <Container size="xs" className={styles.container}>
        <Text ta="center" fw={800} size="xl" mb="md">
          Starter Kit
        </Text>
        <Paper withBorder shadow="md" p="xl" radius="md" w="100%">
          <Stack gap="md">
            <Text size="lg" fw={700} ta="center">
              Password dimenticata?
            </Text>
            <Text size="sm" c="dimmed" ta="center">
              Inserisci l'indirizzo email del tuo account. Ti invieremo le istruzioni per
              reimpostare la password.
            </Text>
            <form onSubmit={form.onSubmit(handleSubmit)}>
              <Stack gap="xs">
                <TextInputWithIcon
                  label="Email"
                  name="email"
                  placeholder="nome@azienda.it"
                  icon={<IconMail size={16} />}
                  {...form.getInputProps('email')}
                />
                <Button
                  type="submit"
                  color="starterPrimary"
                  fullWidth
                  loading={isSubmitting}
                  mt="sm"
                >
                  Invia richiesta
                </Button>
              </Stack>
            </form>
            <Anchor component={Link} to="/login" size="sm" c="dimmed" ta="center" display="block">
              Torna al login
            </Anchor>
          </Stack>
        </Paper>
      </Container>
    </div>
  );
}
