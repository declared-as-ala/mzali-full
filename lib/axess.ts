/**
 * Axess Logistique API client — server-only.
 *
 * Spec: https://fast.axesslogistique.com
 *   • Token goes in the POST body (not Authorization header).
 *   • POST /api/pickups/new/v3/  → create a shipment
 *   • POST /api/v2/pickups/status/{trackingNumber} → track
 *   • POST /api/zones            → list governorates / delegations / localités
 */
import 'server-only';
export { buildNavexDesignation as buildAxessDesignation } from './navex';

const BASE = (process.env.AXESS_API_BASE ?? 'https://fast.axesslogistique.com').replace(/\/+$/, '');
const TOKEN = process.env.AXESS_TOKEN ?? '';

// Source — use entrepot ID if set, otherwise use source address fields.
const ENTREPOT_ID = process.env.AXESS_ENTREPOT_ID ? Number(process.env.AXESS_ENTREPOT_ID) : null;
const SOURCE_NOM = process.env.AXESS_SOURCE_NOM ?? 'Mzali Boutique';
const SOURCE_TEL = process.env.AXESS_SOURCE_TEL ?? '';
const SOURCE_ADDRESS = process.env.AXESS_SOURCE_ADDRESS ?? 'Tunis';
const SOURCE_GOV = process.env.AXESS_SOURCE_GOV ?? 'Tunis';
const SOURCE_DELEGATION = process.env.AXESS_SOURCE_DELEGATION ?? 'Tunis';
const SOURCE_LOCALITE = process.env.AXESS_SOURCE_LOCALITE ?? 'Tunis';

export const axessConfigured = Boolean(TOKEN);

// ── Helpers ───────────────────────────────────────────────────────────────────

function sanitizePhone(p: string): string {
  return p.replace(/[\s\-().]/g, '').replace(/^\+?216/, '').replace(/^00216/, '').replace(/^0+/, '');
}

async function readBody(res: Response): Promise<unknown> {
  const text = await res.text();
  try { return JSON.parse(text); } catch { return text; }
}

function normStr(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

// ── Zones cache ───────────────────────────────────────────────────────────────
// Zones structure: { "Gouvernorat": { "Delegation": { "Localite": { codePostal } } } }

type ZonesData = Record<string, Record<string, Record<string, { codePostal: string }>>>;

let _zonesCache: ZonesData | null = null;
let _zonesCachedAt = 0;
const ZONES_TTL_MS = 12 * 60 * 60 * 1000;

async function getZones(): Promise<ZonesData> {
  const now = Date.now();
  if (_zonesCache && now - _zonesCachedAt < ZONES_TTL_MS) return _zonesCache;
  try {
    const res = await fetch(`${BASE}/api/zones`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: TOKEN }),
      cache: 'no-store',
    });
    const data = await readBody(res);
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      _zonesCache = data as ZonesData;
      _zonesCachedAt = now;
      return _zonesCache;
    }
  } catch { /* fall through to cache */ }
  return _zonesCache ?? {};
}

type ResolvedZone = {
  gouvernorat: string;
  delegation: string;
  localite: string;
  codePostal: string;
};

async function resolveZone(gov: string): Promise<ResolvedZone | null> {
  const zones = await getZones();
  const govKeys = Object.keys(zones);
  if (!govKeys.length) return null;

  const g = normStr(gov);
  // 1. exact match
  let govKey = govKeys.find((k) => normStr(k) === g);
  // 2. partial match
  if (!govKey) govKey = govKeys.find((k) => normStr(k).includes(g) || g.includes(normStr(k)));
  if (!govKey) return null;

  const delegations = zones[govKey];
  const delegKey = Object.keys(delegations)[0];
  if (!delegKey) return null;

  const localites = delegations[delegKey];
  const locKey = Object.keys(localites)[0];
  if (!locKey) return null;

  return {
    gouvernorat: govKey,
    delegation: delegKey,
    localite: locKey,
    codePostal: localites[locKey]?.codePostal ?? '',
  };
}

// ── Public types ──────────────────────────────────────────────────────────────

export type AxessResult = {
  ok: boolean;
  barcode?: string;
  raw: unknown;
  error?: string;
};

export type AxessShipmentInput = {
  receiverName: string;
  receiverGov: string;
  receiverAddress: string;
  receiverPhone: string;
  receiverPhone2?: string;
  codAmount: number;
  productLabel: string;
  itemsCount: number;
  reference?: string;
  note?: string;
};

