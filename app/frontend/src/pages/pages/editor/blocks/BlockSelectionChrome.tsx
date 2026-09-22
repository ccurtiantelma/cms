/**
 * Cornice visiva di hover/selezione di un blocco (ADR-95): un colore per livello gerarchico
 * (sezione viola, contenitore arancione, widget verde, vedi il modulo CSS); spessore 1px in hover,
 * 2px + ombra in selezione. Renderizzata come overlay assoluto con `pointer-events: none`
 * (vedi `BlockSelectionChrome.module.css`), fuori dal flusso del contenuto: non altera il box
 * model del blocco né gli aggiunge padding/margin.
 */
import styles from './BlockSelectionChrome.module.css';

export type BlockChromeTone = 'section' | 'container' | 'widget';
export type BlockChromeState = 'hover' | 'selected';

interface BlockSelectionChromeProps {
  tone: BlockChromeTone;
  state: BlockChromeState;
}

export default function BlockSelectionChrome({
  tone,
  state,
}: BlockSelectionChromeProps): JSX.Element {
  return (
    <span
      aria-hidden="true"
      data-block-chrome={state}
      data-block-chrome-tone={tone}
      className={`${styles.chrome} ${styles[tone]} ${styles[state]}`}
    />
  );
}
