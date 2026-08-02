import { BadRequestException, Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { MediaService } from '@/media/media.service';
import { PosAnalyticsFilter, PosAnalyticsService } from './pos-analytics.service';

export type PosReportType = 'kpis' | 'revenue-series' | 'cashiers' | 'products' | 'categories' | 'payment-breakdown';
export type PosReportFormat = 'csv' | 'xlsx' | 'pdf';

type ReportTable = { title: string; columns: string[]; rows: (string | number)[][] };

const REPORT_LABELS: Record<PosReportType, string> = {
  kpis: 'Indicateurs clés',
  'revenue-series': 'Chiffre d\'affaires',
  cashiers: 'Performance caissiers',
  products: 'Performance produits',
  categories: 'Performance catégories',
  'payment-breakdown': 'Répartition par moyen de paiement',
};

/** Builds the exportable reports that back the POS analytics screen's
 *  export buttons. Always re-derives the report from the same
 *  `PosAnalyticsService` methods the dashboard itself calls, so an export
 *  can never show numbers the screen didn't already show — no separate
 *  calculation path to drift out of sync. */
@Injectable()
export class PosReportExportService {
  constructor(
    private readonly analytics: PosAnalyticsService,
    private readonly media: MediaService,
  ) {}

  async export(
    reportType: PosReportType,
    format: PosReportFormat,
    filter: PosAnalyticsFilter,
    includeCosts: boolean,
    createdBy: string | null,
  ): Promise<{ mediaId: string }> {
    const table = await this.buildTable(reportType, filter, includeCosts);
    const buffer = format === 'csv' ? this.toCsv(table) : format === 'xlsx' ? await this.toXlsx(table) : await this.toPdf(table);
    const mime = format === 'csv' ? 'text/csv' : format === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/pdf';
    const stamp = filter.from.toISOString().slice(0, 10);
    const upload = await this.media.uploadDocument(buffer, {
      mime,
      filename: `pos-${reportType}-${stamp}.${format}`,
      createdBy,
    });
    return { mediaId: upload.id };
  }

  private async buildTable(reportType: PosReportType, filter: PosAnalyticsFilter, includeCosts: boolean): Promise<ReportTable> {
    switch (reportType) {
      case 'kpis': {
        const kpis = await this.analytics.kpis(filter);
        return {
          title: REPORT_LABELS.kpis,
          columns: ['Indicateur', 'Valeur', 'Période précédente', 'Variation %'],
          rows: Object.values(kpis).map((k) => [k.label, k.value ?? '', 'previousValue' in k ? (k.previousValue ?? '') : '', 'changePercent' in k ? (k.changePercent ?? '') : '']),
        };
      }
      case 'revenue-series': {
        const series = await this.analytics.revenueSeries(filter);
        return {
          title: `${REPORT_LABELS['revenue-series']} (${series.granularity})`,
          columns: ['Période', 'CA (DT)', 'Remises (DT)', 'Tickets', 'Panier moyen (DT)'],
          rows: series.points.map((p) => [p.bucket, p.revenue, p.discounts, p.tickets, p.averageBasket]),
        };
      }
      case 'cashiers': {
        const rows = await this.analytics.cashierPerformance(filter);
        return {
          title: REPORT_LABELS.cashiers,
          columns: ['Caissier', 'Sessions', 'Tickets', 'CA brut (DT)', 'Panier moyen (DT)', 'Remises (DT)', 'Écart de caisse (DT)'],
          rows: rows.map((r) => [r.cashierName, r.sessionCount, r.ticketCount, r.grossRevenue, r.averageBasket, r.discountsGranted, r.cashDifference]),
        };
      }
      case 'products': {
        const rows = await this.analytics.topProducts(filter, { channel: 'all', sort: 'revenue', limit: 200 });
        const columns = ['Produit', 'SKU', 'Quantité vendue', 'Tickets/commandes', 'CA (DT)', 'Remises (DT)'];
        if (includeCosts) columns.push('Coût (DT)', 'Profit (DT)', 'Marge %');
        return {
          title: REPORT_LABELS.products,
          columns,
          rows: rows.map((r) => {
            const base = [r.productName, r.sku ?? '', r.quantitySold, r.transactionCount, r.revenue, r.discounts];
            if (includeCosts) base.push(r.costUnknown ? 'Coût inconnu' : (r.cost ?? ''), r.costUnknown ? '' : (r.profit ?? ''), r.marginPercent ?? '');
            return base;
          }),
        };
      }
      case 'categories': {
        const rows = await this.analytics.topCategories(filter, 'all');
        const columns = ['Catégorie', 'Quantité vendue', 'CA (DT)', '% du CA', 'Meilleur produit'];
        if (includeCosts) columns.push('Coût (DT)', 'Profit (DT)', 'Marge %');
        return {
          title: REPORT_LABELS.categories,
          columns,
          rows: rows.map((r) => {
            const base = [r.categoryName, r.quantitySold, r.revenue, r.percentOfRevenue, r.bestSellingProduct ?? ''];
            if (includeCosts) base.push(r.costUnknown ? 'Coût inconnu' : (r.cost ?? ''), r.costUnknown ? '' : (r.profit ?? ''), r.marginPercent ?? '');
            return base;
          }),
        };
      }
      case 'payment-breakdown': {
        const rows = await this.analytics.paymentBreakdown(filter);
        return {
          title: REPORT_LABELS['payment-breakdown'],
          columns: ['Moyen de paiement', 'Total (DT)', 'Nombre', '% du CA', 'Valeur moyenne (DT)'],
          rows: rows.map((r) => [r.method, r.total, r.count, r.percentOfRevenue, r.averageValue]),
        };
      }
      default:
        throw new BadRequestException('Type de rapport inconnu');
    }
  }

  private toCsv(table: ReportTable): Buffer {
    const escape = (v: string | number) => {
      const s = String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [table.columns.map(escape).join(','), ...table.rows.map((r) => r.map(escape).join(','))];
    return Buffer.from(lines.join('\n'), 'utf-8');
  }

  private async toXlsx(table: ReportTable): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(table.title.slice(0, 31));
    sheet.addRow(table.columns).font = { bold: true };
    for (const row of table.rows) sheet.addRow(row);
    sheet.columns.forEach((col) => { col.width = 22; });
    const arrayBuffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(arrayBuffer);
  }

  private toPdf(table: ReportTable): Promise<Buffer> {
    const doc = new PDFDocument({ size: 'A4', margin: 36 });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    const done = new Promise<Buffer>((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });

    doc.font('Helvetica-Bold').fontSize(14).text(table.title, { align: 'left' });
    doc.moveDown(0.5);
    doc.font('Helvetica').fontSize(8).fillColor('#666666')
      .text(`Généré le ${new Date().toLocaleString('fr-TN', { timeZone: 'Africa/Tunis' })}`);
    doc.moveDown(1);

    const usableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const colWidth = usableWidth / table.columns.length;
    const rowHeight = 18;

    const drawRow = (values: (string | number)[], y: number, bold: boolean) => {
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8.5).fillColor('#111111');
      values.forEach((v, i) => {
        doc.text(String(v), doc.page.margins.left + i * colWidth, y, { width: colWidth - 4, ellipsis: true });
      });
    };

    let y = doc.y;
    drawRow(table.columns, y, true);
    y += rowHeight;
    doc.moveTo(doc.page.margins.left, y - 4).lineTo(doc.page.width - doc.page.margins.right, y - 4).strokeColor('#cccccc').stroke();

    for (const row of table.rows) {
      if (y + rowHeight > doc.page.height - doc.page.margins.bottom) {
        doc.addPage();
        y = doc.page.margins.top;
      }
      drawRow(row, y, false);
      y += rowHeight;
    }

    doc.end();
    return done;
  }
}
