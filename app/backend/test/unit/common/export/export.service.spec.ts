import { Workbook } from 'exceljs';
import { ExportService } from '../../../../src/common/export/export.service';
import { ExportColumn } from '../../../../src/common/export/export-column.interface';

interface SampleRow extends Record<string, unknown> {
  name: string;
  amount: number;
  createdAt: Date | null;
}

describe('ExportService (unit)', () => {
  let exportService: ExportService;

  const columns: ExportColumn<SampleRow>[] = [
    { header: 'Nome', key: 'name', width: 30 },
    { header: 'Importo', key: 'amount' },
    { header: 'Creato il', key: 'createdAt' },
  ];

  const rows: SampleRow[] = [
    { name: 'Mario Rossi', amount: 120.5, createdAt: new Date('2026-07-23T10:00:00.000Z') },
    { name: 'Luigi Bianchi', amount: 0, createdAt: null },
  ];

  beforeEach(() => {
    exportService = new ExportService();
  });

  describe('toExcelBuffer', () => {
    it('genera un workbook .xlsx leggibile con intestazioni in grassetto e righe corrette', async () => {
      const buffer = await exportService.toExcelBuffer(rows, columns, 'Clienti');

      const workbook = new Workbook();
      // exceljs tipizza load() con un `Buffer` locale (extends ArrayBuffer) incompatibile
      // con il Buffer di Node: bug noto dei type non aggiornati della libreria.
      await workbook.xlsx.load(buffer as any);
      const sheet = workbook.getWorksheet('Clienti');

      expect(sheet).toBeDefined();
      expect(sheet!.getRow(1).getCell(1).value).toBe('Nome');
      expect(sheet!.getRow(1).getCell(2).value).toBe('Importo');
      expect(sheet!.getRow(1).font?.bold).toBe(true);
      expect(sheet!.getRow(2).getCell(1).value).toBe('Mario Rossi');
      expect(sheet!.getRow(2).getCell(2).value).toBe(120.5);
      expect(sheet!.getRow(3).getCell(1).value).toBe('Luigi Bianchi');
    });

    it('genera un workbook valido (sola intestazione) con un array di righe vuoto', async () => {
      const buffer = await exportService.toExcelBuffer([], columns);

      const workbook = new Workbook();
      // any: vedi commento nel test precedente (bug di tipizzazione exceljs load()/Buffer)
      await workbook.xlsx.load(buffer as any);
      const sheet = workbook.getWorksheet('Export');

      expect(sheet).toBeDefined();
      expect(sheet!.rowCount).toBe(1);
      expect(sheet!.getRow(1).getCell(1).value).toBe('Nome');
    });
  });

  describe('toPdfBuffer', () => {
    it('genera un buffer PDF valido (magic bytes %PDF) con titolo', async () => {
      const buffer = await exportService.toPdfBuffer(rows, columns, 'Elenco clienti');

      expect(buffer.subarray(0, 4).toString('ascii')).toBe('%PDF');
      expect(buffer.length).toBeGreaterThan(0);
    });

    it('gestisce celle null/undefined senza sollevare eccezioni', async () => {
      await expect(exportService.toPdfBuffer(rows, columns)).resolves.toBeInstanceOf(Buffer);
    });

    it('genera un PDF valido anche con un array di righe vuoto', async () => {
      const buffer = await exportService.toPdfBuffer([], columns);
      expect(buffer.subarray(0, 4).toString('ascii')).toBe('%PDF');
    });

    it("gestisce correttamente un dataset che forza un'interruzione di pagina", async () => {
      const manyRows: SampleRow[] = Array.from({ length: 80 }, (_, i) => ({
        name: `Cliente ${i}`,
        amount: i,
        createdAt: null,
      }));

      const buffer = await exportService.toPdfBuffer(manyRows, columns);
      expect(buffer.subarray(0, 4).toString('ascii')).toBe('%PDF');
    });
  });
});
