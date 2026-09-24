import { Injectable } from '@nestjs/common';
import { IsIn, IsOptional, IsString } from 'class-validator';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { MediaService } from '@/media/media.service';
import { DeliveryRevenueService } from './delivery-revenue.service';

export class DeliveryRevenueExportDto {
  @IsIn(['csv', 'xlsx', 'pdf']) format!: 'csv' | 'xlsx' | 'pdf';
  @IsOptional() @IsString() preset?: string;
  @IsOptional() @IsString() from?: string;
  @IsOptional() @IsString() to?: string;
}

type ReportTable = { title: string; columns: string[]; rows: (string | number)[][] };

function money(minor: number): number {
  return Math.round((minor / 1000) * 1000) / 1000;
}

/** Always re-derives its numbers from DeliveryRevenueService's own
 *  aggregations — same reasoning as pos-report-export.service.ts: an
 *  export can never show figures the on-screen page didn't already show. */
@Injectable()
export class DeliveryRevenueExportService {
  constructor(
    private readonly revenue: DeliveryRevenueService,
    private readonly media: MediaService,
  ) {}

  async export(dto: DeliveryRevenueExportDto): Promise<{ mediaId: string }> {
    const preset = dto.preset as never;
    const range = this.revenue.resolveRange(preset, dto.from, dto.to);
    const [summary, byDay, byProvider] = await Promise.all([
      this.revenue.summary(preset, dto.from, dto.to),
      this.revenue.byDay(preset, dto.from, dto.to),
      this.revenue.byProvider(preset, dto.from, dto.to),
    ]);

    const tables: ReportTable[] = [
      {
        title: `Chiffre d'affaires commandes — ${range.from} au ${range.to}`,
        columns: ['Indicateur', 'Valeur'],
        rows: [
          ['Période', `${range.from} → ${range.to}`],
          ['CA brut livré (DT)', money(summary.grossRevenueMinor)],
          ['Retours (DT)', money(summary.returnsRevenueMinor)],
          ['CA net (DT)', money(summary.netRevenueMinor)],
          ['Colis livrés', summary.deliveredCount],
          ['Colis retournés', summary.returnedCount],
          ['Panier moyen (DT)', money(summary.averageBasketMinor)],
          ['CA produits (DT)', money(summary.productRevenueMinor)],
          ['Frais de livraison (DT)', money(summary.shippingRevenueMinor)],
        ],
      },
      {
        title: 'Répartition par jour',
        columns: ['Date', 'Colis livrés', 'Chiffre d\'affaires (DT)'],
        rows: byDay.map((d) => [d.date, d.deliveredCount, money(d.revenueMinor)]),
      },
      {
        title: 'Répartition par transporteur',
        columns: ['Transporteur', 'Colis livrés', 'Chiffre d\'affaires (DT)'],
        rows: byProvider.map((p) => [p.provider, p.deliveredCount, money(p.revenueMinor)]),
      },
    ];

    const buffer = dto.format === 'csv' ? this.toCsv(tables) : dto.format === 'xlsx' ? await this.toXlsx(tables) : await this.toPdf(tables);
    const mime = dto.format === 'csv' ? 'text/csv' : dto.format === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/pdf';
    const upload = await this.media.uploadDocument(buffer, {
      mime,
      filename: `chiffre-affaires-commandes-${range.from}-${range.to}.${dto.format}`,
      createdBy: null,
    });
    return { mediaId: upload.id };
  }

  private toCsv(tables: ReportTable[]): Buffer {
    const escape = (v: string | number) => {
      const s = String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const blocks = tables.map((t) => [t.title, t.columns.map(escape).join(','), ...t.rows.map((r) => r.map(escape).join(','))].join('\n'));
    return Buffer.from(blocks.join('\n\n'), 'utf-8');
  }

  private async toXlsx(tables: ReportTable[]): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    for (const table of tables) {
      const sheet = workbook.addWorksheet(table.title.slice(0, 31));
      sheet.addRow(table.columns).font = { bold: true };
      for (const row of table.rows) sheet.addRow(row);
      sheet.columns.forEach((col) => { col.width = 26; });
    }
    const arrayBuffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(arrayBuffer);
  }

  private toPdf(tables: ReportTable[]): Promise<Buffer> {
    const doc = new PDFDocument({ size: 'A4', margin: 36 });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    const done = new Promise<Buffer>((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });

    const usableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const rowHeight = 18;

    const drawRow = (values: (string | number)[], y: number, bold: boolean, colWidth: number) => {
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8.5).fillColor('#111111');
      values.forEach((v, i) => doc.text(String(v), doc.page.margins.left + i * colWidth, y, { width: colWidth - 4, ellipsis: true }));
    };

    tables.forEach((table, tableIndex) => {
      if (tableIndex > 0) doc.moveDown(1.5);
      doc.font('Helvetica-Bold').fontSize(12).fillColor('#111111').text(table.title, { align: 'left' });
      doc.moveDown(0.5);
      const colWidth = usableWidth / table.columns.length;
      let y = doc.y;
      drawRow(table.columns, y, true, colWidth);
      y += rowHeight;
      doc.moveTo(doc.page.margins.left, y - 4).lineTo(doc.page.width - doc.page.margins.right, y - 4).strokeColor('#cccccc').stroke();
      for (const row of table.rows) {
        if (y + rowHeight > doc.page.height - doc.page.margins.bottom) {
          doc.addPage();
          y = doc.page.margins.top;
        }
        drawRow(row, y, false, colWidth);
        y += rowHeight;
      }
      doc.y = y;
    });

    doc.end();
    return done;
  }
}
