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
const TOKEN = process.env.FIRST_DELIVERY_TOKEN ?? '';

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
    const list = Array.isArray(data?.result) ? (data.result as FDLocality[]) : [];
    if (list.length > 0) { _localitiesCache = list; _localitiesCachedAt = now; }
    return list.length > 0 ? list : (_localitiesCache ?? []);
  } catch {
    return _localitiesCache ?? [];
  }
}

function normStr(s: string | undefined | null): string {
  if (!s) return '';
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

async function resolveLocalityId(gov: string, city: string = '', address: string = ''): Promise<number> {
  const localities = await getLocalities();
  if (!localities.length) return 1534; // Ain Zaghouen Nord fallback

  const g = normStr(gov);
  const c = normStr(city);
  const addr = normStr(address);

  // 1. Try exact governorate match
  let hit = localities.find((l) => normStr(l.governorate_name) === g);
  if (hit) return hit.locality_id;

  // 2. Try partial governorate match
  hit = localities.find((l) => normStr(l.governorate_name).includes(g) || g.includes(normStr(l.governorate_name)));
  if (hit) return hit.locality_id;

  // 3. Try finding a governorate name within the city or address fields
  for (const l of localities) {
    const govNorm = normStr(l.governorate_name);
    if (govNorm.length > 3 && (c.includes(govNorm) || addr.includes(govNorm))) {
      return l.locality_id;
    }
  }

  // 4. Try matching input against delegation names
  hit = localities.find((l) => normStr(l.delegation_name) === g || normStr(l.delegation_name) === c);
  if (hit) return hit.locality_id;

  hit = localities.find((l) => normStr(l.delegation_name).includes(g) || g.includes(normStr(l.delegation_name)));
  if (hit) return hit.locality_id;

  // 5. Try matching input against locality names
  hit = localities.find((l) => normStr(l.locality_name) === g || normStr(l.locality_name) === c);
  if (hit) return hit.locality_id;

  hit = localities.find((l) => normStr(l.locality_name).includes(g) || g.includes(normStr(l.locality_name)));
  if (hit) return hit.locality_id;

  // 6. Fallback to first available Tunis/Ariana locality or the absolute first item
  const defaultHit = localities.find((l) => normStr(l.governorate_name) === 'tunis' || normStr(l.governorate_name) === 'ariana') || localities[0];
  return defaultHit ? defaultHit.locality_id : 1534;
}

export type FirstDeliveryResult = {
  ok: boolean;
  barcode?: string;
  raw: unknown;
  error?: string;
};

export type FirstDeliveryShipmentInput = {
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

    // locality_id is mandatory since 2026-06-01
    const locality_id = await resolveLocalityId(gov, ville, adresse);

    const body = {
      Client: {
        nom: s.receiverName.trim(),
        locality_id,
        gouvernerat: gov,
        ville: ville,
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
