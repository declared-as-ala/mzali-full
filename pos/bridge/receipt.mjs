// Builds a raw ESC/POS byte buffer for a thermal receipt printer. Pure and
// synchronous — no I/O, no hardware — so it's fully unit-testable without a
// printer attached (see receipt.test.mjs). server.mjs/printer.mjs are the
// only places that actually touch a device.

const ESC = 0x1b;
const GS = 0x1d;

const CHARS_PER_LINE = { 58: 32, 80: 48 };

// Thermal printers vary in which ESC/POS codepage they default to (or
// support at all) for accented characters — getting that wrong prints
// garbled bytes, which is worse than plain text. Transliterating to the
// closest ASCII is the one choice that is always legible on any ESC/POS
// printer, verified hardware or not.
const ACCENT_MAP = {
  'à': 'a', 'â': 'a', 'ä': 'a', 'á': 'a', 'ã': 'a',
  'è': 'e', 'ê': 'e', 'ë': 'e', 'é': 'e',
  'ì': 'i', 'î': 'i', 'ï': 'i', 'í': 'i',
  'ò': 'o', 'ô': 'o', 'ö': 'o', 'ó': 'o', 'õ': 'o',
  'ù': 'u', 'û': 'u', 'ü': 'u', 'ú': 'u',
  'ç': 'c', 'ñ': 'n', 'ÿ': 'y',
  'À': 'A', 'Â': 'A', 'Ä': 'A', 'Á': 'A',
  'È': 'E', 'Ê': 'E', 'Ë': 'E', 'É': 'E',
  'Î': 'I', 'Ï': 'I', 'Ì': 'I', 'Í': 'I',
  'Ô': 'O', 'Ö': 'O', 'Ò': 'O', 'Ó': 'O',
  'Û': 'U', 'Ü': 'U', 'Ù': 'U', 'Ú': 'U',
  'Ç': 'C', 'Ñ': 'N',
  'œ': 'oe', 'Œ': 'OE', 'æ': 'ae', 'Æ': 'AE',
  '’': "'", '‘': "'", '“': '"', '”': '"',
  '–': '-', '—': '-', '…': '...',
};

export function transliterate(input) {
  return String(input ?? '').replace(/[^\x00-\x7F]/g, (ch) => ACCENT_MAP[ch] ?? '?');
}

export function money(minor) {
  return `${(Number(minor) / 1000).toFixed(3)} DT`;
}

