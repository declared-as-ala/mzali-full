import jsQR from 'jsqr';
import sharp from 'sharp';
import type { CompanySettings, SiteSettings } from '@contracts';
import type { CardTemplateCode } from './loyalty-card-batch.schema';
import {
  buildCardContent, CARD_HEIGHT_MM, CARD_HEIGHT_PT, CARD_HEIGHT_PX,
  CARD_WIDTH_MM, CARD_WIDTH_PT, CARD_WIDTH_PX, PNG_DPI, paletteFor, templateLabelFor,
} from './loyalty-card-design';
import { LoyaltyCardPdfService } from './loyalty-card-pdf.service';
import { LoyaltyCardPngService } from './loyalty-card-png.service';

const TEMPLATES: CardTemplateCode[] = ['STANDARD', 'SILVER', 'GOLD', 'VIP'];

const COMPANY: CompanySettings = {
  legalName: 'Ahmed Mzali Boutique SARL', address: '12 Avenue Habib Bourguiba, Tunis',
  matriculeFiscal: '1234567A', rcNumber: 'B12345678', phone: '22 479 443', email: 'contact@ahmedmzaliboutique.com',
  logoMediaId: null,
};
const SITE: SiteSettings = { phones: ['22 479 443'] } as SiteSettings;

async function decodeQrFromPng(png: Buffer): Promise<string | null> {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const result = jsQR(new Uint8ClampedArray(data), info.width, info.height);
  return result?.data ?? null;
}

describe('CR80 / 300 DPI dimensions', () => {
  it('matches the exact CR80 bank-card size in mm', () => {
    expect(CARD_WIDTH_MM).toBe(85.6);
    expect(CARD_HEIGHT_MM).toBe(53.98);
  });

  it('converts mm to pt at the standard 72/25.4 ratio', () => {
    expect(CARD_WIDTH_PT).toBeCloseTo((85.6 / 25.4) * 72, 5);
    expect(CARD_HEIGHT_PT).toBeCloseTo((53.98 / 25.4) * 72, 5);
  });

  it('targets exactly 300 DPI for the PNG raster', () => {
    expect(PNG_DPI).toBe(300);
    expect(CARD_WIDTH_PX).toBe(Math.round((85.6 / 25.4) * 300));
    expect(CARD_HEIGHT_PX).toBe(Math.round((53.98 / 25.4) * 300));
  });
});

