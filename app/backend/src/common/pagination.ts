/**
 * Contenitore generico per risposte paginate.
 * Usato da tutti gli endpoint che espongono liste (`?p=&i=&q=&o=&d=`).
 */
export class Pagination<T> {
  items: T[];
  totalItems: number;
  totalPages: number;
  currentPage: number;
  itemsPerPage: number;

  /** Costruisce il contenitore paginato calcolando `totalPages` da `totalItems`/`limit`. */
  constructor(items: T[], totalItems: number, page: number, limit: number) {
    this.items = items;
    this.totalItems = totalItems;
    this.currentPage = page;
    this.itemsPerPage = limit;
    this.totalPages = Math.ceil(totalItems / limit) || 0;
  }
}
