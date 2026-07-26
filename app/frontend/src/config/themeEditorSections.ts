/**
 * Sezioni dell'Editor tema (ADR-4, contratto v4): unica fonte di verità usata
 * da `PageThemeEditor` (sezioni impilate con demo reale + pannello di
 * modifica) e da `LayoutProtected` (ancore della sidebar su questa rotta).
 */
import {
  IconAppWindow,
  IconClick,
  IconForms,
  IconId,
  IconLayoutSidebar,
  IconLetterCase,
  IconPalette,
  IconRuler2,
  IconTable,
  IconTypography,
  type Icon as TablerIcon,
} from '@tabler/icons-react';
import type { ThemeTokenName } from '../theme';

/** Controllo colore di una sezione: token del ThemeConfig + etichetta utente. */
export interface ThemeEditorTokenControl {
  token: ThemeTokenName;
  label: string;
}

/** Sezione dell'Editor tema: voce della lista con anteprima + pannello di modifica. */
export interface ThemeEditorSection {
  key: string;
  label: string;
  description: string;
  icon: TablerIcon;
  /** Token hex per-scheme mostrati come ColorInput; `null` per sezioni con soli controlli dedicati. */
  tokens: ThemeEditorTokenControl[] | null;
  /** Se true la sezione modifica solo lo scheme selezionato; se false vale per entrambi (Navbar). */
  scopedByScheme: boolean;
}

export const THEME_EDITOR_SECTIONS: ThemeEditorSection[] = [
  {
    key: 'primary',
    label: 'Generale',
    description:
      'Palette primaria (nativa o custom con sfumature generate), shade per scheme, raggio di default, sfondo pagina e comportamento globale (gradiente).',
    icon: IconPalette,
    tokens: null,
    scopedByScheme: false,
  },
  {
    key: 'typography',
    label: 'Tipografia',
    description:
      'Font di testo e titoli (stack di sistema whitelisted), dimensioni e interlinee xs–xl, dimensione e interlinea di ogni livello h1–h6.',
    icon: IconTypography,
    tokens: null,
    scopedByScheme: false,
  },
  {
    key: 'scales',
    label: 'Dimensioni e ombre',
    description:
      'Scala di spaziatura, valori dei radius token e ombre xs–xl (offset, sfocatura, espansione, opacità).',
    icon: IconRuler2,
    tokens: null,
    scopedByScheme: false,
  },
  {
    key: 'buttons',
    label: 'Bottoni e badge',
    description: 'Variant, dimensione e radius di default per Button, ActionIcon e Badge.',
    icon: IconClick,
    tokens: null,
    scopedByScheme: false,
  },
  {
    key: 'inputs',
    label: 'Campi input',
    description:
      'Variant, dimensione e radius di default dei campi (TextInput, PasswordInput, Select, NumberInput).',
    icon: IconForms,
    tokens: null,
    scopedByScheme: false,
  },
  {
    key: 'card',
    label: 'Card',
    description:
      'Sfondo e bordo delle card di contenuto, più ombra/radius/bordo/padding di default delle superfici Paper e Card.',
    icon: IconId,
    tokens: [
      { token: 'cardBg', label: 'Sfondo card' },
      { token: 'cardBorder', label: 'Bordo card' },
    ],
    scopedByScheme: true,
  },
  {
    key: 'text',
    label: 'Testi',
    description:
      'Colore del testo principale e secondario/dimmed, più il colore di ogni titolo h1–h6 (dimensione e interlinea si modificano in "Tipografia").',
    icon: IconLetterCase,
    tokens: [
      { token: 'textPrimary', label: 'Testo principale' },
      { token: 'textSecondary', label: 'Testo secondario' },
      { token: 'headingH1', label: 'Colore H1' },
      { token: 'headingH2', label: 'Colore H2' },
      { token: 'headingH3', label: 'Colore H3' },
      { token: 'headingH4', label: 'Colore H4' },
      { token: 'headingH5', label: 'Colore H5' },
      { token: 'headingH6', label: 'Colore H6' },
    ],
    scopedByScheme: true,
  },
  {
    key: 'navbar',
    label: 'Navbar',
    description:
      'Larghezza e stato di apertura di default, più sfondo, testi, hover e bordi della sidebar — vale per entrambi gli scheme. Anteprima nella sidebar reale a fianco, non qui al centro.',
    icon: IconLayoutSidebar,
    // Pannello dedicato (`PanelNavbar`): larghezza/stato aperto-chiuso non sono
    // token colore per-scheme, quindi non passano dal loop generico di ColorInput.
    tokens: null,
    scopedByScheme: false,
  },
  {
    key: 'table',
    label: 'Tabelle',
    description:
      'Righe alternate, evidenziazione al passaggio, bordi esterni/colonna e spaziatura verticale delle tabelle.',
    icon: IconTable,
    tokens: null,
    scopedByScheme: false,
  },
  {
    key: 'overlays',
    label: 'Modali e overlay',
    description:
      'Radius, ombra, padding e blur overlay di modali e drawer; freccia e radius dei tooltip; tipo di loader.',
    icon: IconAppWindow,
    tokens: null,
    scopedByScheme: false,
  },
];
