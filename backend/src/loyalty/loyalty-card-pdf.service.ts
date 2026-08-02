import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { encodeCode128B } from './code128';
import {
  BLEED_PT, CARD_HEIGHT_PT, CARD_WIDTH_PT, CardFaceContent, GOLD_FRAME, paletteFor, SAFE_MARGIN_PT, templateLabelFor,
} from './loyalty-card-design';

type PageSize = { width: number; height: number };

function drawQr(doc: PDFKit.PDFDocument, data: string, x: number, y: number, size: number, dark: string): void {
  const qr = QRCode.create(data, { errorCorrectionLevel: 'M' });
  const modules = qr.modules.size;
  const cell = size / modules;
  doc.fillColor(dark);
  for (let row = 0; row < modules; row++) {
    for (let col = 0; col < modules; col++) {
      if (qr.modules.data[row * modules + col]) {
        doc.rect(x + col * cell, y + row * cell, cell + 0.2, cell + 0.2).fill();
      }
    }
  }
}

/** Shrinks font size until `text` fits `maxWidth` on one line — guards
 *  against card-number format changes ever overflowing the safe area. */
function fittedFontSize(doc: PDFKit.PDFDocument, text: string, maxWidth: number, startSize: number, minSize: number, characterSpacing: number): number {
  let size = startSize;
  doc.font('Helvetica-Bold');
  while (size > minSize && doc.fontSize(size).widthOfString(text, { characterSpacing }) > maxWidth) {
    size -= 0.5;
  }
  return size;
}

function drawBarcode(doc: PDFKit.PDFDocument, text: string, x: number, y: number, width: number, height: number, dark: string): void {
  const { bars, totalModules } = encodeCode128B(text);
  const moduleWidth = width / totalModules;
  doc.fillColor(dark);
  for (const bar of bars) {
    doc.rect(x + bar.x * moduleWidth, y, bar.width * moduleWidth, height).fill();
  }
}

/** Small vector crown glyph — the only "tier icon" the card needs, drawn as
 *  a flat silhouette so it prints crisply at any size (no icon font/asset
 *  dependency). */
function drawCrown(doc: PDFKit.PDFDocument, x: number, y: number, w: number, color: string): void {
  const h = w * 0.62;
  doc.fillColor(color);
  doc.polygon(
    [x, y + h], [x, y + h * 0.32],
    [x + w * 0.22, y + h * 0.6], [x + w * 0.5, y],
    [x + w * 0.78, y + h * 0.6], [x + w, y + h * 0.32],
    [x + w, y + h],
  ).fill();
}

/**
 * Renders CR80 loyalty-card faces as vector PDF pages (pdfkit only — no
 * canvas/native barcode library, see code128.ts and loyalty-card-design.ts
 * for why). Card content is a plain data object (CardFaceContent) so the
 * same layout logic can eventually be reused by a PNG/SVG renderer without
 * re-deriving card data twice.
 */
@Injectable()
export class LoyaltyCardPdfService {
  /** One PDF, `cards.length` pages, each an exact CR80+bleed front face. */
  async renderFrontBatch(cards: CardFaceContent[]): Promise<Buffer> {
    return this.renderPages(cards, (doc, card) => this.drawFront(doc, card));
  }

  async renderBackBatch(cards: CardFaceContent[]): Promise<Buffer> {
    return this.renderPages(cards, (doc, card) => this.drawBack(doc, card));
  }

  /** Non-mutating single-card preview: page 1 = front, page 2 = back, no
   *  bleed (trimmed to exact CR80) — used only by the admin preview
   *  endpoints, never by the real batch export path. */
  async renderSingleCardPreview(card: CardFaceContent): Promise<Buffer> {
    const pageSize: [number, number] = [CARD_WIDTH_PT, CARD_HEIGHT_PT];
    const doc = new PDFDocument({ size: pageSize, margin: 0, autoFirstPage: false });
    return this.finish(doc, () => {
      doc.addPage({ size: pageSize, margin: 0 });
      this.drawFront(doc, card);
      doc.addPage({ size: pageSize, margin: 0 });
      this.drawBack(doc, card);
    });
  }

