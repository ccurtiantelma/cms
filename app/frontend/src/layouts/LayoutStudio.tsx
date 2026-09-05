/**
 * Layout della rotta isolata `/studio/:guid` (ADR-54): shell a piena finestra per l'Editor
 * Visivo a blocchi, fuori da `LayoutProtected` — nessuna sidebar/topbar admin, nessun
 * `ImpersonationBanner`/`MfaPromptModal`/`AppTour`/canale notifiche: quella chrome appartiene
 * solo alla superficie amministrativa standard, non a questa rotta dedicata. Resta dentro
 * `RequireAuth` (`App.tsx`) — l'autenticazione non è chrome, è un guard di rotta.
 *
 * Riallinea comunque col server il `ThemeConfig` dell'installazione
 * (`reconcileThemeFromServer`, stesso hook di `LayoutProtected.tsx`): `EditorCanvas.tsx`
 * legge `themeConfig` da `useThemeColorStore`, e prima d'ora era popolato solo dall'effetto
 * montato in `LayoutProtected` — questa rotta non ci passa più, quindi deve farlo da sé,
 * altrimenti il canvas dipingerebbe con token di tema mancanti o stantii.
 */
import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { useThemeColorStore } from '../hooks/useThemeColor';
import classes from './LayoutStudio.module.css';

/** Shell a piena finestra della rotta Studio — nessuna chrome amministrativa, solo `<Outlet/>`. */
export default function LayoutStudio(): JSX.Element {
  const reconcileThemeFromServer = useThemeColorStore((state) => state.reconcileThemeFromServer);
  useEffect(() => {
    void reconcileThemeFromServer();
  }, [reconcileThemeFromServer]);

  return (
    <div className={classes.root}>
      <Outlet />
    </div>
  );
}
