/**
 * Navex.tn API client — server-only.
 *
 * Real spec from https://app.navex.tn/api/documentation.php:
 *   • TOKEN is part of the URL path, NOT the Authorization header.
 *   • Endpoint shape:  POST https://app.navex.tn/api/{TOKEN}/v1/post.php
 *   • Body: application/x-www-form-urlencoded
 *
 * Tokens (one per action):
 *   - NAVEX_TOKEN_ADD    → add shipment    (POST,  fields: prix,nom,gouvernerat,...)
 *   - NAVEX_TOKEN_GET    → get state       (POST,  field: code)
 *                          → list pending  (POST,  field: getattente=1)
 *                          → multi-track   (POST,  field: codes=...)
 *   - NAVEX_TOKEN_DELETE → cancel shipment (POST,  field: delete_code)
 */
import 'server-only';

const HOST = (process.env.NAVEX_API_BASE ?? 'https://app.navex.tn').replace(/\/+$/, '');
const TOK_ADD = process.env.NAVEX_TOKEN_ADD ?? '';
const TOK_GET = process.env.NAVEX_TOKEN_GET ?? '';
const TOK_DEL = process.env.NAVEX_TOKEN_DELETE ?? '';

function endpointFor(token: string): string {
  return `${HOST}/api/${token}/v1/post.php`;
}

export const navexConfigured = Boolean(TOK_ADD);

/**
 * Build the Navex `designation` + `nb_article` for an order, grouping bundle slots into
 * a single line — mirroring how the admin UI displays them. Without grouping, a 2-slot
 * bundle would show up on the Navex BL as "1x prod | 1x prod" with quantity 2.
 *
 * Each item is either an OrderLineItem (has `quantity` + `attributes`) or a CartItem
 * (has `qty` + `variation`/`bundleName`/`bundleId`). We accept both shapes.
 */
type NavexLineLike = {
  productId: string;
  name: string;
  quantity?: number;
  qty?: number;
  attributes?: { key: string; value: string }[];
  variation?: Record<string, string>;
  bundleName?: string;
  bundleId?: string;
  bundleSlot?: number;
};

function getVariationValues(it: NavexLineLike): string[] {
  const values = new Set<string>();

  // 1. If it has a structured variation object
  if (it.variation && Object.keys(it.variation).length > 0) {
    for (const [k, v] of Object.entries(it.variation)) {
      if (v && typeof v === 'string' && v.trim() && !/^offre$/i.test(k)) {
        const valNorm = v.trim().toLowerCase();
        if (valNorm && valNorm !== '—') {
          values.add(valNorm);
        }
      }
    }
  }

  // 2. If it has attributes array (fallback or bundle slot parsing)
  if (it.attributes && it.attributes.length > 0) {
    for (const attr of it.attributes) {
      if (!attr.key || !attr.value) continue;
      const keyNorm = attr.key.trim().toLowerCase();
      if (keyNorm === 'offre') continue;

      if (/^item\s*\d+/i.test(keyNorm)) {
        // Parse bundle slot attributes: "TALLIE: XXL · COULEUR: BLANC"
        const parts = attr.value.split(/[·;,]/);
        for (const part of parts) {
          const colonIdx = part.indexOf(':');
          let val = '';
          if (colonIdx !== -1) {
            val = part.slice(colonIdx + 1).trim();
          } else {
            val = part.trim();
          }
          const valNorm = val.toLowerCase().trim();
          if (valNorm && valNorm !== '—') {
            values.add(valNorm);
          }
        }
      } else {
        // Standard attribute - we want the value, not the key.
        const valNorm = attr.value.trim().toLowerCase();
        if (valNorm && valNorm !== '—') {
          values.add(valNorm);
        }
      }
    }
  }

  return Array.from(values);
}

export function buildNavexDesignation(items: NavexLineLike[]): { designation: string; nbArticle: number } {
  if (!items || items.length === 0) {
    return { designation: '', nbArticle: 1 };
  }

  const parts: string[] = [];
  let totalArticles = 0;

  for (const it of items) {
    const qty = it.quantity ?? it.qty ?? 1;
    totalArticles += qty;

    const name = it.name.toLowerCase().trim();
    const vars = getVariationValues(it);
    const varsStr = vars.length > 0 ? ` (${vars.join(', ')})` : '';

    parts.push(`${name}${varsStr} x ${qty}`);
  }

  const designation = parts.join(' | ').slice(0, 200);
  const nbArticle = Math.max(1, totalArticles);

  return { designation, nbArticle };
}

export type NavexShipmentInput = {
  reference?: string;
  receiverName: string;
  receiverPhone: string;
  receiverPhone2?: string;
  receiverGov: string;
  receiverCity?: string;
  receiverAddress: string;
  codAmount: number;
  itemsCount: number;
  productLabel: string;
  note?: string;
  echange?: boolean;
};

export type NavexResult = {
  ok: boolean;
  barcode?: string;
  raw: unknown;
  error?: string;
};

const GOVS = [
  'Ariana', 'Béja', 'Ben Arous', 'Bizerte', 'Gabès', 'Gafsa',
  'Jendouba', 'Kairouan', 'Kasserine', 'Kébili', 'La Manouba',
  'Le Kef', 'Mahdia', 'Médenine', 'Monastir', 'Nabeul', 'Sfax',
  'Sidi Bouzid', 'Siliana', 'Sousse', 'Tataouine', 'Tozeur',
  'Tunis', 'Zaghouan',
];