  /** Multi-card print-shop sheet (A4) with crop marks — front sheet and a
   *  matching, horizontally-mirrored back sheet so duplex alignment holds. */
  async renderSheet(cards: CardFaceContent[], side: 'front' | 'back'): Promise<Buffer> {
    const A4: PageSize = { width: 595.28, height: 841.89 };
    const margin = 24;
    const gap = 14;
    const cols = Math.max(1, Math.floor((A4.width - margin * 2 + gap) / (CARD_WIDTH_PT + gap)));
    const rows = Math.max(1, Math.floor((A4.height - margin * 2 + gap) / (CARD_HEIGHT_PT + gap)));
    const perSheet = cols * rows;

    return this.finish(new PDFDocument({ size: [A4.width, A4.height], margin: 0, autoFirstPage: false }), (doc) => {
      for (let start = 0; start < cards.length; start += perSheet) {
        doc.addPage({ size: [A4.width, A4.height], margin: 0 });
        const slice = cards.slice(start, start + perSheet);
        slice.forEach((card, i) => {
          const row = Math.floor(i / cols);
          // Mirror column order on the back sheet so, flipped on the short
          // edge for duplex printing, each card's back lands on its front.
          const col = side === 'back' ? cols - 1 - (i % cols) : i % cols;
          const x = margin + col * (CARD_WIDTH_PT + gap);
          const y = margin + row * (CARD_HEIGHT_PT + gap);
          doc.save();
          doc.translate(x, y);
          if (side === 'front') this.drawFront(doc, card, false); else this.drawBack(doc, card, false);
          doc.restore();
          this.drawCropMarks(doc, x, y, CARD_WIDTH_PT, CARD_HEIGHT_PT);
        });
      }
    });
  }

  private async renderPages(cards: CardFaceContent[], draw: (doc: PDFKit.PDFDocument, card: CardFaceContent) => void): Promise<Buffer> {
    const pageSize: [number, number] = [CARD_WIDTH_PT + BLEED_PT * 2, CARD_HEIGHT_PT + BLEED_PT * 2];
    const doc = new PDFDocument({ size: pageSize, margin: 0, autoFirstPage: false });
    return this.finish(doc, () => {
      for (const card of cards) {
        doc.addPage({ size: pageSize, margin: 0 });
        doc.save();
        doc.translate(BLEED_PT, BLEED_PT);
        draw(doc, card);
        doc.restore();
      }
    });
  }

  private finish(doc: PDFKit.PDFDocument, build: (doc: PDFKit.PDFDocument) => void): Promise<Buffer> {
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    const done = new Promise<Buffer>((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });
    build(doc);
    doc.end();
    return done;
  }

  // The right-hand "dark section" starts around 63% of the card width at
  // the top and leans slightly further right at the bottom, giving the
  // diagonal gold divider its lean (see the reference mockup).
  private dividerX(atBottom: boolean): number {
    return CARD_WIDTH_PT * (atBottom ? 0.685 : 0.63);
  }

  private drawGeometricPattern(doc: PDFKit.PDFDocument, color: string): void {
    doc.save();
    doc.moveTo(this.dividerX(false), 0)
      .lineTo(CARD_WIDTH_PT, 0)
      .lineTo(CARD_WIDTH_PT, CARD_HEIGHT_PT)
      .lineTo(this.dividerX(true), CARD_HEIGHT_PT)
      .closePath()
      .clip();
    doc.opacity(0.12).strokeColor(color).lineWidth(0.6);
    const step = 9;
    for (let sx = -CARD_HEIGHT_PT; sx < CARD_WIDTH_PT + CARD_HEIGHT_PT; sx += step) {
      doc.moveTo(sx, 0).lineTo(sx + CARD_HEIGHT_PT, CARD_HEIGHT_PT).stroke();
    }
    doc.opacity(1);
    doc.restore();
  }

  private drawFrame(doc: PDFKit.PDFDocument): void {
    const inset = 2.6;
    doc.roundedRect(inset, inset, CARD_WIDTH_PT - inset * 2, CARD_HEIGHT_PT - inset * 2, 8)
      .lineWidth(1.1).strokeColor(GOLD_FRAME).stroke();
    doc.moveTo(this.dividerX(false), 0).lineTo(this.dividerX(true), CARD_HEIGHT_PT)
      .lineWidth(1).strokeColor(GOLD_FRAME).stroke();
  }

