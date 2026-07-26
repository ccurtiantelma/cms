import { Injectable, Logger } from '@nestjs/common';
import { Workbook } from 'exceljs';
import * as PDFDocument from 'pdfkit';
import { ExportColumn } from './export-column.interface';

/**
 * Serializzazione di liste/report in Excel o PDF (ADR-10). Riceve solo righe
 * già filtrate/autorizzate (`Utils.applyScopeFilter`) e definizione colonne
 * dal modulo applicativo chiamante — non conosce alcuna entità di dominio,
 * non esegue query proprie, non espone un endpoint proprio.
 */
@Injectable()
export class ExportService {
  private readonly logger = new Logger(ExportService.name);

  /**
   * Genera un file Excel (.xlsx) da righe e colonne già pronte.
   * @param rows Righe da esportare, già filtrate/autorizzate dal chiamante.
   * @param columns Intestazioni e chiavi da esportare, nell'ordine desiderato.
   * @param sheetName Nome del foglio Excel (default `Export`).
   */
  async toExcelBuffer<T extends Record<string, unknown>>(
    rows: T[],
    columns: ExportColumn<T>[],
    sheetName = 'Export',
  ): Promise<Buffer> {
    const workbook = new Workbook();
    const sheet = workbook.addWorksheet(sheetName);
    sheet.columns = columns.map((column) => ({
      header: column.header,
      key: String(column.key),
      width: column.width ?? 20,
    }));
    rows.forEach((row) => sheet.addRow(row));
    sheet.getRow(1).font = { bold: true };

    const arrayBuffer = await workbook.xlsx.writeBuffer();
    this.logger.log(`Export Excel generato: ${rows.length} righe, ${columns.length} colonne`);
    return Buffer.from(arrayBuffer);
  }

  /**
   * Genera un report PDF tabellare semplice (nessun rendering HTML/CSS — ADR-10:
   * layout grafici complessi restano fuori scope, valutare Puppeteer in un ADR
   * di superseding dedicato se un progetto verticale ne avrà davvero bisogno).
   * @param rows Righe da esportare, già filtrate/autorizzate dal chiamante.
   * @param columns Intestazioni e chiavi da esportare, nell'ordine desiderato.
   * @param title Titolo opzionale stampato in cima al documento.
   */
  async toPdfBuffer<T extends Record<string, unknown>>(
    rows: T[],
    columns: ExportColumn<T>[],
    title?: string,
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 40, size: 'A4', layout: 'landscape' });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', (error: Error) => reject(error));

      if (title) {
        doc.fontSize(14).font('Helvetica-Bold').text(title);
        doc.moveDown();
      }

      const usableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
      const columnWidth = usableWidth / columns.length;

      this.drawRow(
        doc,
        columns.map((column) => column.header),
        columnWidth,
        true,
      );

      rows.forEach((row) => {
        if (doc.y > doc.page.height - doc.page.margins.bottom - 20) {
          doc.addPage();
        }
        this.drawRow(
          doc,
          columns.map((column) => this.formatCell(row[column.key])),
          columnWidth,
          false,
        );
      });

      this.logger.log(`Export PDF generato: ${rows.length} righe, ${columns.length} colonne`);
      doc.end();
    });
  }

  /** Stampa una riga (intestazione o dati) allineando ogni colonna alla stessa larghezza. */
  private drawRow(
    doc: PDFKit.PDFDocument,
    cells: string[],
    columnWidth: number,
    isHeader: boolean,
  ): void {
    doc.font(isHeader ? 'Helvetica-Bold' : 'Helvetica').fontSize(9);
    const y = doc.y;
    let x = doc.page.margins.left;
    cells.forEach((cell) => {
      doc.text(cell, x, y, { width: columnWidth });
      x += columnWidth;
    });
    doc.moveDown();
  }

  /** Converte un valore di cella in stringa stampabile, gestendo null/undefined/Date. */
  private formatCell(value: unknown): string {
    if (value === null || value === undefined) return '';
    if (value instanceof Date) return value.toLocaleDateString('it-IT');
    return String(value);
  }
}
