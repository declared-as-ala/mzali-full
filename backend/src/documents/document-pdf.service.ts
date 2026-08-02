import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import type { CompanySnapshot, CustomerSnapshot, DocumentLine } from '@contracts';

export type DocumentPdfInput = {
  title: string; // "DEVIS" | "FACTURE" | "FACTURE PROFORMA" | "AVOIR"
  number: string;
  issueDate: Date;
  dueOrExpiryDate: Date | null;
  dueOrExpiryLabel: string; // "Validité" | "Échéance"
  company: CompanySnapshot;
  customer: CustomerSnapshot;
  lines: DocumentLine[];
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  timbreFiscalMinor?: number;
  shippingMinor: number;
  totalMinor: number;
  notes: string | null;
  terms: string | null;
};

// ── Brand palette (Pure Strong Blue theme across all document types) ─────────
const BRAND       = '#1a2ee8'; // primary deep blue
const BRAND_DARK  = '#0f1fa0'; // dark blue accent
const BRAND_BG    = '#eef0fd'; // subtle light blue card background
const WHITE       = '#ffffff';
const INK_900     = '#111827';
const INK_700     = '#374151';
const INK_500     = '#6b7280';
const INK_200     = '#e5e7eb';
const INK_100     = '#f3f4f6';
const INK_50      = '#f9fafb';

// ── Layout constants ──────────────────────────────────────────────────────────
const PL = 48;          // page left margin
const PR = 547;         // page right edge
const CW = PR - PL;    // content width (499)
const PAGE_W  = 595;
const PAGE_H  = 842;

function fmt(minor: number): string {
  return `${(minor / 1000).toFixed(3)} DT`;
}

function clampText(text: string, maxLen = 60): string {
  return text.length > maxLen ? text.slice(0, maxLen - 1) + '…' : text;
}

/**
 * Shared renderer for quotes (devis), invoices (facture), proformas, and credit notes (avoir).
 * Unified under the strong primary BLUE corporate design system.
 */
