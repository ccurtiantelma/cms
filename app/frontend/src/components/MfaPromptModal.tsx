/**
 * Modal "Proteggi il tuo account" — invita l'utente a configurare la MFA al primo
 * accesso se non l'ha ancora attivata.
 */
import { useEffect, useState } from 'react';
import { Button, Group, Modal, Stack, Text } from '@mantine/core';
import { IconShieldLock } from '@tabler/icons-react';
import { useNavigate } from 'react-router-dom';

const MFA_PROMPT_SHOWN_KEY = 'mfaPromptShown';

interface MfaPromptModalProps {
  /** Stato MFA dell'utente autenticato, da `GET /auth/me`. */
  isMfaEnabled: boolean;
}

/**
 * Mostra l'invito a configurare la MFA finché l'utente non la attiva o non sceglie
 * esplicitamente "Più tardi" (preferenza salvata in localStorage, non nel DB).
 */
export default function MfaPromptModal({ isMfaEnabled }: MfaPromptModalProps): JSX.Element {
  const navigate = useNavigate();
  const [opened, setOpened] = useState(false);

  useEffect(() => {
    if (isMfaEnabled) return;
    const alreadyShown = localStorage.getItem(MFA_PROMPT_SHOWN_KEY) === 'true';
    if (!alreadyShown) setOpened(true);
  }, [isMfaEnabled]);

  const handleLater = (): void => {
    localStorage.setItem(MFA_PROMPT_SHOWN_KEY, 'true');
    setOpened(false);
  };

  const handleConfigureNow = (): void => {
    setOpened(false);
    navigate('/profile', { state: { activeTab: 'mfa' } });
  };

  return (
    <Modal opened={opened} onClose={handleLater} title="Proteggi il tuo account" centered>
      <Stack>
        <Text size="sm">
          La verifica in due passaggi (MFA) aggiunge un livello di sicurezza al tuo account: oltre
          alla password, ti verrà richiesto un codice generato da un'app di autenticazione ad ogni
          accesso. Puoi attivarla in qualsiasi momento dal tuo Profilo.
        </Text>
        <Group justify="flex-end">
          <Button variant="default" onClick={handleLater}>
            Più tardi
          </Button>
          <Button
            color="starterPrimary"
            leftSection={<IconShieldLock size={16} />}
            onClick={handleConfigureNow}
          >
            Configura ora
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
