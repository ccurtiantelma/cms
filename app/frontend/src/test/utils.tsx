/**
 * Helper di render per i test dei componenti: avvolge l'UI nel `MantineProvider`
 * con il tema reale dell'app (necessario per risolvere temi/colori custom).
 */
import type { ReactElement, ReactNode } from 'react';
import { render, type RenderResult } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { buildAppTheme } from '../theme';

function Providers({ children }: { children: ReactNode }): JSX.Element {
  return <MantineProvider theme={buildAppTheme()}>{children}</MantineProvider>;
}

/** Renderizza `ui` dentro i provider applicativi. */
export function renderWithProviders(ui: ReactElement): RenderResult {
  return render(ui, { wrapper: Providers });
}
