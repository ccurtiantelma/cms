/**
 * Layout protetto con AppShell Mantine.
 *
 * Sidebar laterale collassabile (sfondo bianco) con due stati (compatta ~70px solo
 * icone / estesa a `themeConfig.navbarWidth`, personalizzabile dall'Editor
 * tema), branding testuale placeholder
 * "Starter Kit" (nessun logo immagine — ogni progetto che eredita questa
 * base personalizza `brandName`/`logoBox`), voce attiva su sfondo blu
 * placeholder, sezione utente in basso (avatar + help/comprimi/logout).
 * Area contenuto grigio chiaro con card bianca arrotondata che si
 * ridimensiona al toggle della sidebar.
 */
import { useEffect, useRef, type CSSProperties } from 'react';
import {
  AppShell,
  ScrollArea,
  Burger,
  ActionIcon,
  Tooltip,
  Avatar,
  UnstyledButton,
  useComputedColorScheme,
} from '@mantine/core';
import { useDisclosure, useMediaQuery } from '@mantine/hooks';
import {
  IconLogout,
  IconHelp,
  IconLayoutDashboard,
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand,
  IconPalette,
} from '@tabler/icons-react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useThemeColor } from '../hooks/useThemeColor';
import { NotificationsProvider } from '../hooks/useNotifications';
import { formatNavbarWidth } from '../theme';
import ImpersonationBanner from '../components/ImpersonationBanner';
import MfaPromptModal from '../components/MfaPromptModal';
import NotificationBell from '../components/NotificationBell';
import AppTour, { type AppTourRef } from '../components/AppTour';
import { navigationItems } from '../config/navigation';
import { THEME_EDITOR_SECTIONS } from '../config/themeEditorSections';
import { getPageTourSteps } from '../libs/pageTours';
import { AppUserRoles, ROLE_LABELS } from '../types/common.types';
import classes from './LayoutProtected.module.css';

/** Larghezza sidebar nello stato compatto (solo icone), in px — non personalizzabile. */
const NAV_WIDTH_COLLAPSED = 70;

/** Rotta dell'Editor tema (placeholder, ADR-4): sulla sidebar sostituisce le
 * voci di navigazione con le ancore alle sezioni di `THEME_EDITOR_SECTIONS`. */
const THEME_EDITOR_PATH = '/theme-editor';

/**
 * Layout principale per utenti autenticati.
 * Sidebar collassabile a sinistra + area contenuto con card bianca.
 */