function wrap(text, width) {
  const words = transliterate(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > width) {
      if (current) lines.push(current);
      current = word.length > width ? word.slice(0, width) : word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [''];
}

/** Left text on the left, right text right-aligned on the same line —
 *  wraps the left side onto extra lines (right text stays on the last one)
 *  when the line would otherwise overflow the paper width. */
function twoColumn(left, right, width) {
  const r = transliterate(right);
  const leftWidth = Math.max(1, width - r.length - 1);
  const leftLines = wrap(left, leftWidth);
  const out = [];
  for (let i = 0; i < leftLines.length; i++) {
    const isLast = i === leftLines.length - 1;
    const l = leftLines[i];
    if (!isLast) {
      out.push(l);
    } else {
      const pad = Math.max(1, width - l.length - r.length);
      out.push(l + ' '.repeat(pad) + r);
    }
  }
  return out.join('\n');
}

class ReceiptBuilder {
  constructor(width) {
    this.width = width;
    this.chunks = [Buffer.from([ESC, 0x40])]; // ESC @ — initialize
  }

  raw(...bytes) {
    this.chunks.push(Buffer.from(bytes));
    return this;
  }

  align(mode) {
    // 0 left, 1 center, 2 right
    return this.raw(ESC, 0x61, mode);
  }

  bold(on) {
    return this.raw(ESC, 0x45, on ? 1 : 0);
  }

  /** width/height multiplier 0 (normal) through 7 (8x) each, packed into one byte. */
  size(widthMult, heightMult) {
    const n = ((widthMult & 0x07) << 4) | (heightMult & 0x07);
    return this.raw(GS, 0x21, n);
  }

  line(text = '') {
    this.chunks.push(Buffer.from(transliterate(text) + '\n', 'ascii'));
    return this;
  }

  /** Same as line(), but wraps onto extra lines instead of letting the
   *  paper's fixed character width truncate/overflow — use this for any
   *  free-text value (names, addresses, notes), not fixed short labels. */
  wrapLine(text = '') {
    for (const l of wrap(text, this.width)) this.line(l);
    return this;
  }

  raw2col(left, right) {
    for (const l of twoColumn(left, right, this.width).split('\n')) this.line(l);
    return this;
  }

  separator(char = '-') {
    return this.line(char.repeat(this.width));
  }

  feed(lines = 1) {
    return this.raw(...Array(lines).fill(0x0a));
  }

  /** ESC/POS 2D symbol storage/print sequence (function 165, "GS ( k") —
   *  the widely-compatible way to print a QR code on ESC/POS thermal
   *  printers (Epson TM-* and most compatible clones). */
  qr(data, moduleSize = 6) {
    const bytes = Buffer.from(data, 'utf8');
    const storeLen = bytes.length + 3;
    const pL = storeLen & 0xff;
    const pH = (storeLen >> 8) & 0xff;
    this.raw(GS, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x00); // model 2
    this.raw(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, moduleSize); // module size
    this.raw(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x31); // error correction level M
    this.raw(GS, 0x28, 0x6b, pL, pH, 0x31, 0x50, 0x30, ...bytes); // store data
    this.raw(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30); // print stored data
    return this;
  }

  cut() {
    this.feed(3);
    return this.raw(GS, 0x56, 0x01); // partial cut
  }

  toBuffer() {
    return Buffer.concat(this.chunks);
  }
}

const PAYMENT_LABEL = { CASH: 'Especes', CARD: 'Carte bancaire', BANK_TRANSFER: 'Virement', OTHER: 'Autre' };

/**
 * `sale` mirrors the fields TicketPreview.tsx (the on-screen/A4 fallback
 * template) renders — same content, ESC/POS layout instead of HTML/CSS.
 * `settings` is this terminal's printer configuration (paperWidthMm,
 * printLogo, printQr — see contracts/pos.ts PosPrinterSettings).
 */
export function buildReceipt(sale, settings) {
  const width = CHARS_PER_LINE[settings.paperWidthMm] ?? CHARS_PER_LINE[80];
  const b = new ReceiptBuilder(width);
  const merchant = sale.merchant ?? {};
  const legalName = (merchant.legalName ?? '').trim();

  b.align(1);
  if (settings.printLogo) {
    b.bold(true).size(1, 1).line('MZALI BOUTIQUE').size(0, 0).bold(false);
  } else {
    b.line('MZALI BOUTIQUE');
  }
  if (legalName && legalName.toUpperCase() !== 'MZALI BOUTIQUE') b.wrapLine(legalName);
  if (merchant.address) b.wrapLine(merchant.address);
  if (merchant.phone) b.wrapLine(`Tel: ${merchant.phone}`);
  if (merchant.matriculeFiscal) b.wrapLine(`MF: ${merchant.matriculeFiscal}`);
  if (merchant.rcNumber) b.wrapLine(`RC: ${merchant.rcNumber}`);

  b.separator();
  b.bold(true).line('TICKET DE CAISSE').bold(false);
  b.align(0);
  b.line(`Ticket #${sale.saleNumber}`);
  b.wrapLine(`Date: ${new Date(sale.completedAt || sale.createdAt).toLocaleString('fr-FR')}`);
  if (sale.cashierName) b.wrapLine(`Caissier: ${sale.cashierName}`);
  if (sale.customerName || sale.customerPhone) {
    b.wrapLine(`Client: ${[sale.customerName, sale.customerPhone].filter(Boolean).join(' - ')}`);
  }

  b.separator();
  for (const line of sale.lines ?? []) {
    b.bold(true);
    b.wrapLine(`${line.descriptionSnapshot} x${line.qty}`);
    b.bold(false);
    const attrs = Object.entries(line.variantAttributesSnapshot ?? {});
    const detail = [line.sku ? `Ref. ${line.sku}` : '', ...attrs.map(([k, v]) => `${k}: ${v}`)].filter(Boolean).join(' - ');
    if (detail) b.wrapLine(`  ${detail}`);

    const regularLineTotal = line.regularUnitPriceMinor != null ? line.regularUnitPriceMinor * line.qty : null;
    if (line.bundleId && regularLineTotal != null) {
      const savings = Math.max(0, regularLineTotal - (line.lineTotalMinor + line.discountMinor));
      b.raw2col('  Prix normal', money(regularLineTotal));
      if (savings > 0) b.raw2col(`  Offre ${line.bundleName ?? ''}`, `-${money(savings)}`);
      b.raw2col('  Total', money(line.lineTotalMinor));
    } else {
      b.raw2col(`  ${line.qty} x ${money(line.unitPriceMinor)}`, money(line.lineTotalMinor));
    }
    if (line.discountMinor > 0) b.raw2col('  Remise article', `-${money(line.discountMinor)}`);
  }

  b.separator();
  const grossItems = (sale.lines ?? []).reduce((s, l) => s + l.unitPriceMinor * l.qty, 0);
  const lineDiscount = (sale.lines ?? []).reduce((s, l) => s + l.discountMinor, 0);
  b.raw2col('Sous-total articles', money(grossItems));
  if (lineDiscount > 0) {
    b.raw2col('Remises articles', `-${money(lineDiscount)}`);
    b.raw2col('Sous-total', money(sale.subtotalMinor));
  }
  if (sale.discountMinor > 0) b.raw2col('Remise', `-${money(sale.discountMinor)}`);
  b.bold(true).size(0, 1).raw2col('TOTAL', money(sale.totalMinor)).size(0, 0).bold(false);

  b.separator();
  const payments = sale.payments?.length
    ? sale.payments
    : sale.paymentMethod ? [{ method: sale.paymentMethod === 'MIXED' ? 'OTHER' : sale.paymentMethod, amountMinor: sale.totalMinor }] : [];
  for (const p of payments) b.raw2col(PAYMENT_LABEL[p.method] ?? p.method, money(p.amountMinor));
  if (sale.cashReceivedMinor != null) b.raw2col('Montant recu', money(sale.cashReceivedMinor));
  if (sale.changeMinor != null) b.raw2col('Monnaie rendue', money(sale.changeMinor));

  if (sale.loyaltyPointsEarned > 0 || sale.loyaltyPointsRedeemed > 0) {
    b.separator();
    if (sale.loyaltyPointsRedeemed > 0) b.raw2col('Points utilises', `-${sale.loyaltyPointsRedeemed} (${money(sale.loyaltyDiscountMinor)})`);
    if (sale.loyaltyPointsEarned > 0) b.raw2col('Points gagnes', `+${sale.loyaltyPointsEarned}`);
  }

  if (sale.notes) {
    b.separator();
    b.wrapLine(`Note: ${sale.notes}`);
  }

  b.separator();
  b.align(1);
  if (settings.printQr) {
    b.feed(1);
    b.qr('https://ahmedmzaliboutique.tn/');
    b.feed(1);
  }
  b.wrapLine('Merci pour votre confiance.');
  b.wrapLine('ahmedmzaliboutique.tn');
  b.wrapLine("Conservez ce ticket comme preuve d'achat.");

  b.cut();
  return b.toBuffer();
}

export { CHARS_PER_LINE, twoColumn, wrap };