  private drawFront(doc: PDFKit.PDFDocument, card: CardFaceContent, clip = true): void {
    const palette = paletteFor(card.templateCode);
    if (clip) doc.roundedRect(0, 0, CARD_WIDTH_PT, CARD_HEIGHT_PT, 8).clip();

    const bg = doc.linearGradient(0, 0, CARD_WIDTH_PT, CARD_HEIGHT_PT);
    bg.stop(0, palette.background).stop(1, palette.backgroundDark);
    doc.rect(-2, -2, CARD_WIDTH_PT + 4, CARD_HEIGHT_PT + 4).fill(bg);
    this.drawGeometricPattern(doc, palette.accent);

    // Brand lockup, top-left.
    doc.fillColor(palette.onDark).font('Helvetica-Bold').fontSize(14)
      .text('MZALI', SAFE_MARGIN_PT, SAFE_MARGIN_PT, { characterSpacing: 3 });
    doc.font('Helvetica').fontSize(6).fillColor(palette.inkMuted)
      .text('BOUTIQUE', SAFE_MARGIN_PT, SAFE_MARGIN_PT + 15, { characterSpacing: 2.8 });
    doc.moveTo(SAFE_MARGIN_PT, SAFE_MARGIN_PT + 25).lineTo(SAFE_MARGIN_PT + 30, SAFE_MARGIN_PT + 25)
      .lineWidth(0.8).strokeColor(GOLD_FRAME).stroke();

    // Phone & Website on Card Front
    doc.font('Helvetica').fontSize(5.5).fillColor(palette.inkMuted)
      .text(`${card.website}   ·   Tél: ${card.phone}`, SAFE_MARGIN_PT, SAFE_MARGIN_PT + 30);

    // Template badge, mid-left
    const badgeLabel = templateLabelFor(card.templateCode);
    if (badgeLabel) {
      const badgeY = CARD_HEIGHT_PT / 2 - 2;
      const badgeTextX = SAFE_MARGIN_PT + 11;
      drawCrown(doc, SAFE_MARGIN_PT, badgeY, 7.5, palette.accent);
      doc.font('Helvetica-Bold').fontSize(7).fillColor(palette.accent)
        .text(badgeLabel, badgeTextX, badgeY + 0.5, { characterSpacing: 1.2, lineBreak: false });
    }

    // Card number block at the BOTTOM of the card with REDUCED font size
    const bottomY = CARD_HEIGHT_PT - SAFE_MARGIN_PT - 14;
    doc.font('Helvetica').fontSize(5).fillColor(palette.inkMuted)
      .text('CARTE DE FIDÉLITÉ', SAFE_MARGIN_PT, bottomY - 8, { characterSpacing: 1.2 });

    const numberMaxWidth = this.dividerX(true) - SAFE_MARGIN_PT * 2;
    const numberFontSize = fittedFontSize(doc, card.cardNumber, numberMaxWidth, 8.5, 6.5, 0.4);
    doc.font('Helvetica-Bold').fontSize(numberFontSize).fillColor(palette.onDark)
      .text(card.cardNumber, SAFE_MARGIN_PT, bottomY, { characterSpacing: 0.5, lineBreak: false });

    // QR — centered in the right panel
    const qrSize = 52;
    const quiet = 8;
    const rightRegionLeft = Math.max(this.dividerX(false), this.dividerX(true)) + 10;
    const rightRegionRight = CARD_WIDTH_PT - SAFE_MARGIN_PT;
    const qrX = rightRegionLeft + (rightRegionRight - rightRegionLeft - qrSize) / 2;
    const qrY = (CARD_HEIGHT_PT - qrSize) / 2;
    doc.roundedRect(qrX - quiet, qrY - quiet, qrSize + quiet * 2, qrSize + quiet * 2, 6).fill('#ffffff');
    drawQr(doc, card.qrToken, qrX, qrY, qrSize, palette.backgroundDark);

    this.drawFrame(doc);
  }