export default function LayoutProtected(): JSX.Element {
  const { reconcileThemeFromServer, themeConfig } = useThemeColor();
  // Stato espansione sidebar (desktop) e apertura drawer (mobile). Il default
  // segue `navbarDefaultCollapsed` del tema (anti-FOUC: valore già disponibile
  // sincronicamente da cache/default, vedi ThemeColorProvider) — da qui in poi
  // è solo l'utente a controllarlo con il toggle in fondo alla sidebar.
  const [collapsed, { toggle: toggleCollapsed }] = useDisclosure(
    themeConfig.navbarDefaultCollapsed,
  );
  const [mobileOpened, { toggle: toggleMobile, close: closeMobile }] = useDisclosure(false);
  const isMobile = useMediaQuery('(max-width: 48em)');

  const navigate = useNavigate();
  // Stato MFA dell'utente (da GET /auth/me, recuperato una sola volta da AuthProvider)
  // — determina se mostrare il modal "Proteggi il tuo account".
  const { user, logout, isMfaEnabled } = useAuth();
  const location = useLocation();
  const colorScheme = useComputedColorScheme('light');

  // Riconciliazione tema post-login (ADR-4 §4): questo layout monta solo ad
  // utente autenticato — la cache anti-FOUC già applicata viene riallineata
  // con il server, unica fonte di verità del tema di installazione.
  useEffect(() => {
    void reconcileThemeFromServer();
  }, [reconcileThemeFromServer]);

  // Tour guidato generale.
  const tourRef = useRef<AppTourRef>(null);

  // Su mobile la sidebar è sempre estesa (off-canvas); il collasso vale solo su desktop.
  const isCollapsed = !isMobile && collapsed;
  // `formatNavbarWidth` rispetta l'unità scelta nell'Editor tema (px/em/rem/%, ADR-4 v7);
  // lo stato compatto resta un numero fisso in px, non personalizzabile.
  const navWidth = isCollapsed ? NAV_WIDTH_COLLAPSED : formatNavbarWidth(themeConfig);

  // Stile del bordo destro della sidebar (ADR-4 v5, personalizzabile dall'Editor
  // tema): bordo sottile oppure ombra proiettata di intensità regolabile.
  // Applicato inline (non come variabile CSS `--app-*`) perché, a differenza
  // dei token colore, è un valore strutturale mutuamente esclusivo — stessa
  // scelta già fatta per `navWidth` sopra.
  const navEdgeStyle: CSSProperties =
    themeConfig.navbarEdgeStyle === 'shadow'
      ? { boxShadow: `2px 0 8px rgba(0, 0, 0, ${themeConfig.navbarEdgeShadowIntensity})` }
      : { borderRight: '1px solid var(--app-navbar-border, var(--mantine-color-gray-3))' };

  /** Naviga a una voce e chiude il drawer mobile. */
  const goTo = (path: string): void => {
    navigate(path);
    closeMobile();
  };

  const initials = `${user?.name?.[0] ?? ''}${user?.surname?.[0] ?? ''}`.toUpperCase() || 'U';
  const fullName = user ? `${user.name ?? ''} ${user.surname ?? ''}`.trim() || 'Utente' : 'Utente';
  const roleLabel =
    user?.role !== undefined
      ? (ROLE_LABELS[user.role as keyof typeof ROLE_LABELS] ?? 'Utente')
      : '';

  // Tour contestuale della pagina corrente — la voce "Tour guidato" è visibile
  // solo se la pagina ha un tour registrato in `libs/pageTours.ts`.
  const pageTourSteps = getPageTourSteps(location.pathname);

  // Sull'Editor tema la sidebar mostra le ancore alle sezioni della pagina
  // (non le voci di navigazione): l'ancora attiva segue l'hash dell'URL,
  // aggiornato nativamente dal browser al click su un link `#sezione`.
  const isThemeEditorRoute = location.pathname.startsWith(THEME_EDITOR_PATH);
  const activeSectionKey = location.hash ? location.hash.slice(1) : THEME_EDITOR_SECTIONS[0]?.key;

  /* Voce "Tour guidato" della barra di navigazione — ultima voce, avvia il tour della pagina corrente. */
  const helpButton = (
    <button
      type="button"
      className={isCollapsed ? `${classes.navItem} ${classes.navItemCollapsed}` : classes.navItem}
      onClick={() => tourRef.current?.restart(pageTourSteps)}
      aria-label="Tour guidato"
      data-tour="help-button"
    >
      <span className={classes.navIcon}>
        <IconHelp size={20} />
      </span>
      {!isCollapsed && <span className={classes.navLabel}>Tour guidato</span>}
    </button>
  );

  return (
    <NotificationsProvider>
      <div className={classes.appBg} data-mantine-color-scheme={colorScheme}>
        {isMfaEnabled !== null && <MfaPromptModal isMfaEnabled={isMfaEnabled} />}
        <AppTour ref={tourRef} />
        <ImpersonationBanner />

        {/* Burger flottante: apre la sidebar off-canvas su mobile (nessun header). */}
        <Burger
          className={classes.mobileBurger}
          opened={mobileOpened}
          onClick={toggleMobile}
          hiddenFrom="sm"
          size="sm"
          color="#242424"
          aria-label="Apri menu"
        />

        <AppShell
          navbar={{
            width: navWidth,
            breakpoint: 'sm',
            collapsed: { mobile: !mobileOpened },
          }}
          padding="md"
          classNames={{ navbar: classes.navbar, main: classes.main }}
        >
          <AppShell.Navbar
            data-tour="sidebar-nav"
            className={classes.navbarSurface}
            style={navEdgeStyle}
          >
            {/* Branding — placeholder testuale, nessun logo immagine (vedi CLAUDE.md). */}
            <div className={`${classes.brand} ${isCollapsed ? classes.brandCollapsed : ''}`}>
              <div className={classes.logoBox} aria-hidden="true">
                SK
              </div>
              {!isCollapsed && (
                <div className={classes.brandText}>
                  <span className={classes.brandName}>Starter Kit</span>
                </div>
              )}
            </div>

            {/* Voci di navigazione — sull'Editor tema diventano ancore alle sezioni
              della pagina (vedi `THEME_EDITOR_SECTIONS`), non rotte. */}
            <ScrollArea className={classes.navScroll}>
              {isThemeEditorRoute
                ? THEME_EDITOR_SECTIONS.map((section) => {
                    const Icon = section.icon;
                    const isActive = activeSectionKey === section.key;
                    const itemClass = [
                      classes.navItem,
                      isCollapsed ? classes.navItemCollapsed : '',
                      isActive ? classes.navItemActive : '',
                    ]
                      .filter(Boolean)
                      .join(' ');
                    const anchor = (
                      <a href={`#${section.key}`} className={itemClass} onClick={closeMobile}>
                        <span className={classes.navIcon}>
                          <Icon size={20} />
                        </span>
                        {!isCollapsed && <span className={classes.navLabel}>{section.label}</span>}
                      </a>
                    );
                    return isCollapsed ? (
                      <Tooltip key={section.key} label={section.label} position="right" withArrow>
                        {anchor}
                      </Tooltip>
                    ) : (
                      <div key={section.key}>{anchor}</div>
                    );
                  })
                : navigationItems
                    .filter(
                      (item) =>
                        !item.roles ||
                        (user?.role !== undefined &&
                          item.roles.includes(user.role as AppUserRoles)),
                    )
                    .map((item) => {
                      const Icon = item.icon;
                      const isActive =
                        location.pathname === item.path ||
                        location.pathname.startsWith(`${item.path}/`);
                      const itemClass = [
                        classes.navItem,
                        isCollapsed ? classes.navItemCollapsed : '',
                        isActive ? classes.navItemActive : '',
                      ]
                        .filter(Boolean)
                        .join(' ');
                      const button = (
                        <button type="button" className={itemClass} onClick={() => goTo(item.path)}>
                          <span className={classes.navIcon}>
                            <Icon size={20} />
                          </span>
                          {!isCollapsed && <span className={classes.navLabel}>{item.label}</span>}
                        </button>
                      );
                      return isCollapsed ? (
                        <Tooltip key={item.path} label={item.label} position="right" withArrow>
                          {button}
                        </Tooltip>
                      ) : (
                        <div key={item.path}>{button}</div>
                      );
                    })}
              {/* "Tour guidato" è un'azione (avvia il tour della pagina), non una rotta: resta
                fuori da navigationItems. Visibile solo se la pagina corrente ha un tour contestuale. */}
              {pageTourSteps &&
                (isCollapsed ? (
                  <Tooltip label="Tour guidato" position="right" withArrow>
                    {helpButton}
                  </Tooltip>
                ) : (
                  <div>{helpButton}</div>
                ))}
            </ScrollArea>

            {/* Tasto dell'Editor tema — sopra il profilo utente, solo SuperAdmin,
              variante icon-only a sidebar compressa. Sulla pagina stessa non ha
              senso riproporre il link all'Editor tema: diventa un ritorno
              rapido alla Dashboard. */}
            {user?.role === AppUserRoles.SuperAdmin && (
              <div className={classes.customizerSection}>
                {isCollapsed ? (
                  <Tooltip
                    label={isThemeEditorRoute ? 'Chiudi editor tema' : 'Editor tema'}
                    position="right"
                    withArrow
                  >
                    <button
                      type="button"
                      className={`${classes.navItem} ${classes.navItemCollapsed}`}
                      onClick={() => goTo(isThemeEditorRoute ? '/dashboard' : '/theme-editor')}
                      aria-label={isThemeEditorRoute ? 'Chiudi editor tema' : 'Editor tema'}
                    >
                      <span className={classes.navIcon}>
                        {isThemeEditorRoute ? (
                          <IconLayoutDashboard size={20} />
                        ) : (
                          <IconPalette size={20} />
                        )}
                      </span>
                    </button>
                  </Tooltip>
                ) : (
                  <button
                    type="button"
                    className={classes.navItem}
                    onClick={() => goTo(isThemeEditorRoute ? '/dashboard' : '/theme-editor')}
                    aria-label={isThemeEditorRoute ? 'Chiudi editor tema' : 'Editor tema'}
                  >
                    <span className={classes.navIcon}>
                      {isThemeEditorRoute ? (
                        <IconLayoutDashboard size={20} />
                      ) : (
                        <IconPalette size={20} />
                      )}
                    </span>
                    <span className={classes.navLabel}>
                      {isThemeEditorRoute ? 'Chiudi editor tema' : 'Editor tema'}
                    </span>
                  </button>
                )}
              </div>
            )}

            <div
              className={`${classes.userSection} ${isCollapsed ? classes.userSectionCollapsed : ''}`}
            >
              <UnstyledButton
                onClick={() => goTo('/profile')}
                className={classes.userLink}
                aria-label="Vai al profilo utente"
              >
                <Avatar size={38} radius="md" color="starterPrimary" variant="filled">
                  {initials}
                </Avatar>
                {!isCollapsed && (
                  <div className={classes.userInfo}>
                    <span className={classes.userName}>{fullName}</span>
                    <span className={classes.userRole}>{roleLabel}</span>
                    <span className={classes.userEmail}>{user?.email ?? ''}</span>
                  </div>
                )}
              </UnstyledButton>

              <div
                className={`${classes.userActions} ${isCollapsed ? classes.userActionsCollapsed : ''}`}
              >
                <NotificationBell />
                <Tooltip label={collapsed ? 'Espandi menu' : 'Comprimi menu'} position="top">
                  <ActionIcon
                    className={classes.bottomBtn}
                    variant="transparent"
                    onClick={toggleCollapsed}
                    aria-label="Comprimi menu"
                    visibleFrom="sm"
                  >
                    {collapsed ? (
                      <IconLayoutSidebarLeftExpand
                        size={18}
                        color="var(--app-navbar-text, var(--mantine-color-dark-7))"
                      />
                    ) : (
                      <IconLayoutSidebarLeftCollapse
                        size={18}
                        color="var(--app-navbar-text, var(--mantine-color-dark-7))"
                      />
                    )}
                  </ActionIcon>
                </Tooltip>
                <Tooltip label="Esci" position="top">
                  <ActionIcon
                    className={classes.bottomBtn}
                    variant="transparent"
                    onClick={() => logout()}
                    aria-label="Logout"
                  >
                    <IconLogout
                      size={18}
                      color="var(--app-navbar-text, var(--mantine-color-dark-7))"
                    />
                  </ActionIcon>
                </Tooltip>
              </div>
            </div>
          </AppShell.Navbar>

          <AppShell.Main>
            <Outlet />
          </AppShell.Main>
        </AppShell>
      </div>
    </NotificationsProvider>
  );
}
