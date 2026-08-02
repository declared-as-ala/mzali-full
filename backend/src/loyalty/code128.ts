/**
 * Minimal Code128 (subset B) encoder — pure function, no rasterization.
 * Produces bar positions in "module" units so a caller (pdfkit or an SVG
 * builder) can draw filled rectangles directly, at whatever scale it
 * likes. Deliberately avoids a canvas/native-binary barcode library —
 * see progress.md's loyalty-cards entry for why (Docker build risk on
 * Alpine, and vector output prints crisper on a small CR80 card anyway).
 *
 * Subset B covers ASCII 32–126, which is everything a card number
 * (`MZC-XXXX-XXXX-XX`) ever needs — letters, digits, hyphen.
 */

// Standard ISO/IEC 15417 Code128 pattern table: for each symbol value
// 0–106, the widths (in modules, 1–4) of the 6 alternating bar/space
// runs, starting with a bar. Value 106 (stop) has a 7th run (13 modules
// total instead of 11) — public-domain data, identical across every
// Code128 implementation.
const PATTERNS: string[] = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112',
];

const START_B = 104;
const STOP = 106;

export type BarcodeBar = { x: number; width: number };

/** Encodes `text` (ASCII 32–126 only) and returns black-bar positions in
 *  module units, plus the total width in modules. */
export function encodeCode128B(text: string): { bars: BarcodeBar[]; totalModules: number } {
  const values: number[] = [];
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if (code < 32 || code > 126) throw new Error(`Code128B: unsupported character "${ch}"`);
    values.push(code - 32);
  }
  let checksum = START_B;
  values.forEach((v, i) => { checksum += v * (i + 1); });
  checksum %= 103;

  const symbols = [START_B, ...values, checksum, STOP];
  const bars: BarcodeBar[] = [];
  let cursor = 0;
  for (const symbol of symbols) {
    const runs = PATTERNS[symbol];
    let isBar = true; // each symbol starts with a bar
    for (const ch of runs) {
      const width = Number(ch);
      if (isBar) bars.push({ x: cursor, width });
      cursor += width;
      isBar = !isBar;
    }
  }
  return { bars, totalModules: cursor };
}
