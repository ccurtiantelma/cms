/**
 * Root component: routing applicativo (React Router v7).
 * Riferimento: CONTRACT.md — "Frontend — convenzioni da rispettare".
 */
import { Suspense, lazy, type ReactNode } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Center, Loader } from '@mantine/core';
import ErrorBoundary from './components/ErrorBoundary';
import PageNotFound from './components/PageNotFound';
import PageServerError from './components/PageServerError';
import LayoutProtected from './layouts/LayoutProtected';
import { getToken, homePathForRole } from './utils/auth.utils';
import { useAuthInit, useAuthStore } from './hooks/useAuth';
import { AppUserRoles } from './types/common.types';

/** Ruoli ammessi sulle rotte di amministrazione (`/users`). */
const ADMIN_ROLES = [AppUserRoles.SuperAdmin, AppUserRoles.Admin];

/**
 * Ruoli ammessi sulle Sezioni Globali (`/global-sections`, ADR-40): soglia
 * `Manager`+, la stessa applicata dal `GuardManager` del controller admin.
 * Nessuna ownership per riga — non esiste la nozione di "proprie" Sezioni Globali.
 */
const GLOBAL_SECTIONS_ROLES = [AppUserRoles.SuperAdmin, AppUserRoles.Admin, AppUserRoles.Manager];

const PageLogin = lazy(() => import('./pages/auth/PageLogin'));
const PageSetPassword = lazy(() => import('./pages/auth/PageSetPassword'));
const PageForgottenPassword = lazy(() => import('./pages/auth/PageForgottenPassword'));
const PageDashboard = lazy(() => import('./pages/dashboard/PageDashboard'));
const PageProfile = lazy(() => import('./pages/profile/PageProfile'));
const PagePages = lazy(() => import('./pages/pages/PagePages'));
const PagePageDetail = lazy(() => import('./pages/pages/PagePageDetail'));
const PageUsers = lazy(() => import('./pages/admin/PageUsers'));
const PageThemeEditor = lazy(() => import('./pages/theme-editor/PageThemeEditor'));
const PageGlobalSections = lazy(() => import('./pages/global-sections/PageGlobalSections'));
const PageGlobalSectionBuilder = lazy(
  () => import('./pages/global-sections/PageGlobalSectionBuilder'),
);

/** Fallback mostrato durante il caricamento dei chunk delle pagine lazy. */
function PageLoadingFallback(): JSX.Element {
  return (
    <Center h="100vh">
      <Loader />
    </Center>
  );
}

/** Guard per rotte protette: reindirizza a /login se non autenticato. */
function RequireAuth({ children }: { children: ReactNode }): JSX.Element {
  const token = getToken();
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

/** Guard per rotte pubbliche: reindirizza a /dashboard se già autenticato. */
function PublicOnly({ children }: { children: ReactNode }): JSX.Element {
  const token = getToken();
  if (token) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

/**
 * Guard di autorizzazione per area: ammette solo i ruoli in `allowed`, altrimenti
 * reindirizza alla home dell'utente (`homePathForRole`). Difesa in profondità
 * lato client: la barriera reale resta il guard backend (`GuardAdmin`/`GuardSuperAdmin`).
 * @param allowed Valori enum dei ruoli ammessi nell'area.
 */
function RequireRole({
  allowed,
  children,
}: {
  allowed: AppUserRoles[];
  children: ReactNode;
}): JSX.Element {
  const user = useAuthStore((state) => state.user);
  const isLoading = useAuthStore((state) => state.isLoading);
  // Senza dati utente non possiamo decidere il ruolo. Se sono ancora in caricamento
  // (GET /auth/me in corso, nessuna cache locale) mostriamo il loader per evitare un
  // flash della shell sbagliata; se il caricamento è finito senza utente il token non
  // è valido → login.
  if (!user) {
    if (isLoading) return <PageLoadingFallback />;
    return <Navigate to="/login" replace />;
  }
  if (!allowed.includes(user.role as AppUserRoles)) {
    return <Navigate to={homePathForRole(user.role)} replace />;
  }
  return <>{children}</>;
}

export default function App(): JSX.Element {
  // Sostituisce il vecchio <AuthProvider>: avvia la GET /auth/me una sola volta
  // per sessione dell'app (vedi hooks/useAuth.ts).
  useAuthInit();

  return (
    <ErrorBoundary>
      <Suspense fallback={<PageLoadingFallback />}>
        <Routes>
          {/* Rotte pubbliche */}
          <Route
            path="/login"
            element={
              <PublicOnly>
                <PageLogin />
              </PublicOnly>
            }
          />
          <Route path="/forgot-password" element={<PageForgottenPassword />} />
          <Route path="/activate" element={<PageSetPassword />} />
          <Route path="/reset-password" element={<PageSetPassword />} />
          <Route path="/server-error" element={<PageServerError />} />

          {/* Rotte protette — unico layout applicativo. */}
          <Route
            path="/"
            element={
              <RequireAuth>
                <LayoutProtected />
              </RequireAuth>
            }
          >
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<PageDashboard />} />
            <Route path="profile" element={<PageProfile />} />
            {/* Nessun `RequireRole`: ownership per riga (ADR-18) è applicata dal backend. */}
            <Route path="pages" element={<PagePages />} />
            <Route path="pages/:guid" element={<PagePageDetail />} />
            <Route
              path="global-sections"
              element={
                <RequireRole allowed={GLOBAL_SECTIONS_ROLES}>
                  <PageGlobalSections />
                </RequireRole>
              }
            />
            <Route
              path="global-sections/:guid/builder"
              element={
                <RequireRole allowed={GLOBAL_SECTIONS_ROLES}>
                  <PageGlobalSectionBuilder />
                </RequireRole>
              }
            />
            <Route
              path="users"
              element={
                <RequireRole allowed={ADMIN_ROLES}>
                  <PageUsers />
                </RequireRole>
              }
            />
            <Route
              path="theme-editor"
              element={
                <RequireRole allowed={[AppUserRoles.SuperAdmin]}>
                  <PageThemeEditor />
                </RequireRole>
              }
            />
          </Route>

          <Route path="*" element={<PageNotFound />} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}
