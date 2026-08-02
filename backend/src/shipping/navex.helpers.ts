/** Pure helpers ported verbatim from lib/navex.ts. */

const GOVS = [
  'Ariana', 'Béja', 'Ben Arous', 'Bizerte', 'Gabès', 'Gafsa',
  'Jendouba', 'Kairouan', 'Kasserine', 'Kébili', 'La Manouba',
  'Le Kef', 'Mahdia', 'Médenine', 'Monastir', 'Nabeul', 'Sfax',
  'Sidi Bouzid', 'Siliana', 'Sousse', 'Tataouine', 'Tozeur',
  'Tunis', 'Zaghouan',
];

const COMBINING_MARKS = new RegExp('[\\u0300-\\u036f]', 'g');
const foldDiacritics = (s: string) => s.normalize('NFD').replace(COMBINING_MARKS, '').toLowerCase().trim();

/** Accept loose user-typed governorates (Kef, Manouba, Beja…) and normalize spelling. */
export function normalizeGov(input: string): string {
  if (!input) return '';
  const norm = foldDiacritics(input);
  for (const g of GOVS) if (foldDiacritics(g) === norm) return g;
  for (const g of GOVS) {
    const gNorm = foldDiacritics(g);
    if (gNorm.includes(norm) || norm.includes(gNorm)) return g;
  }
  const aliases: Record<string, string> = {
    kef: 'Le Kef', manouba: 'La Manouba', mannouba: 'La Manouba',
    beja: 'Béja', gabes: 'Gabès', medenine: 'Médenine', kebili: 'Kébili',
  };
  return aliases[norm] ?? input;
}

export function extractNavexBarcode(payload: unknown): string | undefined {
  if (!payload) return undefined;
  if (typeof payload === 'string') return payload.match(/\b\d{8,}\b/)?.[0];
  if (typeof payload === 'object') {
    const o = payload as Record<string, unknown>;
    for (const k of ['code_a_barre', 'code_barre', 'code', 'barcode', 'tracking_number', 'tracking', 'reference', 'cab', 'status_message']) {
      const v = o[k];
      if (typeof v === 'string') {
        const m = v.match(/\b\d{8,}\b/);
        if (m) return m[0];
      }
      if (typeof v === 'number' && String(v).length >= 8) return String(v);
    }
    if (o.data && typeof o.data === 'object') return extractNavexBarcode(o.data);
  }
  return undefined;
}

export function navexStatusMessage(raw: unknown): string | undefined {
  if (raw && typeof raw === 'object') {
    const o = raw as Record<string, unknown>;
    if (typeof o.status_message === 'string') return o.status_message;
    if (typeof o.message === 'string') return o.message;
  }
  return undefined;
}

export function isNavexSuccessStatus(raw: unknown): boolean {
  if (raw && typeof raw === 'object') {
    const o = raw as Record<string, unknown>;
    if (o.status === 1 || o.status === '1' || o.status === true) return true;
    const sm = String(o.status_message ?? '').toLowerCase();
    if (sm.includes('added') || sm.includes('ajouté') || sm.includes('success')) return true;
  }
  return false;
}
