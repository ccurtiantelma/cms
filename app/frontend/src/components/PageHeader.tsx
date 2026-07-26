/**
 * Intestazione riutilizzabile delle pagine: breadcrumb, titolo grande,
 * sottotitolo e, opzionalmente, un blocco di KPI allineato a destra
 * (numeri grandi in grassetto + etichetta minuscola maiuscoletta).
 *
 * Usata in cima alle pagine elenco. Lo slot KPI è generico: la pagina
 * decide cosa mostrare.
 */
import { Anchor, Text, Title } from '@mantine/core';
import { IconChevronRight, type Icon as TablerIcon } from '@tabler/icons-react';
import classes from './PageHeader.module.css';

/** Voce di breadcrumb; `href` la rende cliccabile, l'ultima voce è evidenziata. */
export interface PageHeaderCrumb {
  label: string;
  href?: string;
}

/** Singolo indicatore KPI mostrato a destra dell'intestazione. */
export interface PageHeaderKpi {
  /** Valore numerico/testuale grande in grassetto. */
  value: string | number;
  /** Etichetta breve (resa maiuscola). */
  label: string;
  /** Icona opzionale mostrata nel badge della card KPI. */
  icon?: TablerIcon;
}

interface PageHeaderProps {
  /** Percorso breadcrumb (es. ["Amministrazione", "Utenti"]). */
  breadcrumbs: PageHeaderCrumb[];
  /** Titolo principale della pagina. */
  title: string;
  /** Sottotitolo descrittivo opzionale. */
  subtitle?: string;
  /** KPI opzionali allineati a destra. */
  kpis?: PageHeaderKpi[];
}

/** Intestazione di pagina con breadcrumb, titolo, sottotitolo e KPI. */
export default function PageHeader({
  breadcrumbs,
  title,
  subtitle,
  kpis,
}: PageHeaderProps): JSX.Element {
  return (
    <div className={classes.header}>
      <div className={classes.headingCol}>
        <nav className={classes.breadcrumbs} aria-label="breadcrumb">
          {breadcrumbs.map((crumb, index) => {
            const isLast = index === breadcrumbs.length - 1;
            return (
              <span key={`${crumb.label}-${index}`} className={classes.crumbWrap}>
                {crumb.href && !isLast ? (
                  <Anchor className={classes.crumb} href={crumb.href}>
                    {crumb.label}
                  </Anchor>
                ) : (
                  <span className={isLast ? classes.crumbActive : classes.crumb}>
                    {crumb.label}
                  </span>
                )}
                {!isLast && <IconChevronRight size={14} className={classes.crumbSep} />}
              </span>
            );
          })}
        </nav>

        <Title order={1} className={classes.title}>
          {title}
        </Title>
        {subtitle && (
          <Text className={classes.subtitle} c="dimmed">
            {subtitle}
          </Text>
        )}
      </div>

      {kpis && kpis.length > 0 && (
        <div className={classes.kpis} data-tour="page-kpis">
          {kpis.map((kpi) => {
            const Icon = kpi.icon;
            return (
              <div key={kpi.label} className={classes.kpi}>
                {Icon && (
                  <span className={classes.kpiIcon}>
                    <Icon size={20} />
                  </span>
                )}
                <span className={classes.kpiText}>
                  <span className={classes.kpiValue}>{kpi.value}</span>
                  <span className={classes.kpiLabel}>{kpi.label}</span>
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
