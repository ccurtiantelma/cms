/**
 * Chrome condiviso dei form entità in Drawer laterale (es. utenti). Centralizza
 * in un unico punto: apertura/chiusura del Drawer, intestazione delimitata da
 * una riga, barra azioni (Annulla/Salva) sticky subito sotto l'intestazione e
 * area campi scrollabile. Il pulsante di salvataggio è abilitato solo quando
 * il form è valido (`canSubmit`).
 *
 * I form figli mantengono `useForm` e la logica di submit: passano qui
 * `onSubmit` (tipicamente `form.onSubmit(handler)`) e `canSubmit`
 * (`form.isValid()`), evitando di duplicare layout e barra pulsanti.
 */
import { Button, CloseButton, Drawer, Group, Text, type DrawerProps } from '@mantine/core';
import type { FormEventHandler, ReactNode } from 'react';
import classes from './FormDrawer.module.css';

interface FormDrawerProps {
  opened: boolean;
  onClose: () => void;
  title: string;
  /** Handler di submit del form, tipicamente `form.onSubmit(handler)`. */
  onSubmit: FormEventHandler<HTMLFormElement>;
  /** Il pulsante di salvataggio è abilitato solo quando `true` (form valido). */
  canSubmit: boolean;
  /** Salvataggio in corso: blocca i pulsanti e mostra lo stato di caricamento. */
  submitting: boolean;
  /** Etichetta del pulsante di conferma (default: "Salva"). */
  submitLabel?: string;
  size?: DrawerProps['size'];
  children: ReactNode;
  /**
   * Identificatore per i tour contestuali (driver.js, `libs/pageTours.ts`): se presente,
   * aggiunge `data-tour={tourId}` all'area campi, `data-tour={tourId}-actions` alla barra
   * pulsanti e `data-tour={tourId}-cancel` al pulsante "Annulla" (usato dal tour per chiudere
   * il drawer senza salvare).
   */
  tourId?: string;
}

/**
 * Drawer di form con intestazione e barra azioni sticky, uniforme per ogni entità.
 */
export default function FormDrawer({
  opened,
  onClose,
  title,
  onSubmit,
  canSubmit,
  submitting,
  submitLabel = 'Salva',
  size,
  children,
  tourId,
}: FormDrawerProps): JSX.Element {
  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      position="right"
      size={size ?? 'min(38.75rem, 100vw)'}
      padding={0}
      withCloseButton={false}
    >
      <form onSubmit={onSubmit} className={classes.form}>
        <div className={classes.header}>
          <Group justify="space-between" px="md" py="sm" className={classes.titleRow}>
            <Text fw={600} fz="lg">
              {title}
            </Text>
            <CloseButton onClick={onClose} aria-label="Chiudi" size="lg" />
          </Group>
          <Group
            justify="flex-end"
            gap="sm"
            px="md"
            py="sm"
            data-tour={tourId ? `${tourId}-actions` : undefined}
          >
            <Button
              variant="default"
              onClick={onClose}
              disabled={submitting}
              data-tour={tourId ? `${tourId}-cancel` : undefined}
            >
              Annulla
            </Button>
            <Button type="submit" loading={submitting} disabled={!canSubmit}>
              {submitLabel}
            </Button>
          </Group>
        </div>
        <div className={classes.body} data-tour={tourId}>
          {children}
        </div>
      </form>
    </Drawer>
  );
}