/** Accept loose user-typed governorates (Kef, Manouba, Beja…) and normalize to the exact spelling Navex expects. */
function normalizeGov(input: string): string {
  if (!input) return '';
  const norm = input.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  for (const g of GOVS) {
    const gNorm = g.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    if (gNorm === norm) return g;
  }
  for (const g of GOVS) {
    const gNorm = g.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    if (gNorm.includes(norm) || norm.includes(gNorm)) return g;
  }
  // Common aliases
  const aliases: Record<string, string> = {
    kef: 'Le Kef', manouba: 'La Manouba', mannouba: 'La Manouba',
    beja: 'Béja', gabes: 'Gabès', medenine: 'Médenine', kebili: 'Kébili',
  };
  return aliases[norm] ?? input;
}

function form(body: Record<string, string | number | undefined>): URLSearchParams {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(body)) {
    p.append(k, v === undefined || v === null ? '' : String(v));
  }
  return p;
}

async function readBody(res: Response): Promise<unknown> {
  const text = await res.text();
  try { return JSON.parse(text); } catch { return text; }
}

function extractBarcode(payload: unknown): string | undefined {
  if (!payload) return undefined;
  if (typeof payload === 'string') {
    const m = payload.match(/\b\d{8,}\b/);
    return m?.[0];
  }
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
    if (o.data && typeof o.data === 'object') return extractBarcode(o.data);
  }
  return undefined;
}

function statusMessage(raw: unknown): string | undefined {
  if (raw && typeof raw === 'object') {
    const o = raw as Record<string, unknown>;
    if (typeof o.status_message === 'string') return o.status_message;
    if (typeof o.message === 'string') return o.message;
  }
  return undefined;
}

function isSuccessStatus(raw: unknown): boolean {
  if (raw && typeof raw === 'object') {
    const o = raw as Record<string, unknown>;
    if (o.status === 1 || o.status === '1' || o.status === true) return true;
    const sm = String(o.status_message ?? '').toLowerCase();
    if (sm.includes('added') || sm.includes('ajouté') || sm.includes('success')) return true;
  }
  return false;
}

export const navex = {
  /** Create a shipment. Returns barcode (status_message contains the tracking code). */
  async createShipment(s: NavexShipmentInput): Promise<NavexResult> {
    if (!TOK_ADD) return { ok: false, raw: null, error: 'NAVEX_TOKEN_ADD missing' };

    const body = form({
      prix: Math.max(0, Math.round(s.codAmount)),
      nom: s.receiverName,
      gouvernerat: normalizeGov(s.receiverGov),
      ville: s.receiverCity ?? s.receiverGov,
      adresse: s.receiverAddress,
      tel: s.receiverPhone,
      tel2: s.receiverPhone2 ?? '',
      designation: s.productLabel,
      nb_article: Math.max(1, Math.round(s.itemsCount)),
      msg: s.note ?? s.reference ?? '',
      echange: s.echange ? '1' : '0',
      article: '',
      nb_echange: '0',
      ouvrir: 'Oui',
      sender_name: '',
      sender_location: '',
      sender_gouvernorat: '',
    });

    try {
      const res = await fetch(endpointFor(TOK_ADD), {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
        cache: 'no-store',
      });
      const raw = await readBody(res);

      // Navex returns 201 on success or 200 with JSON envelope. Some installs return 200 + status:0 on failure.
      const ok = (res.status >= 200 && res.status < 300) && isSuccessStatus(raw);
      const barcode = extractBarcode(raw);

      if (ok && barcode) return { ok: true, barcode, raw };
      if (ok && !barcode) return { ok: true, raw };  // success but no barcode parsed
      return { ok: false, raw, error: statusMessage(raw) ?? `HTTP ${res.status}` };
    } catch (e) {
      return { ok: false, raw: null, error: e instanceof Error ? e.message : 'network error' };
    }
  },

  /** Track a single shipment by code. */
  async getState(barcode: string): Promise<NavexResult> {
    if (!TOK_GET) return { ok: false, raw: null, error: 'NAVEX_TOKEN_GET missing' };
    try {
      const res = await fetch(endpointFor(TOK_GET), {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form({ code: barcode, include_date: '1', include_prix: '1' }),
        cache: 'no-store',
      });
      const raw = await readBody(res);
      return { ok: isSuccessStatus(raw), barcode, raw, error: isSuccessStatus(raw) ? undefined : statusMessage(raw) };
    } catch (e) {
      return { ok: false, raw: null, error: e instanceof Error ? e.message : 'network error' };
    }
  },

  /** Cancel a shipment. */
  async deleteShipment(barcode: string): Promise<NavexResult> {
    if (!TOK_DEL) return { ok: false, raw: null, error: 'NAVEX_TOKEN_DELETE missing' };
    try {
      const res = await fetch(endpointFor(TOK_DEL), {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form({ delete_code: barcode }),
        cache: 'no-store',
      });
      const raw = await readBody(res);
      return { ok: isSuccessStatus(raw), barcode, raw, error: isSuccessStatus(raw) ? undefined : statusMessage(raw) };
    } catch (e) {
      return { ok: false, raw: null, error: e instanceof Error ? e.message : 'network error' };
    }
  },
};