@Injectable()
export class DocumentPdfService {
  async render(input: DocumentPdfInput): Promise<Buffer> {
    const doc = new PDFDocument({ margin: 0, size: 'A4' });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    const done = new Promise<Buffer>((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });

    const accent   = BRAND;
    const accentBg = BRAND_BG;

    // ── Decorative corner band (top-right) ─────────────────────────────────
    doc.save();
    doc.rect(PAGE_W - 80, 0, 80, 80).clip();
    doc.rect(PAGE_W - 110, -30, 180, 180).rotate(-45, { origin: [PAGE_W - 30, 40] });
    doc.fill(accent);
    doc.restore();

    // ── Top primary blue border line ──────────────────────────────────────
    doc.rect(0, 0, PAGE_W, 5).fill(accent);

    // ── HEADER ─────────────────────────────────────────────────────────────
    const headerTop = 28;

    // Left: company logo circle + company info
    doc.circle(PL + 18, headerTop + 18, 18).fill(accentBg);
    doc.fillColor(accent).fontSize(16).font('Helvetica-Bold')
       .text('M', PL + 12, headerTop + 10);

    const nameX = PL + 44;
    doc.fillColor(INK_900).fontSize(13).font('Helvetica-Bold')
       .text(input.company.legalName || 'Mzali', nameX, headerTop);

    doc.fillColor(INK_500).fontSize(8).font('Helvetica');
    let cY = headerTop + 17;
    const companyMeta: string[] = [
      input.company.address,
      input.company.matriculeFiscal ? `MF: ${input.company.matriculeFiscal}` : '',
      input.company.phone,
      input.company.email,
    ].filter(Boolean);
    for (const line of companyMeta) {
      doc.circle(nameX + 2, cY + 3, 2).fill(accent);
      doc.fillColor(INK_700).font('Helvetica').fontSize(8)
         .text(line, nameX + 8, cY, { width: 230 });
      cY += 13;
    }

    // Right: Document Title (FACTURE / DEVIS / AVOIR)
    const titleX = 320;
    doc.fillColor(accent).fontSize(34).font('Helvetica-Bold')
       .text(input.title, titleX, headerTop, { width: 230, align: 'right' });

    // Meta cards (N° and Date)
    const metaY = headerTop + 50;
    const metaBoxW = 200;
    const metaX = PAGE_W - PL - metaBoxW;

    // N° row
    doc.roundedRect(metaX, metaY, metaBoxW, 28, 5).fill(INK_50);
    doc.rect(metaX + 10, metaY + 7, 3, 14).fill(accent);
    doc.fillColor(INK_500).fontSize(7).font('Helvetica').text('N°', metaX + 18, metaY + 6);
    doc.fillColor(INK_900).fontSize(10).font('Helvetica-Bold')
       .text(input.number, metaX + 18, metaY + 15, { width: metaBoxW - 28 });

    // Date row
    const dateY = metaY + 34;
    doc.roundedRect(metaX, dateY, metaBoxW, 28, 5).fill(INK_50);
    doc.rect(metaX + 10, dateY + 7, 3, 14).fill(accent);
    doc.fillColor(INK_500).fontSize(7).font('Helvetica').text('Date', metaX + 18, dateY + 6);
    doc.fillColor(INK_900).fontSize(10).font('Helvetica-Bold')
       .text(input.issueDate.toLocaleDateString('fr-TN'), metaX + 18, dateY + 15);

    if (input.dueOrExpiryDate) {
      const dueY = dateY + 34;
      doc.roundedRect(metaX, dueY, metaBoxW, 28, 5).fill(INK_50);
      doc.rect(metaX + 10, dueY + 7, 3, 14).fill(accent);
      doc.fillColor(INK_500).fontSize(7).font('Helvetica').text(input.dueOrExpiryLabel, metaX + 18, dueY + 6);
      doc.fillColor(INK_900).fontSize(10).font('Helvetica-Bold')
         .text(input.dueOrExpiryDate.toLocaleDateString('fr-TN'), metaX + 18, dueY + 15);
    }

    // ── Divider ─────────────────────────────────────────────────────────────
    const divY = Math.max(cY + 10, metaY + (input.dueOrExpiryDate ? 102 : 68));
    doc.moveTo(PL, divY).lineTo(PR, divY).strokeColor(INK_200).lineWidth(1).stroke();

    // ── CUSTOMER BLOCK (rounded light-gray card with blue accents) ─────────
    const custY   = divY + 14;
    const custH   = 80;
    doc.roundedRect(PL, custY, CW, custH, 8).fill(INK_50);

    // Avatar circle
    doc.circle(PL + 28, custY + custH / 2, 20).fill(accentBg);
    doc.circle(PL + 28, custY + custH / 2 - 6, 7).fill(accent);
    doc.ellipse(PL + 28, custY + custH / 2 + 14, 12, 8).fill(accent);

    const cInfoX = PL + 58;
    const recipientLabel = input.title === 'DEVIS' ? 'DEVIS POUR' : input.title === 'BON DE COMMANDE' ? 'FOURNISSEUR' : 'FACTURÉ À';
    doc.fillColor(accent).fontSize(8).font('Helvetica-Bold')
       .text(recipientLabel, cInfoX, custY + 14, { characterSpacing: 1 });
    doc.moveTo(cInfoX, custY + 24).lineTo(cInfoX + 50, custY + 24)
       .strokeColor(accent).lineWidth(1.5).stroke();

    doc.fillColor(INK_900).fontSize(12).font('Helvetica-Bold')
       .text(input.customer.name, cInfoX, custY + 30);

    doc.fillColor(INK_700).fontSize(8.5).font('Helvetica');
    let custDetailY = custY + 46;
    if (input.customer.phone) {
      doc.text(input.customer.phone, cInfoX, custDetailY); custDetailY += 12;
    }
    if (input.customer.address) {
      doc.text(input.customer.address, cInfoX, custDetailY, { width: CW - 70 });
    }

    // ── ITEMS TABLE ────────────────────────────────────────────────────────
    let y = custY + custH + 20;

    const col = {
      desc:     PL,
      qty:      PL + 295,
      unit:     PL + 335,
      discount: PL + 395,
      total:    PL + 448,
    };
    const colW = { desc: 290, qty: 38, unit: 58, discount: 50, total: 51 };

    // Table header (solid blue background with crisp white text)
    const thH = 26;
    doc.roundedRect(PL, y, CW, thH, 5).fill(accent);
    doc.fillColor(WHITE).fontSize(8).font('Helvetica-Bold');
    doc.text('DESCRIPTION',        col.desc + 10,    y + 9);
    doc.text('QTÉ',                col.qty,           y + 9, { width: colW.qty,      align: 'right' });
    doc.text('P.U.',               col.unit,          y + 9, { width: colW.unit,     align: 'right' });
    doc.text('REMISE',             col.discount,      y + 9, { width: colW.discount, align: 'right' });
    doc.text('TOTAL',              col.total,         y + 9, { width: colW.total,    align: 'right' });
    y += thH;

    // Table rows
    input.lines.forEach((line, i) => {
      const rowBg = i % 2 === 1 ? INK_50 : WHITE;
      const rowH  = 24;
      doc.rect(PL, y, CW, rowH).fill(rowBg);

      doc.fillColor(INK_900).font('Helvetica').fontSize(8.5);
      doc.text(clampText(line.descriptionSnapshot, 52), col.desc + 10, y + 7, { width: colW.desc - 10 });

      doc.fillColor(INK_700).text(String(line.quantity), col.qty, y + 7, { width: colW.qty, align: 'right' });
      doc.fillColor(INK_700).text(fmt(line.unitPriceMinor), col.unit, y + 7, { width: colW.unit, align: 'right' });

      if (line.discountMinor > 0) {
        doc.fillColor(accent).text(`-${fmt(line.discountMinor)}`, col.discount, y + 7, { width: colW.discount, align: 'right' });
      } else {
        doc.fillColor(INK_500).text('—', col.discount, y + 7, { width: colW.discount, align: 'right' });
      }

      doc.fillColor(INK_900).font('Helvetica-Bold')
         .text(fmt(line.lineTotalMinor), col.total, y + 7, { width: colW.total, align: 'right' });

      y += rowH;
    });

    // Bottom table border
    doc.moveTo(PL, y).lineTo(PR, y).strokeColor(INK_200).lineWidth(1).stroke();

    // ── LOWER SECTION: thank-you note + totals card ────────────────────────
    const lowerY  = y + 20;
    const totalsW  = 222;
    const totalsX  = PR - totalsW;
    const graphicW = totalsX - PL - 16;

    // Left — Thank-you note
    doc.save();
    doc.rect(PL, lowerY, graphicW, 130).clip();
    doc.roundedRect(PL + 20, lowerY + 10, 70, 90, 8).strokeColor(INK_200).lineWidth(1.5).stroke();
    doc.moveTo(PL + 33, lowerY + 32).lineTo(PL + 77, lowerY + 32).strokeColor(INK_200).lineWidth(1).stroke();
    doc.moveTo(PL + 33, lowerY + 44).lineTo(PL + 77, lowerY + 44).strokeColor(INK_200).lineWidth(1).stroke();
    doc.moveTo(PL + 33, lowerY + 56).lineTo(PL + 77, lowerY + 56).strokeColor(INK_200).lineWidth(1).stroke();
    doc.moveTo(PL + 33, lowerY + 68).lineTo(PL + 65, lowerY + 68).strokeColor(INK_200).lineWidth(1).stroke();
    doc.circle(PL + 70, lowerY + 88, 14).fill(accent);
    doc.fillColor(WHITE).font('Helvetica-Bold').fontSize(14).text('✓', PL + 63, lowerY + 80);
    doc.restore();

    doc.fillColor(accent).font('Helvetica-Bold').fontSize(10)
       .text('Merci pour votre confiance.', PL + 105, lowerY + 14);
    doc.fillColor(INK_500).font('Helvetica').fontSize(8)
       .text(
         'Nous vous remercions pour votre confiance\net restons à votre entière disposition.',
         PL + 105, lowerY + 28, { width: graphicW - 110 },
       );

    // Right — Totals summary card
    let tY = lowerY;
    const totalsRowH = 22;

    const renderTotalsRow = (label: string, value: string) => {
      doc.fillColor(INK_700).font('Helvetica').fontSize(8.5)
         .text(label, totalsX + 12, tY + 6, { width: 100 });
      doc.fillColor(INK_900).font('Helvetica-Bold').fontSize(8.5)
         .text(value, totalsX + 112, tY + 6, { width: totalsW - 124, align: 'right' });
      doc.moveTo(totalsX, tY + totalsRowH)
         .lineTo(totalsX + totalsW, tY + totalsRowH)
         .strokeColor(INK_200).lineWidth(0.5).stroke();
      tY += totalsRowH;
    };

    renderTotalsRow('Sous-total', fmt(input.subtotalMinor));
    if (input.discountMinor > 0) {
      renderTotalsRow('Remise', `-${fmt(input.discountMinor)}`);
    }
    if (input.taxMinor > 0) {
      const taxPct = input.subtotalMinor > 0
        ? Math.round((input.taxMinor / (input.subtotalMinor - (input.discountMinor ?? 0))) * 100)
        : 19;
      renderTotalsRow(`TVA (${taxPct}%)`, fmt(input.taxMinor));
    }
    if ((input.shippingMinor ?? 0) > 0) {
      renderTotalsRow('Livraison', fmt(input.shippingMinor));
    }
    if ((input.timbreFiscalMinor ?? 0) > 0) {
      renderTotalsRow('Timbre fiscal', fmt(input.timbreFiscalMinor!));
    }

    // Highlighted grand total in bold blue block
    const grandTotalH = 38;
    doc.roundedRect(totalsX, tY, totalsW, grandTotalH, 6).fill(accent);
    doc.fillColor(WHITE).font('Helvetica-Bold').fontSize(11)
       .text('TOTAL', totalsX + 14, tY + 12);
    doc.fontSize(15)
       .text(fmt(input.totalMinor), totalsX, tY + 10, { width: totalsW - 14, align: 'right' });

    // ── FOOTER ──────────────────────────────────────────────────────────────
    const footerY = PAGE_H - 68;
    doc.moveTo(PL, footerY - 8).lineTo(PR, footerY - 8)
       .strokeColor(INK_200).lineWidth(1).stroke();

    const colFW = CW / 3;

    const renderFooterCol = (x: number, label: string, line1: string, line2 = '') => {
      doc.circle(x + 14, footerY + 14, 12).fill(accentBg);
      doc.fillColor(accent).font('Helvetica-Bold').fontSize(7).text(label.charAt(0), x + 11, footerY + 10);

      doc.fillColor(accent).font('Helvetica-Bold').fontSize(8)
         .text(label, x + 30, footerY + 5, { characterSpacing: 0.5 });
      doc.fillColor(INK_700).font('Helvetica').fontSize(7.5)
         .text(line1, x + 30, footerY + 17);
      if (line2) {
        doc.text(line2, x + 30, footerY + 28);
      }
    };

    renderFooterCol(
      PL,
      'CONTACT',
      input.company.email || '',
      input.company.phone || '',
    );
    renderFooterCol(
      PL + colFW,
      'ADRESSE',
      input.company.address || '',
    );
    renderFooterCol(
      PL + colFW * 2,
      'MERCI',
      'Nous vous remercions pour',
      'votre confiance.',
    );

    // Bottom solid blue accent strip
    doc.rect(0, PAGE_H - 6, PAGE_W, 6).fill(accent);

    // ── Notes / Terms ──────────────────────────────────────────────────────
    if (input.notes || input.terms) {
      let notesY = tY + grandTotalH + 16;
      if (notesY < footerY - 40) {
        if (input.notes) {
          doc.fillColor(accent).font('Helvetica-Bold').fontSize(8)
             .text('NOTES', PL, notesY, { characterSpacing: 0.5 });
          doc.fillColor(INK_700).font('Helvetica').fontSize(8)
             .text(input.notes, PL, notesY + 12, { width: CW });
          notesY += 12 + doc.heightOfString(input.notes, { width: CW }) + 10;
        }
        if (input.terms && notesY < footerY - 30) {
          doc.fillColor(accent).font('Helvetica-Bold').fontSize(8)
             .text('CONDITIONS', PL, notesY, { characterSpacing: 0.5 });
          doc.fillColor(INK_700).font('Helvetica').fontSize(8)
             .text(input.terms, PL, notesY + 12, { width: CW });
        }
      }
    }

    doc.end();
    return done;
  }
}
