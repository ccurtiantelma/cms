/**
 * Selettore visivo del Template di partenza (`templateSlug`, RFC-43) per la
 * creazione di una nuova Pagina. Componente controllato: gli slug qui sotto
 * sono trascritti da `app/backend/src/pages/blueprints/page-blueprints.registry.ts`
 * (`PAGE_BLUEPRINTS`) — nessuno slug è inventato lato frontend.
 */
import { Badge, Paper, SimpleGrid, Text, UnstyledButton } from '@mantine/core';
import {
  IconBriefcase,
  IconCheck,
  IconFile,
  IconLayoutDashboard,
  IconMail,
  type Icon,
} from '@tabler/icons-react';
import classes from './TemplateSelectorGrid.module.css';

/** Una voce della griglia dei Template di partenza. */
interface TemplateOption {
  /** `templateSlug` inviato a `POST /app/pages` — deve combaciare col registro backend. */
  slug: string;
  label: string;
  description: string;
  icon: Icon;
}

/**
 * I quattro Template di partenza del primo rilascio (RFC-43), stesso ordine e
 * stessi slug di `PAGE_BLUEPRINTS` nel backend.
 */
const TEMPLATE_OPTIONS: readonly TemplateOption[] = [
  {
    slug: 'empty',
    label: 'Pagina Vuota',
    description: 'Layout base con sezione singola',
    icon: IconFile,
  },
  {
    slug: 'landing-page',
    label: 'Landing Page',
    description: 'Hero header, testo di presentazione e griglia a 2 colonne',
    icon: IconLayoutDashboard,
  },
  {
    slug: 'service-page',
    label: 'Scheda Servizio',
    description: 'Titolo, immagine di copertina e testo strutturato',
    icon: IconBriefcase,
  },
  {
    slug: 'contact-page',
    label: 'Contatti & Form',
    description: 'Header di benvenuto e struttura pronta per form',
    icon: IconMail,
  },
];

/** Props del selettore, componente controllato (`value`/`onChange`). */
export interface TemplateSelectorGridProps {
  /** `templateSlug` attualmente selezionato. */
  value: string;
  /** Invocata con il nuovo `templateSlug` al click su una card. */
  onChange: (slug: string) => void;
}

/**
 * Griglia di card selezionabili per il Template di partenza di una nuova
 * Pagina. Chrome editoriale (Mantine v7 ammesso e obbligatorio qui, a
 * differenza dei componenti dei blocchi).
 */
export default function TemplateSelectorGrid({
  value,
  onChange,
}: TemplateSelectorGridProps): JSX.Element {
  return (
    <SimpleGrid cols={2} spacing="sm">
      {TEMPLATE_OPTIONS.map((option) => {
        const Icon = option.icon;
        const selected = option.slug === value;
        return (
          <UnstyledButton
            key={option.slug}
            onClick={() => onChange(option.slug)}
            aria-pressed={selected}
            className={classes.cardButton}
          >
            <Paper
              withBorder
              radius="md"
              p="sm"
              className={selected ? `${classes.card} ${classes.cardSelected}` : classes.card}
            >
              {selected && (
                <Badge className={classes.selectedBadge} color="blue" circle size="sm">
                  <IconCheck size={12} />
                </Badge>
              )}
              <Icon size={24} className={classes.icon} />
              <Text fw={600} size="sm" mt={6}>
                {option.label}
              </Text>
              <Text size="xs" c="dimmed">
                {option.description}
              </Text>
            </Paper>
          </UnstyledButton>
        );
      })}
    </SimpleGrid>
  );
}
