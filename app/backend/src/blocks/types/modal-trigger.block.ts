import { BlockDefinition } from '../block-definition.types';

/**
 * `modalTrigger` — diciannovesimo e ultimo tipo del registro di ADR-57
 * (§ Decisione punto 1/2): a differenza degli altri tre widget di questo
 * gruppo non è una coppia contenitore/voce — il modale ha un'unica regione
 * di contenuto, non un elenco — ma resta un contenitore a `children` reali
 * (non una prop `body` a testo limitato), stessa filosofia estesa dove il
 * problema è lo stesso (contenuto di seconda classe, ADR-57 § 2). Ammesso a
 * `ROOT_ALLOWED` e a `section.children.allow` (ADR-57 § 3).
 *
 * `children.allow` limitato per v1 a `['heading','richText','image','button',
 * 'container']`, stesso principio di `accordionItem`/`tabPanel`/
 * `carouselSlide` (ADR-57 § 2).
 *
 * `triggerLabel` (`plainText`, obbligatoria, `maxLength: 80`): l'etichetta
 * del link `<a href="#modal-{id}">` che apre il modale (tecnica `:target`).
 * `animation` (`'none'|'fade'|'slide-down'`, default `'fade'`): solo
 * presentazione CSS, nessun impatto sulla validazione.
 *
 * L'id di ancora (`modal-{nodeId}`) è **derivato dall'`id` del nodo**, non
 * una prop — non c'è nulla da dichiarare qui, è responsabilità del renderer
 * (`app/public-site`). Nessun focus trap, nessun `aria-modal` dinamico,
 * nessuna chiusura da tastiera Escape — limite del pattern `:target`,
 * dichiarato in ADR-57 § 4, non colmato in questo tipo.
 */
export const modalTriggerBlock: BlockDefinition = {
  type: 'modalTrigger',
  v: 1,
  props: {
    triggerLabel: {
      kind: 'plainText',
      required: true,
      maxLength: 80,
    },
    animation: {
      kind: 'enum',
      required: false,
      values: ['none', 'fade', 'slide-down'],
      default: 'fade',
    },
  },
  children: { allow: ['heading', 'richText', 'image', 'button', 'container'] },
  migrations: [],
  enabled: true,
  meta: {
    label: 'Modale',
    category: 'interattivo',
    icon: 'square-arrow-up',
    props: {
      triggerLabel: { label: 'Etichetta del link', order: 1 },
      animation: {
        label: 'Animazione',
        order: 2,
        help: 'Solo presentazione: nessun JavaScript, tecnica CSS :target.',
      },
    },
  },
};
