import { Injectable } from '@nestjs/common';
import QRCode from 'qrcode';
import sharp from 'sharp';
import { encodeCode128B } from './code128';
import {
  CARD_HEIGHT_PX, CARD_WIDTH_PX, CardFaceContent, GOLD_FRAME, paletteFor, templateLabelFor,
} from './loyalty-card-design';

/** Rough Helvetica-Bold average advance width as a fraction of font size —
 *  used only to auto-shrink text so it can't overflow the safe area in the
 *  SVG renderer (no real glyph-metrics API available here, unlike pdfkit's
 *  `widthOfString`). Deliberately generous (overestimates width) so it
 *  errs toward shrinking rather than risking an overflow. */
const AVG_CHAR_WIDTH_FACTOR = 0.62;

function estimatedWidth(text: string, fontSize: number, characterSpacing = 0): number {
  return text.length * (fontSize * AVG_CHAR_WIDTH_FACTOR + characterSpacing);
}

function fittedFontSize(text: string, maxWidth: number, startSize: number, minSize: number, characterSpacing = 0): number {
  let size = startSize;
  while (size > minSize && estimatedWidth(text, size, characterSpacing) > maxWidth) size -= 0.5;
  return size;
}

function crownPoints(x: number, y: number, w: number): string {
  const h = w * 0.62;
  return [
    [x, y + h], [x, y + h * 0.32],
    [x + w * 0.22, y + h * 0.6], [x + w * 0.5, y],
    [x + w * 0.78, y + h * 0.6], [x + w, y + h * 0.32],
    [x + w, y + h],
  ].map((p) => p.join(',')).join(' ');
}

/** 300 DPI PNG renderer for the ZIP export package — builds an SVG string
 *  (sharing colors/labels with the pdfkit renderer via loyalty-card-design)
 *  and rasterizes it with sharp, which already ships in this project for
 *  product-image processing. No canvas/native barcode dependency. */
@Injectable()
export class LoyaltyCardPngService {
  async renderFront(card: CardFaceContent): Promise<Buffer> {
    return this.rasterize(await this.frontSvg(card));
  }

  async renderBack(card: CardFaceContent): Promise<Buffer> {
    return this.rasterize(this.backSvg(card));
  }

  // No `density` option here: the SVG's width/height attributes already
  // ARE the target 300 DPI pixel dimensions (CARD_WIDTH_PX/CARD_HEIGHT_PX),
  // not physical units — passing density:300 on top double-scales (sharp
  // interprets it relative to a 72 DPI base), rendering ~4.17× oversized.
  private async rasterize(svg: string): Promise<Buffer> {
    return sharp(Buffer.from(svg)).png().toBuffer();
  }

  // Same lean as the pdfkit divider — see loyalty-card-pdf.service.ts.
  private dividerX(w: number, atBottom: boolean): number {
    return w * (atBottom ? 0.685 : 0.63);
  }

  /** Thin 45° hairlines clipped to the right-hand panel — the "subtle
   *  geometric pattern" from the reference design. Returns `{ clipPath,
   *  lines }` separately so the caller can put the clip-path definition in
   *  `<defs>` and the pattern group wherever it belongs in paint order. */
  private geometricPattern(w: number, h: number, x1Top: number, x1Bottom: number, color: string): { clipPath: string; lines: string } {
    const step = w * 0.037;
    const segments: string[] = [];
    for (let sx = -h; sx < w + h; sx += step) {
      segments.push(`<line x1="${sx}" y1="0" x2="${sx + h}" y2="${h}" stroke="${color}" stroke-width="${w * 0.0025}" opacity="0.12"/>`);
    }
    return {
      clipPath: `<clipPath id="rightClip"><polygon points="${x1Top},0 ${w},0 ${w},${h} ${x1Bottom},${h}"/></clipPath>`,
      lines: `<g clip-path="url(#rightClip)">${segments.join('')}</g>`,
    };
  }

