/**
 * Lettura del registro dei blocchi (`types/blocks.types.ts`, artefatto generato dal backend)
 * per le domande di **contenimento**: quali tipi può ospitare un contenitore, e se un tipo
 * dato è ammesso lì dentro.
 *
 * Esiste per una ragione sola: la palette (che decide cosa si può inserire) e lo store (che
 * decide dove si può spostare un nodo già esistente) devono rispondere alla stessa domanda
 * con la stessa regola. Due copie della stessa condizione divergono, e il modo in cui
 * divergerebbero è il peggiore possibile — un'operazione che l'editor consente e il server
 * rifiuta con un `400` a salvataggio già tentato.
 *
 * L'autorità resta comunque il validatore server-side: qui si anticipa il suo verdetto per
 * non offrire un'azione che verrà respinta, mai per sostituirlo.
 */
import { BLOCK_TYPES, ROOT_ALLOWED } from '../../../types/blocks.types';

/**
 * Tipi ammessi come figli del contenitore indicato: `ROOT_ALLOWED` alla radice
 * (`parentType === undefined`), `childrenAllow` del descrittore altrimenti. Un tipo di
 * contenitore sconosciuto al registro non ammette nulla — non è una foglia con figli
 * liberi, è un tipo che questo frontend non conosce.
 */
export function allowedChildTypes(parentType: string | undefined): readonly string[] {
  if (parentType === undefined) return ROOT_ALLOWED;
  return BLOCK_TYPES.find((entry) => entry.type === parentType)?.childrenAllow ?? [];
}

/**
 * `true` se un nodo di tipo `type` può stare fra i figli di un contenitore di tipo
 * `parentType` (`undefined` = radice dell'albero). Non replica gli altri filtri della
 * palette (`enabled`, `deprecated`, `minRole`): quelli riguardano l'**inserimento** di un
 * blocco nuovo, mentre uno spostamento agisce su un nodo che nell'albero c'è già — un tipo
 * disabilitato dopo che il contenuto è stato scritto resta spostabile, altrimenti si
 * bloccherebbe la riorganizzazione di una pagina esistente senza alcun guadagno.
 */
export function canContainType(parentType: string | undefined, type: string): boolean {
  return allowedChildTypes(parentType).includes(type);
}