  private drawBack(doc: PDFKit.PDFDocument, card: CardFaceContent, clip = true): void {
    const palette = paletteFor(card.templateCode);
    if (clip) doc.roundedRect(0, 0, CARD_WIDTH_PT, CARD_HEIGHT_PT, 8).clip();

    const bg = doc.linearGradient(0, 0, CARD_WIDTH_PT, CARD_HEIGHT_PT);
    bg.stop(0, palette.backgroundDark).stop(1, palette.background);
    doc.rect(-2, -2, CARD_WIDTH_PT + 4, CARD_HEIGHT_PT + 4).fill(bg);

    // Monogram, top-left.
    doc.circle(SAFE_MARGIN_PT + 9, SAFE_MARGIN_PT + 9, 9).lineWidth(0.8).strokeColor(GOLD_FRAME).stroke();
    doc.font('Helvetica-Bold').fontSize(10).fillColor(GOLD_FRAME)
      .text('M', SAFE_MARGIN_PT + 5, SAFE_MARGIN_PT + 3);
    doc.font('Helvetica').fontSize(6.5).fillColor(palette.inkMuted)
      .text('MZALI BOUTIQUE', SAFE_MARGIN_PT + 24, SAFE_MARGIN_PT + 6, { characterSpacing: 1.4 });

    doc.moveTo(SAFE_MARGIN_PT, SAFE_MARGIN_PT + 22).lineTo(CARD_WIDTH_PT - SAFE_MARGIN_PT, SAFE_MARGIN_PT + 22)
      .lineWidth(0.5).strokeColor(GOLD_FRAME).opacity(0.5).stroke();
    doc.opacity(1);

    // Message + terms sit around the vertical middle so the back isn't
    // top-heavy with a large empty gap above the contact/barcode block.
    const messageY = CARD_HEIGHT_PT * 0.42;
    doc.font('Helvetica').fontSize(7).fillColor(palette.onDark)
      .text(card.message, SAFE_MARGIN_PT, messageY, { width: CARD_WIDTH_PT - SAFE_MARGIN_PT * 2, lineGap: 2 });
    doc.font('Helvetica').fontSize(6.3).fillColor(palette.inkMuted)
      .text(card.terms, SAFE_MARGIN_PT, messageY + doc.heightOfString(card.message, { width: CARD_WIDTH_PT - SAFE_MARGIN_PT * 2 }) + 10, { width: CARD_WIDTH_PT - SAFE_MARGIN_PT * 2 });

    doc.font('Helvetica').fontSize(6.5).fillColor(palette.onDark)
      .text(`${card.website}   ·   ${card.phone}`, SAFE_MARGIN_PT, CARD_HEIGHT_PT - SAFE_MARGIN_PT - 44);

    const barcodeWidth = CARD_WIDTH_PT - SAFE_MARGIN_PT * 2;
    const barcodeHeight = 20;
    const barcodeY = CARD_HEIGHT_PT - SAFE_MARGIN_PT - 34;
    doc.roundedRect(SAFE_MARGIN_PT - 3, barcodeY - 3, barcodeWidth + 6, barcodeHeight + 6, 3).fill('#ffffff');
    drawBarcode(doc, card.cardNumber, SAFE_MARGIN_PT, barcodeY, barcodeWidth, barcodeHeight, '#111111');

    // Sits below the white barcode box, back on the dark background — needs
    // a light fill, not the dark-on-white color used inside the box.
    doc.font('Helvetica').fontSize(7).fillColor(palette.onDark)
      .text(card.cardNumber, SAFE_MARGIN_PT, barcodeY + barcodeHeight + 9, { width: barcodeWidth, align: 'center', characterSpacing: 1 });

    this.drawFrame(doc);
  }

  private drawCropMarks(doc: PDFKit.PDFDocument, x: number, y: number, w: number, h: number): void {
    const len = 8;
    const gap = 2;
    doc.strokeColor('#999999').lineWidth(0.4);
    const corners: [number, number, number, number][] = [
      [x, y, -1, -1], [x + w, y, 1, -1],
      [x, y + h, -1, 1], [x + w, y + h, 1, 1],
    ];
    for (const [cx, cy, dx, dy] of corners) {
      doc.moveTo(cx + dx * gap, cy).lineTo(cx + dx * (gap + len), cy).stroke();
      doc.moveTo(cx, cy + dy * gap).lineTo(cx, cy + dy * (gap + len)).stroke();
    }
  }
}