// ── Error helpers ─────────────────────────────────────────────────────────────

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

function extractBarcode(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object') return undefined;
  const o = payload as Record<string, unknown>;
  // Top-level trackingNumber
  if (typeof o.trackingNumber === 'string' && o.trackingNumber) return o.trackingNumber;
  // Nested under "pickup"
  const pickup = o.pickup;
  if (pickup && typeof pickup === 'object') {
    const p = pickup as Record<string, unknown>;
    if (typeof p.trackingNumber === 'string' && p.trackingNumber) return p.trackingNumber;
  }
  return undefined;
}

function isSuccess(httpStatus: number, payload: unknown): boolean {
  if (httpStatus < 200 || httpStatus >= 300) return false;
  if (payload && typeof payload === 'object') {
    const o = payload as Record<string, unknown>;
    if (typeof o.status === 'number' && o.status >= 400) return false;
    if (typeof o.status === 'string' && Number(o.status) >= 400) return false;
  }
  return true;
}

// ── API client ────────────────────────────────────────────────────────────────

export const axess = {
  async createShipment(s: AxessShipmentInput): Promise<AxessResult> {
    if (!TOKEN) return { ok: false, raw: null, error: 'AXESS_TOKEN missing' };

    const zone = await resolveZone(s.receiverGov);
    const gouvernorat = zone?.gouvernorat ?? s.receiverGov;
    const delegation = zone?.delegation ?? s.receiverGov;
    const localite = zone?.localite ?? s.receiverGov;
    const codePostal = zone?.codePostal ?? '';

    const body: Record<string, unknown> = {
      token: TOKEN,
      // Source
      nomContactSource: SOURCE_NOM,
      telContactSource: SOURCE_TEL || '00000000',
      adresseSource: SOURCE_ADDRESS,
      gouvernoratSource: SOURCE_GOV,
      delegationSource: SOURCE_DELEGATION,
      localiteSource: SOURCE_LOCALITE,
      // Destination
      adresseDestination: (s.receiverAddress ?? '').trim() || gouvernorat,
      gouvernoratDestination: gouvernorat,
      delegationDestination: delegation,
      localiteDestination: localite,
      ...(codePostal ? { codePostal } : {}),
      nomResponsableDestination: s.receiverName.trim(),
      telContactDestination: sanitizePhone(s.receiverPhone),
      ...(s.receiverPhone2 ? { telContactDestinationSecondaire: sanitizePhone(s.receiverPhone2) } : {}),
      // Product
      nomProduit: s.productLabel.slice(0, 200),
      description: s.productLabel.slice(0, 200),
      quantite: Math.max(1, Math.round(s.itemsCount)),
      prixTotal: Math.max(0, Math.round(s.codAmount)),
      ...(s.reference ? { reference: s.reference } : {}),
      allowOpening: false,
      fragile: false,
      type: 0,
    };

    // Use entrepot if configured — overrides source address fields
    if (ENTREPOT_ID) {
      body.idEntrepot = ENTREPOT_ID;
      delete body.adresseSource;
      delete body.gouvernoratSource;
      delete body.delegationSource;
      delete body.localiteSource;
    }

    try {
      const res = await fetch(`${BASE}/api/pickups/new/v3/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        cache: 'no-store',
      });
      const raw = await readBody(res);
      const ok = isSuccess(res.status, raw);
      const barcode = extractBarcode(raw);
      if (ok && barcode) return { ok: true, barcode, raw };
      if (ok && !barcode) {
        // Created but no tracking number in response — treat as error so admin knows
        return { ok: false, raw, error: `Créé mais pas de numéro de suivi dans la réponse: ${JSON.stringify(raw).slice(0, 200)}` };
      }
      return {
        ok: false,
        raw,
        error: extractError(raw) ?? `HTTP ${res.status} — ${typeof raw === 'string' ? raw.slice(0, 200) : JSON.stringify(raw).slice(0, 200)}`,
      };
    } catch (e) {
      return { ok: false, raw: null, error: e instanceof Error ? e.message : 'network error' };
    }
  },

  async getState(barcode: string): Promise<AxessResult> {
    if (!TOKEN) return { ok: false, raw: null, error: 'AXESS_TOKEN missing' };
    try {
      const res = await fetch(`${BASE}/api/v2/pickups/status/${encodeURIComponent(barcode)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: TOKEN }),
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
