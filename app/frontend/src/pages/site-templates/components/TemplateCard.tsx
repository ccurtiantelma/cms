/**
 * Card di un Template di tema nella griglia della Dashboard "Parti del Sito"
 * (RFC-40 Opzione B, restyle Elementor Pro Theme Builder). Sola presentazione
 * + menu contestuale: ogni azione è delegata al chiamante (`PageSiteTemplates`),
 * che decide come aprirla (modale, navigazione, conferma) — questa card non
 * tocca lo store né i service.
 */
import { ActionIcon, Badge, Group, Menu, Text, Tooltip } from '@mantine/core';
import {
  IconAdjustments,
  IconCopy,
  IconDotsVertical,
  IconFileText,
  IconRepeat,
  IconSearch,
  IconSquareRoundedX,
  IconTrash,
  IconWand,
} from '@tabler/icons-react';
import {
  SITE_TEMPLATE_TYPE_LABELS,
  type SiteTemplate,
  type SiteTemplateType,
} from '../../../types/site-templates.types';
import classes from './TemplateCard.module.css';

interface TemplateCardProps {
  template: SiteTemplate;
  onEdit: (template: SiteTemplate) => void;
  onDisplayConditions: (template: SiteTemplate) => void;
  onDuplicate: (template: SiteTemplate) => void;
  onDelete: (template: SiteTemplate) => void;
}

/** Icona schematica del mockup di anteprima, per tipo di Template. */
const MOCKUP_ICONS: Record<SiteTemplateType, typeof IconFileText> = {
  single_page: IconFileText,
  search_results: IconSearch,
  loop_item: IconRepeat,
  error_404: IconSquareRoundedX,
  single_post: IconFileText,
  archive: IconRepeat,
};

/** Mockup schematico del layout: barra header, righe di contenuto, barra footer — variano per tipo. */
function TemplatePreview({ type }: { type: SiteTemplateType }): JSX.Element {
  const Icon = MOCKUP_ICONS[type];
  return (
    <div className={classes.preview}>
      <div className={classes.mockupHeader} />
      <div className={classes.mockupBody}>
        {type === 'loop_item' ? (
          <div className={classes.mockupLoopGrid}>
            <span />
            <span />
            <span />
            <span />
          </div>
        ) : type === 'search_results' ? (
          <div className={classes.mockupList}>
            <span />
            <span />
            <span />
          </div>
        ) : (
          <>
            <div className={classes.mockupLine} data-w="80" />
            <div className={classes.mockupLine} data-w="60" />
            <div className={classes.mockupLine} data-w="70" />
          </>
        )}
      </div>
      <div className={classes.mockupFooter} />
      <Icon className={classes.mockupIcon} size={28} stroke={1.5} />
    </div>
  );
}

/** Card singola della griglia "Parti globali del tuo sito". */
export default function TemplateCard({
  template,
  onEdit,
  onDisplayConditions,
  onDuplicate,
  onDelete,
}: TemplateCardProps): JSX.Element {
  return (
    <div className={classes.card}>
      <button
        type="button"
        className={classes.previewButton}
        aria-label={`Modifica ${template.title} nell'Editor`}
        onClick={() => onEdit(template)}
      >
        <TemplatePreview type={template.type} />
      </button>

      <div className={classes.footer}>
        <div className={classes.footerMain}>
          <Tooltip label={template.isPublished ? 'Pubblicato' : 'Bozza'} withArrow>
            <span
              className={classes.statusDot}
              data-published={template.isPublished}
              aria-label={template.isPublished ? 'Pubblicato' : 'Bozza'}
            />
          </Tooltip>
          <Text fw={600} size="sm" truncate="end" className={classes.title}>
            {template.title}
          </Text>
        </div>

        <Menu shadow="md" position="bottom-end" withinPortal>
          <Menu.Target>
            <ActionIcon variant="subtle" color="gray" radius="md" aria-label="Azioni Template">
              <IconDotsVertical size={18} />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item leftSection={<IconWand size={14} />} onClick={() => onEdit(template)}>
              Modifica nell&apos;Editor
            </Menu.Item>
            <Menu.Item
              leftSection={<IconAdjustments size={14} />}
              onClick={() => onDisplayConditions(template)}
            >
              Condizioni di visualizzazione
            </Menu.Item>
            <Menu.Item leftSection={<IconCopy size={14} />} onClick={() => onDuplicate(template)}>
              Duplica
            </Menu.Item>
            <Menu.Divider />
            <Menu.Item
              color="red"
              leftSection={<IconTrash size={14} />}
              onClick={() => onDelete(template)}
            >
              Elimina
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </div>

      <Group gap={6} className={classes.badges}>
        <Badge size="sm" variant="light" color="blue">
          {SITE_TEMPLATE_TYPE_LABELS[template.type]}
        </Badge>
        <Badge size="sm" variant="outline" color="gray">
          {template.language.toUpperCase()}
        </Badge>
      </Group>
    </div>
  );
}