  private async frontSvg(card: CardFaceContent): Promise<string> {
    const p = paletteFor(card.templateCode);
    const w = CARD_WIDTH_PX;
    const h = CARD_HEIGHT_PX;
    const margin = w * 0.028;
    const x1Top = this.dividerX(w, false);
    const x1Bottom = this.dividerX(w, true);

    const qrSize = h * 0.34;
    const quiet = qrSize * 0.16;
    const rightLeft = Math.max(x1Top, x1Bottom) + w * 0.02;
    const qrX = rightLeft + (w - margin - rightLeft - qrSize) / 2;
    const qrY = (h - qrSize) / 2;
    // Module count depends on token length/error-correction level (the
    // qrcode library auto-picks a QR version) — read it from `create()`
    // rather than assuming a fixed grid, or longer real tokens would render
    // cropped to a hardcoded viewBox.
    const qrModules = QRCode.create(card.qrToken, { errorCorrectionLevel: 'M' }).modules.size;
    const qrSvg = await QRCode.toString(card.qrToken, { type: 'svg', margin: 0, errorCorrectionLevel: 'M' });
    // The qrcode library's SVG output ends with a trailing newline, so a
    // bare `/<\/svg>$/` never matches it — always trim first.
    const qrInner = qrSvg.trim().replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');

    const numberFontSize = fittedFontSize(card.cardNumber, x1Bottom - margin * 2, 17, 12, 0.8);
    const badgeLabel = templateLabelFor(card.templateCode);
    const badgeTextX = margin + w * 0.045;
    const badgeFontSize = fittedFontSize(badgeLabel, x1Bottom - badgeTextX - 10, 13, 9, 2);
    const pattern = this.geometricPattern(w, h, x1Top, x1Bottom, p.accent);

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="${w}" y2="${h}" gradientUnits="userSpaceOnUse">
          <stop offset="0" stop-color="${p.background}"/>
          <stop offset="1" stop-color="${p.backgroundDark}"/>
        </linearGradient>
        ${pattern.clipPath}
      </defs>
      <rect width="${w}" height="${h}" rx="${w * 0.033}" fill="url(#bg)"/>
      ${pattern.lines}

      <!-- Brand Lockup -->
      <text x="${margin}" y="${margin + 34}" font-family="Helvetica, Arial, sans-serif" font-weight="700" font-size="34" letter-spacing="7" fill="${p.onDark}">MZALI</text>
      <text x="${margin}" y="${margin + 58}" font-family="Helvetica, Arial, sans-serif" font-size="15" letter-spacing="6" fill="${p.inkMuted}">BOUTIQUE</text>
      <line x1="${margin}" y1="${margin + 68}" x2="${margin + w * 0.13}" y2="${margin + 68}" stroke="${GOLD_FRAME}" stroke-width="${w * 0.0018}"/>

      <!-- Phone & Website -->
      <text x="${margin}" y="${margin + 92}" font-family="Helvetica, Arial, sans-serif" font-size="12" letter-spacing="0.8" fill="${p.inkMuted}">${escapeXml(card.website)}   ·   Tél: ${escapeXml(card.phone)}</text>

      <!-- Badge (OR / ARGENT / VIP) if present -->
      ${badgeLabel ? `
      <polygon points="${crownPoints(margin, h / 2 - 5, w * 0.018)}" fill="${p.accent}"/>
      <text x="${badgeTextX}" y="${h / 2 + 10}" font-family="Helvetica, Arial, sans-serif" font-weight="700" font-size="${badgeFontSize}" letter-spacing="2" fill="${p.accent}">${badgeLabel}</text>` : ''}

      <!-- Card Number at bottom with reduced font size -->
      <text x="${margin}" y="${h - margin - 34}" font-family="Helvetica, Arial, sans-serif" font-size="11" letter-spacing="2" fill="${p.inkMuted}">CARTE DE FIDÉLITÉ</text>
      <text x="${margin}" y="${h - margin - 12}" font-family="Helvetica, Arial, sans-serif" font-weight="700" font-size="${numberFontSize}" letter-spacing="1" fill="${p.onDark}">${card.cardNumber}</text>

      <!-- QR Code -->
      <rect x="${qrX - quiet}" y="${qrY - quiet}" width="${qrSize + quiet * 2}" height="${qrSize + quiet * 2}" rx="${w * 0.014}" fill="#ffffff"/>
      <svg x="${qrX}" y="${qrY}" width="${qrSize}" height="${qrSize}" viewBox="0 0 ${qrModules} ${qrModules}">${qrInner}</svg>

      <rect x="${w * 0.006}" y="${w * 0.006}" width="${w - w * 0.012}" height="${h - w * 0.012}" rx="${w * 0.02}" fill="none" stroke="${GOLD_FRAME}" stroke-width="${w * 0.0025}"/>
      <line x1="${x1Top}" y1="0" x2="${x1Bottom}" y2="${h}" stroke="${GOLD_FRAME}" stroke-width="${w * 0.0022}"/>
    </svg>`;
  }

  private backSvg(card: CardFaceContent): string {
    const p = paletteFor(card.templateCode);
    const w = CARD_WIDTH_PX;
    const h = CARD_HEIGHT_PX;
    const margin = w * 0.028;
    const barcodeWidth = w - margin * 2;

    // Bottom-up stack, computed explicitly (not as independent fractions of
    // h) so the card-number label below the barcode can never land past the
    // bottom edge and get clipped — that's what the previous formula did.
    const numberLabelY = h - margin - 8;
    const barcodeBottom = numberLabelY - 22;
    const barcodeHeight = 70;
    const barcodeY = barcodeBottom - barcodeHeight;
    const websitePhoneY = barcodeY - 26;

    const { bars, totalModules } = encodeCode128B(card.cardNumber);
    const moduleWidth = barcodeWidth / totalModules;
    const barRects = bars
      .map((b) => `<rect x="${margin + b.x * moduleWidth}" y="${barcodeY}" width="${b.width * moduleWidth}" height="${barcodeHeight}" fill="#111111"/>`)
      .join('');

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
      <defs>
        <linearGradient id="bgBack" x1="0" y1="0" x2="${w}" y2="${h}" gradientUnits="userSpaceOnUse">
          <stop offset="0" stop-color="${p.backgroundDark}"/>
          <stop offset="1" stop-color="${p.background}"/>
        </linearGradient>
      </defs>
      <rect width="${w}" height="${h}" rx="${w * 0.033}" fill="url(#bgBack)"/>

      <circle cx="${margin + 26}" cy="${margin + 26}" r="24" fill="none" stroke="${GOLD_FRAME}" stroke-width="${w * 0.0018}"/>
      <text x="${margin + 15}" y="${margin + 35}" font-family="Helvetica, Arial, sans-serif" font-weight="700" font-size="26" fill="${GOLD_FRAME}">M</text>
      <text x="${margin + 60}" y="${margin + 32}" font-family="Helvetica, Arial, sans-serif" font-size="15" letter-spacing="3" fill="${p.inkMuted}">MZALI BOUTIQUE</text>
      <line x1="${margin}" y1="${margin + 58}" x2="${w - margin}" y2="${margin + 58}" stroke="${GOLD_FRAME}" stroke-width="${w * 0.0012}" opacity="0.5"/>

      ${wrapSvgText(card.message, w - margin * 2, 15)
        .map((line, i) => `<text x="${margin}" y="${h * 0.44 + i * 19}" font-family="Helvetica, Arial, sans-serif" font-size="15" fill="${p.onDark}">${line}</text>`)
        .join('')}
      <text x="${margin}" y="${h * 0.44 + wrapSvgText(card.message, w - margin * 2, 15).length * 19 + 24}" font-family="Helvetica, Arial, sans-serif" font-size="13" fill="${p.inkMuted}">${escapeXml(card.terms)}</text>

      <text x="${margin}" y="${websitePhoneY}" font-family="Helvetica, Arial, sans-serif" font-size="15" fill="${p.onDark}">${escapeXml(card.website)}   ·   ${escapeXml(card.phone)}</text>
      <rect x="${margin - 4}" y="${barcodeY - 4}" width="${barcodeWidth + 8}" height="${barcodeHeight + 8}" rx="${w * 0.006}" fill="#ffffff"/>
      ${barRects}
      <text x="${w / 2}" y="${numberLabelY}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="16" letter-spacing="1" fill="${p.onDark}">${card.cardNumber}</text>

      <rect x="${w * 0.006}" y="${w * 0.006}" width="${w - w * 0.012}" height="${h - w * 0.012}" rx="${w * 0.02}" fill="none" stroke="${GOLD_FRAME}" stroke-width="${w * 0.0025}"/>
    </svg>`;
  }
}

/** Naive word-wrap for the back-side loyalty message — good enough for the
 *  fixed, short, French copy this card always shows (not a general text
 *  layout engine). */
function wrapSvgText(text: string, maxWidthPx: number, fontSize: number): string[] {
  const maxChars = Math.max(10, Math.floor(maxWidthPx / (fontSize * AVG_CHAR_WIDTH_FACTOR)));
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxChars && current) {
      lines.push(escapeXml(current));
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(escapeXml(current));
  return lines;
}

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
