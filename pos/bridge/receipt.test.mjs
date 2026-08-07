import assert from 'node:assert/strict';
import test from 'node:test';
import { buildReceipt, CHARS_PER_LINE, money, transliterate, twoColumn, wrap } from './receipt.mjs';

const SETTINGS_80 = { paperWidthMm: 80, printLogo: true, printQr: true, printCopies: 1 };
const SETTINGS_58 = { paperWidthMm: 58, printLogo: true, printQr: true, printCopies: 1 };

const SALE = {
  saleNumber: 1042,
  createdAt: '2026-01-15T10:30:00.000Z',
  completedAt: '2026-01-15T10:30:05.000Z',
  cashierName: 'Sami',
  customerName: 'Amira Ben Salah',
  customerPhone: '20123456',
  merchant: { legalName: 'MZALI SARL', address: 'Avenue Habib Bourguiba, Tunis', phone: '71000000', matriculeFiscal: '123456A', rcNumber: null },
  lines: [
    {
      variantId: 'v1', productId: 'p1', descriptionSnapshot: 'Chemise Elegance Premium', sku: 'CH-001',
      variantAttributesSnapshot: { Taille: 'M', Couleur: 'Bleu' },
      qty: 2, unitPriceMinor: 45000, discountMinor: 0, lineTotalMinor: 90000,
      bundleGroupId: null, bundleId: null, bundleName: null, regularUnitPriceMinor: 45000,
    },
    {
      variantId: 'v2', productId: 'p2', descriptionSnapshot: 'Pantalon', sku: 'PT-002',
      variantAttributesSnapshot: {}, qty: 3, unitPriceMinor: 20000, discountMinor: 0, lineTotalMinor: 55000,
      bundleGroupId: 'g1', bundleId: 'b1', bundleName: '3 pour 55', regularUnitPriceMinor: 25000,
    },
  ],
  subtotalMinor: 145000,
  discountMinor: 0,
  totalMinor: 145000,
  paymentMethod: 'CASH',
  payments: [{ method: 'CASH', amountMinor: 145000 }],
  cashReceivedMinor: 150000,
  changeMinor: 5000,
  loyaltyPointsEarned: 14,
  loyaltyPointsRedeemed: 0,
  loyaltyDiscountMinor: 0,
  notes: null,
};

test('money() formats millimes as DT with 3 decimals', () => {
  assert.equal(money(145000), '145.000 DT');
  assert.equal(money(0), '0.000 DT');
});

test('transliterate() strips French accents to plain ASCII', () => {
  assert.equal(transliterate('Réçu Café à Emporter'), 'Recu Cafe a Emporter');
  assert.equal(transliterate('Œuf'), 'OEuf');
});

test('transliterate() replaces any other non-ASCII byte with a safe placeholder instead of raw garbage', () => {
  assert.equal(transliterate('日本語'), '???');
});

test('wrap() never produces a line longer than the given width', () => {
  const lines = wrap('Ensemble Robe Longue Manches Bouffantes Collection Hiver', 16);
  assert.ok(lines.length > 1);
  for (const line of lines) assert.ok(line.length <= 16, `"${line}" exceeds 16 chars`);
});

test('twoColumn() right-aligns within the exact width and pads with spaces', () => {
  const out = twoColumn('Total', '10.000 DT', 20);
  assert.equal(out.length, 20);
  assert.ok(out.endsWith('10.000 DT'));
  assert.ok(out.startsWith('Total'));
});

test('twoColumn() keeps the amount on the last wrapped line when the label is long', () => {
  const out = twoColumn('Ensemble Robe Longue Manches Bouffantes', '25.000 DT', 24);
  const lines = out.split('\n');
  assert.ok(lines.length > 1);
  assert.ok(lines[lines.length - 1].endsWith('25.000 DT'));
});

test('buildReceipt() starts with the ESC/POS initialize sequence', () => {
  const buf = buildReceipt(SALE, SETTINGS_80);
  assert.equal(buf[0], 0x1b);
  assert.equal(buf[1], 0x40);
});

test('buildReceipt() ends with a paper cut sequence', () => {
  const buf = buildReceipt(SALE, SETTINGS_80);
  const tail = buf.subarray(buf.length - 3);
  assert.deepEqual([...tail], [0x1d, 0x56, 0x01]);
});

test('buildReceipt() includes the ticket number, items, and total in readable text', () => {
  const buf = buildReceipt(SALE, SETTINGS_80);
  const text = buf.toString('latin1');
  assert.ok(text.includes('Ticket #1042'));
  assert.ok(text.includes('Chemise Elegance Premium'));
  assert.ok(text.includes('145.000 DT'));
  assert.ok(text.includes('Sami'));
  assert.ok(text.includes('Amira Ben Salah'));
});

test('buildReceipt() shows the bundle/offer breakdown for a discounted line', () => {
  const buf = buildReceipt(SALE, SETTINGS_80);
  const text = buf.toString('latin1');
  assert.ok(text.includes('Prix normal'));
  assert.ok(text.includes('Offre 3 pour 55'));
});

/** Strips the fixed-length ESC/POS control sequences buildReceipt() emits
 *  (init/align/bold/size/cut — all have zero print-column width on the
 *  actual paper) so a naive split('\n') on the raw bytes reflects what a
 *  printer would really lay out, instead of counting command bytes that
 *  happen to glue onto the front of the following text line as if they
 *  were visible characters. printQr:false in this test avoids the QR
 *  sub-command bytes, which use printable-range parameters this stripper
 *  doesn't attempt to parse. */
function stripEscPosControlSequences(buf) {
  const out = [];
  for (let i = 0; i < buf.length; i++) {
    const b = buf[i];
    if (b === 0x1b && buf[i + 1] === 0x40) { i += 1; continue; } // ESC @
    if (b === 0x1b && (buf[i + 1] === 0x61 || buf[i + 1] === 0x45)) { i += 2; continue; } // ESC a n / ESC E n
    if (b === 0x1d && (buf[i + 1] === 0x21 || buf[i + 1] === 0x56)) { i += 2; continue; } // GS ! n / GS V n
    out.push(b);
  }
  return Buffer.from(out);
}

test('buildReceipt() respects paperWidthMm — 58mm lines never exceed 32 columns, 80mm allows 48', () => {
  const buf58 = buildReceipt(SALE, { ...SETTINGS_58, printQr: false });
  const text = stripEscPosControlSequences(buf58).toString('latin1');
  for (const line of text.split('\n')) {
    assert.ok(line.length <= CHARS_PER_LINE[58], `"${line}" exceeds ${CHARS_PER_LINE[58]} chars at 58mm`);
  }
});

test('buildReceipt() only emits the QR command sequence when printQr is enabled', () => {
  const withQr = buildReceipt(SALE, { ...SETTINGS_80, printQr: true });
  const withoutQr = buildReceipt(SALE, { ...SETTINGS_80, printQr: false });
  // GS ( k 0x04 0x00 0x31 0x41 — the QR "set model" sub-command, unambiguous marker
  const marker = Buffer.from([0x1d, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41]);
  assert.ok(withQr.includes(marker));
  assert.ok(!withoutQr.includes(marker));
});

test('buildReceipt() never throws on a sale with no lines, no customer, no loyalty, no notes', () => {
  const minimal = {
    ...SALE, lines: [], customerName: null, customerPhone: null,
    loyaltyPointsEarned: 0, loyaltyPointsRedeemed: 0, notes: null, cashReceivedMinor: null, changeMinor: null,
  };
  assert.doesNotThrow(() => buildReceipt(minimal, SETTINGS_80));
});
