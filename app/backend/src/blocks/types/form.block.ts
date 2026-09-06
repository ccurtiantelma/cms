import { BlockDefinition } from '../block-definition.types';

/**
 * `form` — settimo tipo del registro (ADR-46 § 1, RFC-46 D1/D2). Contenitore
 * dedicato: ammette solo `form-field`/`form-submit` come figli diretti, mai
 * un altro `form` annidato (profondità 1 per costruzione, stesso principio
 * di `section`). `formKey` è l'identificatore editoriale **stabile** che
 * collega la composizione pubblicata alla configurazione operativa in
 * `app_settings` (chiave `form:<formKey>:settings`, RFC-46 D2) e agli Invii
 * storici in `form_submissions` — mai l'`id` del nodo, che
 * `duplicateSubtree` rigenera ad ogni duplicazione. Un `formKey` duplicato
 * fra più blocchi `form` (stessa Pagina o Pagine diverse) è ammesso e
 * intenzionale: raggruppa la stessa configurazione di invio (RFC-46 D2).
 * Non ammesso a radice (`ROOT_ALLOWED` invariato, ADR-46 § 1).
 *
 * `successMessage`/`errorMessage` (ADR-60): due prop additive con `default`
 * dichiarato = testo oggi hardcoded in `app/public-site/src/assets/form-submit.js`
 * — nessun bump di `v`. `errorMessage` è il messaggio unico per fallimento
 * HTTP **e** di rete (ADR-60 § Decisione, ADR-60 § Alternative scartate):
 * l'unificazione delle due stringhe distinte odierne è delegata al consumer
 * (`form-submit.js`), non a questo registro.
 */
export const formBlock: BlockDefinition = {
  type: 'form',
  v: 1,
  props: {
    formKey: {
      kind: 'plainText',
      required: true,
      maxLength: 100,
      nonEmpty: true,
    },
    successMessage: {
      kind: 'plainText',
      required: false,
      maxLength: 300,
      default: 'Grazie, il messaggio è stato inviato con successo.',
    },
    errorMessage: {
      kind: 'plainText',
      required: false,
      maxLength: 300,
      default: 'Non è stato possibile inviare il modulo. Controlla i campi compilati e riprova.',
    },
  },
  children: { allow: ['form-field', 'form-submit'] },
  migrations: [],
  enabled: true,
  meta: {
    label: 'Modulo di contatto',
    category: 'form',
    icon: 'forms',
    props: {
      formKey: {
        label: 'Chiave del modulo',
        order: 1,
        help: 'Identificatore stabile del modulo: collega questo blocco alla configurazione dei destinatari (app_settings) e agli Invii storici. Non cambia duplicando il blocco.',
      },
      successMessage: {
        label: 'Messaggio di successo',
        order: 2,
        help: "Mostrato dopo l'invio riuscito del modulo.",
      },
      errorMessage: {
        label: 'Messaggio di errore',
        order: 3,
        help: "Mostrato se l'invio del modulo fallisce (errore del server o di rete).",
      },
    },
  },
};
