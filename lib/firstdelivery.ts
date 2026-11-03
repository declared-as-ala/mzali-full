/**
 * First Delivery Group API client — server-only.
 *
 * Spec: https://www.firstdeliverygroup.com/api/v2
 *   • Bearer token in Authorization header.
 *   • POST /create        → create a shipment
 *   • POST /etat          → track a shipment by barCode
 *   • POST /cancel-orders → cancel shipment(s)
 */
import 'server-only';
// Reuse the designation-building logic from navex (same format)
export { buildNavexDesignation as buildFirstDeliveryDesignation } from './navex';

const BASE = (process.env.FIRST_DELIVERY_API_BASE ?? 'https://www.firstdeliverygroup.com/api/v2').replace(/\/+$/, '');
// Hardcoded token per requirement — do NOT use any other API key from .env
const TOKEN = 'f56f557e-2dda-472d-8bb9-a1768257c308';

export const firstDeliveryConfigured = Boolean(TOKEN);

function authHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${TOKEN}`,
  };
}

async function readBody(res: Response): Promise<unknown> {
  const text = await res.text();
  try { return JSON.parse(text); } catch { return text; }
}

/** Strip spaces, dashes, and Tunisian country-code prefix so we always send 8 raw digits. */
function sanitizePhone(p: string): string {
  return p.replace(/[\s\-().]/g, '').replace(/^\+?216/, '').replace(/^00216/, '').replace(/^0+/, '');
}

// ── Localities cache ──────────────────────────────────────────────────────────
// locality_id became mandatory on 2026-06-01 per First Delivery API changelog.

type FDLocality = {
  locality_id: number;
  locality_name: string;
  delegation_name: string;
  governorate_name: string;
};

let _localitiesCache: FDLocality[] | null = null;
let _localitiesCachedAt = 0;
const LOCALITIES_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

async function getLocalities(): Promise<FDLocality[]> {
  const now = Date.now();
  if (_localitiesCache && now - _localitiesCachedAt < LOCALITIES_TTL_MS) return _localitiesCache;
  try {
    const res = await fetch(`${BASE}/localities`, { headers: authHeaders(), cache: 'no-store' });
    const data = await readBody(res) as { result?: FDLocality[] };
    const list = res.ok && data && Array.isArray(data.result)
        ? data.result.filter((l) => l && Number.isInteger(l.locality_id) && l.locality_id > 0
          && typeof l.locality_name === 'string' && !!l.locality_name.trim()
          && typeof l.delegation_name === 'string' && !!l.delegation_name.trim()
          && typeof l.governorate_name === 'string' && !!l.governorate_name.trim())
        : [];
    if (list.length > 0) { _localitiesCache = list; _localitiesCachedAt = now; }
    return list.length > 0 ? list : (_localitiesCache ?? []);
  } catch {
    return _localitiesCache ?? [];
  }
}

const ARABIC_LOCALITIES: Record<string, string> = {
  'بجاوة': 'bjeoua',
  'بجاوه': 'bjeoua',
  'منوبة': 'manouba',
  'المنوبة': 'manouba',
  'تونس': 'tunis',
  'سوسة': 'sousse',
  'صفاقس': 'sfax',
  'اريانة': 'ariana',
  'أريانة': 'ariana',
  'بن عروس': 'ben arous',
  'بنزرت': 'bizerte',
  'نابل': 'nabeul',
  'المنستير': 'monastir',
  'منستير': 'monastir',
  'المهدية': 'mahdia',
  'مهدية': 'mahdia',
  'القيروان': 'kairouan',
  'قيروان': 'kairouan',
  'القصرين': 'kasserine',
  'قصرين': 'kasserine',
  'سيدي بوزيد': 'sidi bouzid',
  'قفصة': 'gafsa',
  'توزر': 'tozeur',
  'قبلي': 'kebili',
  'تطاوين': 'tataouine',
  'مدنين': 'medenine',
  'قابس': 'gabes',
  'جندوبة': 'jendouba',
  'باجة': 'beja',
  'الكاف': 'kef',
  'كاف': 'kef',
  'سليانة': 'siliana',
  'زغوان': 'zaghouan',
  'وادي الليل': 'oued ellil',
  'الدندان': 'denden',
  'دندان': 'denden',
  'طبربة': 'tebourba',
  'المرناقية': 'mornaguia',
  'مرناقية': 'mornaguia',
  'دوار هيشر': 'douar hicher',
  'الجديدة': 'jedaida',
  'جديدة': 'jedaida',
  'برج العامري': 'borj el amri',
  'البطان': 'el battan',
};

function normGov(s: string | undefined | null): string {
  if (!s) return '';
  let str = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  for (const [ar, fr] of Object.entries(ARABIC_LOCALITIES)) {
    if (str.includes(ar)) str = str.replaceAll(ar, ' ' + fr + ' ');
  }
  const clean = str
    .replace(/^(la|le|les|el)\s+/, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
  if (clean === 'manouba' || clean === 'mannouba') return 'manouba';
  if (clean === 'kef') return 'kef';
  return clean;
}

function addressContains(haystack: string, needle: string): boolean {
  if (!needle || needle.length < 3) return false;
  return ` ${haystack} `.includes(` ${needle} `);
}

async function resolveLocality(gov: string, city = '', address = '', localityId?: number): Promise<FDLocality | null> {
  const localities = await getLocalities();
  if (localityId) {
    const direct = localities.find((l) => l.locality_id === localityId);
    if (direct) return direct;
  }
  const g = normGov(gov);
  const c = normGov(city);
  const addr = normGov(address);

  const sameGov = localities.filter((l) => g && normGov(l.governorate_name) === g);
  const pool = sameGov.length > 0 ? sameGov : localities;

  // 1) Explicit match: city matches delegation or locality
  const delegationMatches = c ? pool.filter((l) => normGov(l.delegation_name) === c) : [];
  const localityMatches = c ? pool.filter((l) => normGov(l.locality_name) === c) : [];
  const explicit = delegationMatches.length > 0 ? delegationMatches : localityMatches;

  if (explicit.length === 1) return explicit[0];
  if (explicit.length > 1) {
    const withinExplicit = explicit.filter((l) => addr && addressContains(addr, normGov(l.locality_name)));
    if (withinExplicit.length === 1) return withinExplicit[0];
    return null; // Ambiguous, never pick an arbitrary one
  }

  // 1.5) Chief-town matching (e.g. Sousse -> Sousse Ville, Sousse Jaouhara)
  if (c) {
    const chief = pool.filter((l) => {
      const del = normGov(l.delegation_name);
      return del === `${c} ville` || del === c || del.startsWith(`${c} `);
    });
    if (chief.length > 0) {
      if (addr) {
        const withinChief = chief.filter((l) => addressContains(addr, normGov(l.locality_name)));
        if (withinChief.length === 1) return withinChief[0];
      }
      return null; // Ambiguous, ask admin
    }
  }

  // 2) Free-text address matching against localities
  if (addr) {
    const localityHits = pool.filter((l) => addressContains(addr, normGov(l.locality_name)));
    if (localityHits.length > 0) {
      const maxLen = Math.max(...localityHits.map((l) => normGov(l.locality_name).length));
      const best = localityHits.filter((l) => normGov(l.locality_name).length === maxLen);
      if (best.length === 1) return best[0];
      return null;
    }

    const delegationHits = pool.filter((l) => addressContains(addr, normGov(l.delegation_name)));
    if (delegationHits.length === 1) return delegationHits[0];
    return null;
  }

  if (sameGov.length === 1) return sameGov[0];
  return null;
}

export type FirstDeliveryResult = {
  ok: boolean;
  barcode?: string;
  raw: unknown;
  error?: string;
};

export type FirstDeliveryShipmentInput = {
  orderId?: string;
  receiverName: string;
  receiverGov: string;
  receiverCity?: string;
  receiverAddress: string;
  receiverPhone: string;
  receiverPhone2?: string;
  codAmount: number;
  productLabel: string;
  itemsCount: number;
  note?: string;
  estFragile?: 'oui' | 'non';
  ouvrirColis?: 'oui' | 'non';
  localityId?: number;
};

function extractBarcode(payload: unknown): string | undefined {
  if (!payload) return undefined;
  if (typeof payload === 'string') {
    const m = payload.match(/\b\d{10,}\b/);
    return m?.[0];
  }
  if (typeof payload === 'object') {
    const o = payload as Record<string, unknown>;
    // First Delivery docs show barCode in result object
    for (const k of ['barCode', 'barcode', 'bar_code', 'code_a_barre', 'tracking', 'reference']) {
      const v = o[k];
      if (typeof v === 'string' && /^\d{8,}$/.test(v.trim())) return v.trim();
      if (typeof v === 'number' && String(v).length >= 8) return String(v);
    }
    // Nested under result (object or array)
    if (o.result && typeof o.result === 'object' && !Array.isArray(o.result)) return extractBarcode(o.result);
    if (Array.isArray(o.result) && o.result.length > 0) return extractBarcode(o.result[0]);
  }
  return undefined;
}

function isSuccess(httpStatus: number, payload: unknown): boolean {
  if (httpStatus < 200 || httpStatus >= 300) return false;
  if (payload && typeof payload === 'object') {
    const o = payload as Record<string, unknown>;
    // Explicit failure flags from First Delivery
    if (o.isError === true) return false;
    // Body-level status code indicating an error even when HTTP 200
    if (typeof o.status === 'number' && o.status >= 400) return false;
    if (typeof o.status === 'string' && Number(o.status) >= 400) return false;
  }
  return true;
}

function extractError(payload: unknown): string | undefined {
  if (payload && typeof payload === 'object') {
    const o = payload as Record<string, unknown>;
    if (typeof o.message === 'string' && o.message) return o.message;
    if (typeof o.error === 'string' && o.error) return o.error;
    if (Array.isArray(o.errors) && o.errors.length > 0) return String(o.errors[0]);
    if (typeof o.errors === 'string' && o.errors) return o.errors;
  }
  return undefined;
}

export const firstDelivery = {
  /** Create a shipment. Returns the barcode (tracking code). */
  async createShipment(s: FirstDeliveryShipmentInput): Promise<FirstDeliveryResult> {
    if (!TOKEN) return { ok: false, raw: null, error: 'FIRST_DELIVERY_TOKEN missing' };

    const gov = (s.receiverGov ?? '').trim();
    const ville = (s.receiverCity ?? s.receiverGov ?? '').trim();
    const adresse = (s.receiverAddress ?? '').trim() || gov;
    if (!gov && !ville) return { ok: false, raw: null, error: 'First Delivery : sélectionnez une ville et enregistrez la commande avant de renvoyer.' };

    // locality_id is mandatory since 2026-06-01
    const locality = await resolveLocality(gov, ville, adresse, s.localityId);
    if (!locality) return { ok: false, raw: null, error: 'First Delivery : localité introuvable ou ambiguë. Sélectionnez la localité exacte dans la commande avant d\'envoyer.' };

    const body = {
      Client: {
        nom: s.receiverName.trim(),
        locality_id: locality.locality_id,
        gouvernerat: locality.governorate_name,
        ville: locality.delegation_name,
        adresse: adresse,
        telephone: sanitizePhone(s.receiverPhone),
        telephone2: s.receiverPhone2 ? sanitizePhone(s.receiverPhone2) : '',
      },
      Produit: {
        // API spec: prix must be between 0 and 999 DT
        prix: Math.min(999, Math.max(0, Math.round(s.codAmount))),
        designation: s.productLabel.slice(0, 200),
        nombreArticle: Math.max(1, Math.round(s.itemsCount)),
        commentaire: (s.note ?? '').slice(0, 200),
        article: s.productLabel.slice(0, 100),
        nombreEchange: 0,
        estFragile: s.estFragile ?? 'non',
        ouvrirColis: s.ouvrirColis ?? 'non',
      },
    };

    try {
      const res = await fetch(`${BASE}/create`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(body),
        cache: 'no-store',
      });
      const raw = await readBody(res);
      const ok = isSuccess(res.status, raw);
      const barcode = extractBarcode(raw);
      if (ok) return { ok: true, barcode, raw };
      return {
        ok: false,
        raw,
        error: extractError(raw) ?? `HTTP ${res.status} — ${typeof raw === 'string' ? raw.slice(0, 200) : JSON.stringify(raw).slice(0, 200)}`,
      };
    } catch (e) {
      return { ok: false, raw: null, error: e instanceof Error ? e.message : 'network error' };
    }
  },

  /** Track a single shipment by barcode. */
  async getState(barcode: string): Promise<FirstDeliveryResult> {
    if (!TOKEN) return { ok: false, raw: null, error: 'FIRST_DELIVERY_TOKEN missing' };
    try {
      const res = await fetch(`${BASE}/etat`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ barCode: barcode }),
        cache: 'no-store',
      });
      const raw = await readBody(res);
      const ok = isSuccess(res.status, raw);
      return { ok, barcode, raw, error: ok ? undefined : (extractError(raw) ?? `HTTP ${res.status}`) };
    } catch (e) {
      return { ok: false, raw: null, error: e instanceof Error ? e.message : 'network error' };
    }
  },

  /** Cancel a shipment by barcode. */
  async cancelShipment(barcode: string): Promise<FirstDeliveryResult> {
    if (!TOKEN) return { ok: false, raw: null, error: 'FIRST_DELIVERY_TOKEN missing' };
    try {
      const res = await fetch(`${BASE}/cancel-orders`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ barCodes: [barcode] }),
        cache: 'no-store',
      });
      const raw = await readBody(res);
      const ok = isSuccess(res.status, raw);
      return { ok, barcode, raw, error: ok ? undefined : (extractError(raw) ?? `HTTP ${res.status}`) };
    } catch (e) {
      return { ok: false, raw: null, error: e instanceof Error ? e.message : 'network error' };
    }
  },
};
