/**
 * Macchina a stati esplicita del ciclo di vita di una Pagina (F01/T5).
 *
 * La mappa delle transizioni è una **costante**, letta esattamente da
 * `docs/business-rules.md` § "Stati di una Pagina e transizioni" (righe
 * 79-84) — non una catena di `if`. Ogni transizione non presente nella mappa
 * è respinta con `400` (SPEC-F01 § Logica di servizio, punto 1).
 */

/** I cinque stati ammessi del ciclo di vita di una Pagina. */
export const PAGE_STATUSES = ['draft', 'review', 'scheduled', 'published', 'archived'] as const;

/** Stato del ciclo di vita di una Pagina. */
export type PageStatus = (typeof PAGE_STATUSES)[number];

/**
 * Transizioni ammesse per stato di partenza — trascritte letteralmente da
 * `business-rules.md`:
 * ```
 * draft     → review | scheduled | published
 * review    → draft | scheduled | published
 * scheduled → draft | published | archived
 * published → draft (nuova bozza, il pubblicato resta online) | archived
 * archived  → draft | published
 * ```
 */
export const PAGE_STATUS_TRANSITIONS: Readonly<Record<PageStatus, readonly PageStatus[]>> =
  Object.freeze({
    draft: Object.freeze<PageStatus[]>(['review', 'scheduled', 'published']),
    review: Object.freeze<PageStatus[]>(['draft', 'scheduled', 'published']),
    scheduled: Object.freeze<PageStatus[]>(['draft', 'published', 'archived']),
    published: Object.freeze<PageStatus[]>(['draft', 'archived']),
    archived: Object.freeze<PageStatus[]>(['draft', 'published']),
  });

/** Vero se `value` è uno dei cinque stati ammessi della macchina a stati. */
export function isPageStatus(value: string): value is PageStatus {
  return (PAGE_STATUSES as readonly string[]).includes(value);
}

/**
 * Vero se la transizione `from -> to` è ammessa dalla macchina a stati.
 * `from` deve essere già uno stato valido (letto dalla riga persistita); `to`
 * è validato qui perché arriva dal payload del client.
 */
export function isTransitionAllowed(from: PageStatus, to: string): to is PageStatus {
  const allowed = PAGE_STATUS_TRANSITIONS[from] as readonly string[];
  return allowed.includes(to);
}

/**
 * Vero se la transizione verso `to` richiede la soglia elevata (`Manager`+,
 * ADR-18 § D3): tutte tranne `review`, che un `User` può eseguire sulla
 * propria riga in `draft` (business-rules.md § Permessi editoriali, "Inviare
 * in revisione").
 */
export function statusTransitionRequiresElevation(to: PageStatus): boolean {
  return to !== 'review';
}

/**
 * Azione di audit log da registrare per una transizione riuscita
 * (SPEC-F01 § Logica di servizio, punto 6: `publish`, `unpublish`, `archive`).
 * Le transizioni non nominate esplicitamente (`draft`↔`review`, ripristino da
 * `archived`) sono comunque tracciate con un'azione generica, per
 * tracciabilità, senza inventare un nome non previsto dalla spec.
 */
export function auditActionForStatusTransition(from: PageStatus, to: PageStatus): string {
  if (to === 'published') {
    return 'pages.publish';
  }
  if (to === 'archived') {
    return 'pages.archive';
  }
  if (to === 'draft' && (from === 'published' || from === 'scheduled')) {
    return 'pages.unpublish';
  }
  return 'pages.status-change';
}