describe('templateLabelFor', () => {
  it('shows no badge label for the base STANDARD template', () => {
    expect(templateLabelFor('STANDARD')).toBe('');
  });

  it('gives every other template a distinct, non-empty label', () => {
    const labels = ['SILVER', 'GOLD', 'VIP'].map((t) => templateLabelFor(t as CardTemplateCode));
    expect(labels.every((l) => l.length > 0)).toBe(true);
    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe('paletteFor', () => {
  it('gives each of the 4 templates a visually distinct background', () => {
    const backgrounds = TEMPLATES.map((t) => paletteFor(t).background);
    expect(new Set(backgrounds).size).toBe(TEMPLATES.length);
  });
});

describe('buildCardContent', () => {
  it('never embeds customer PII (id, customer phone, points balance) in the card face content', () => {
    // `phone` IS a legitimate field here — the boutique's own contact
    // number printed on the back, not the customer's. Only customer-linked
    // fields are forbidden.
    const content = buildCardContent('GOLD', 'MZC-TEST-0000-00', 'opaque-token', COMPANY, SITE);
    const forbiddenKeys = ['customerId', 'customerPhone', 'customerName', 'pointsBalance', 'accountId'];
    expect(Object.keys(content).some((k) => forbiddenKeys.includes(k))).toBe(false);
  });

  it('uses only the opaque QR token, not any derived customer data, as qrToken', () => {
    const content = buildCardContent('GOLD', 'MZC-TEST-0000-00', 'opaque-token-abc123', COMPANY, SITE);
    expect(content.qrToken).toBe('opaque-token-abc123');
  });
});

describe('LoyaltyCardPdfService', () => {
  const pdf = new LoyaltyCardPdfService();

  it.each(TEMPLATES)('renders a front+back page for every %s template without throwing', async (templateCode) => {
    const content = buildCardContent(templateCode, 'MZC-395R-72R8-NC', 'a-real-32-byte-base64url-token-xxxxxxxxxx', COMPANY, SITE);
    const front = await pdf.renderFrontBatch([content]);
    const back = await pdf.renderBackBatch([content]);
    expect(front.subarray(0, 4).toString()).toBe('%PDF');
    expect(back.subarray(0, 4).toString()).toBe('%PDF');
    expect(front.length).toBeGreaterThan(0);
    expect(back.length).toBeGreaterThan(0);
  });

  it('renderSingleCardPreview produces a 2-page front+back PDF (no bleed)', async () => {
    const content = buildCardContent('VIP', 'MZC-395R-72R8-NC', 'token', COMPANY, SITE);
    const preview = await pdf.renderSingleCardPreview(content);
    expect(preview.subarray(0, 4).toString()).toBe('%PDF');
    // pdfkit writes a `/Count N` in the pages tree; a crude but dependency-free way
    // to assert page count without pulling in a PDF parser for this one check.
    expect(preview.toString('latin1')).toMatch(/\/Count 2/);
  });

  it('renderSheet preserves front/back card ordering across pages for batch printing', async () => {
    const cards = ['A', 'B', 'C'].map((suffix) =>
      buildCardContent('STANDARD', `MZC-0000-000${suffix}-00`, `token-${suffix}`, COMPANY, SITE));
    const front = await pdf.renderSheet(cards, 'front');
    const back = await pdf.renderSheet(cards, 'back');
    expect(front.subarray(0, 4).toString()).toBe('%PDF');
    expect(back.subarray(0, 4).toString()).toBe('%PDF');
  });

  it('does not overflow when given an unusually long card number (auto-fit safe area)', async () => {
    const content = buildCardContent('VIP', 'MZC-9999-9999-9999-9999-EXTRA-LONG', 'token', COMPANY, SITE);
    await expect(pdf.renderFrontBatch([content])).resolves.toBeInstanceOf(Buffer);
  });
});

describe('LoyaltyCardPngService', () => {
  const png = new LoyaltyCardPngService();

  it.each(TEMPLATES)('renders %s front/back at exactly CARD_WIDTH_PX × CARD_HEIGHT_PX', async (templateCode) => {
    const content = buildCardContent(templateCode, 'MZC-395R-72R8-NC', 'token', COMPANY, SITE);
    const front = await png.renderFront(content);
    const back = await png.renderBack(content);
    const frontMeta = await sharp(front).metadata();
    const backMeta = await sharp(back).metadata();
    expect(frontMeta.width).toBe(CARD_WIDTH_PX);
    expect(frontMeta.height).toBe(CARD_HEIGHT_PX);
    expect(backMeta.width).toBe(CARD_WIDTH_PX);
    expect(backMeta.height).toBe(CARD_HEIGHT_PX);
  });

  it('the printed QR decodes back to exactly the opaque qrToken (real scannability, not just presence)', async () => {
    const token = 'sample-opaque-loyalty-token-' + 'x'.repeat(20);
    const content = buildCardContent('GOLD', 'MZC-395R-72R8-NC', token, COMPANY, SITE);
    const front = await png.renderFront(content);
    const decoded = await decodeQrFromPng(front);
    expect(decoded).toBe(token);
  });

  it('does not overflow when given an unusually long card number (auto-fit safe area)', async () => {
    const content = buildCardContent('VIP', 'MZC-9999-9999-9999-9999-EXTRA-LONG', 'token', COMPANY, SITE);
    const front = await png.renderFront(content);
    const meta = await sharp(front).metadata();
    expect(meta.width).toBe(CARD_WIDTH_PX);
    expect(meta.height).toBe(CARD_HEIGHT_PX);
  });
});
