import {
  IconAlignLeft,
  IconBox,
  IconForms,
  IconHandClick,
  IconHeading,
  IconInputSearch,
  IconLayoutBoard,
  IconLayoutGrid,
  IconPhoto,
  IconSend,
  type Icon,
} from '@tabler/icons-react';

/**
 * Mappa esplicita `meta.icon` (registro backend, ADR-30 § 1) → componente Tabler. Nessun
 * import dinamico/stringa-to-component: un nome fuori da questa mappa (tipo nuovo senza
 * voce qui, o refuso nel registro) ricade sul fallback generico, mai su un crash a runtime.
 */
const ICON_MAP: Record<string, Icon> = {
  'layout-board': IconLayoutBoard,
  'layout-grid': IconLayoutGrid,
  heading: IconHeading,
  'align-left': IconAlignLeft,
  photo: IconPhoto,
  'hand-click': IconHandClick,
  forms: IconForms,
  'input-search': IconInputSearch,
  send: IconSend,
};

/** Icona generica per un `meta.icon` assente o non presente in {@link ICON_MAP}. */
const FALLBACK_ICON: Icon = IconBox;

/** Componente icona per il `meta.icon` di un tipo di blocco, con fallback generico. */
export function blockIcon(iconName: string | undefined): Icon {
  if (!iconName) return FALLBACK_ICON;
  return ICON_MAP[iconName] ?? FALLBACK_ICON;
}
