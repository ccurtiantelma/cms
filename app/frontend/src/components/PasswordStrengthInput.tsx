/**
 * Campo password con indicatore di robustezza, generatore di password sicura
 * e messaggi di validazione in linea. Riutilizzato da attivazione account,
 * reimpostazione password e cambio password (Pagina Profilo).
 */
import { useState, useId } from 'react';
import { Button, PasswordInput, Progress, Stack, Text } from '@mantine/core';

export interface PasswordStrengthResult {
  valid: boolean;
  score: number;
  reasons: string[];
}

export interface PasswordStrengthInputProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  name?: string;
  placeholder?: string;
  error?: string;
  showGenerateButton?: boolean;
}

/**
 * Valida la robustezza di una password: minimo 12 caratteri e almeno 3
 * categorie tra maiuscole, minuscole, numeri e simboli.
 */
export function validatePasswordStrength(password: string): PasswordStrengthResult {
  const reasons: string[] = [];

  if (!password) {
    return {
      valid: false,
      score: 0,
      reasons: ['La password non può essere vuota.'],
    };
  }

  const isLengthValid = password.length >= 12;
  if (!isLengthValid) {
    reasons.push('La password deve contenere almeno 12 caratteri.');
  }

  const hasUppercase = /[A-Z]/.test(password);
  const hasLowercase = /[a-z]/.test(password);
  const hasDigit = /[0-9]/.test(password);
  const hasSymbol = /[^A-Za-z0-9]/.test(password);

  const categoriesCount = [hasUppercase, hasLowercase, hasDigit, hasSymbol].filter(Boolean).length;
  const isCategoriesValid = categoriesCount >= 3;
  if (!isCategoriesValid) {
    reasons.push(
      'La password deve includere caratteri appartenenti ad almeno 3 delle seguenti categorie: lettere maiuscole (A-Z), lettere minuscole (a-z), numeri (0-9) e simboli.',
    );
  }

  // Punteggio progressivo (0-5: 1 punto per la lunghezza + 1 per categoria soddisfatta),
  // indipendente dal gate `valid` — cresce gradualmente invece di scattare solo a policy rispettata.
  return {
    valid: isLengthValid && isCategoriesValid,
    score: (isLengthValid ? 1 : 0) + categoriesCount,
    reasons,
  };
}

function randomInt(max: number): number {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return values[0] % max;
}

function pick(value: string): string {
  return value[randomInt(value.length)];
}

/** Genera una password casuale a 16 caratteri conforme alla policy di robustezza. */
function generateSecurePassword(): string {
  const uppercase = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lowercase = 'abcdefghijkmnopqrstuvwxyz';
  const digits = '23456789';
  const symbols = '!@#$%^&*()-_=+[]{}?';
  const all = `${uppercase}${lowercase}${digits}${symbols}`;
  const password = [pick(uppercase), pick(lowercase), pick(digits), pick(symbols)];

  while (password.length < 16) {
    password.push(pick(all));
  }

  for (let index = password.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(index + 1);
    [password[index], password[swapIndex]] = [password[swapIndex], password[index]];
  }

  return password.join('');
}

/** Campo password con indicatore di robustezza e generatore integrato. */
export default function PasswordStrengthInput({
  value,
  onChange,
  label = 'Password',
  name,
  placeholder = 'La tua password',
  error,
  showGenerateButton = true,
}: PasswordStrengthInputProps): JSX.Element {
  const [isVisible, setIsVisible] = useState(false);
  const descriptionId = useId();
  const strength = validatePasswordStrength(value);
  const barColor = strength.score === 0 ? 'red' : strength.valid ? 'green' : 'yellow';
  const text =
    strength.reasons.length > 0
      ? strength.reasons.join(' ')
      : 'Password conforme alla policy di sicurezza.';

  return (
    <Stack gap="xs">
      <PasswordInput
        label={label}
        name={name}
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
        placeholder={placeholder}
        error={error}
        visible={isVisible}
        onVisibilityChange={setIsVisible}
        visibilityToggleButtonProps={{
          'aria-label': isVisible ? 'Nascondi password' : 'Mostra password',
        }}
        aria-describedby={descriptionId}
      />

      <Progress.Root size="sm" aria-label="Forza password">
        <Progress.Section value={(strength.score / 5) * 100} color={barColor} />
      </Progress.Root>

      <Text id={descriptionId} size="xs" c={strength.valid ? 'green' : barColor}>
        {text}
      </Text>

      {showGenerateButton && (
        <Button
          type="button"
          variant="light"
          color="starterPrimary"
          size="xs"
          onClick={() => onChange(generateSecurePassword())}
        >
          Genera password sicura
        </Button>
      )}
    </Stack>
  );
}
