import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { normalizeCarrierString, sanitizeCarrierPhone } from './carrier-phone';
import type { CarrierResult } from './navex.service';

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

type FDLocality = { locality_id: number; locality_name: string; delegation_name: string; governorate_name: string };

async function readBody(res: Response): Promise<unknown> {
  const text = await res.text();
  try { return JSON.parse(text); } catch { return text; }
}

function extractBarcode(payload: unknown): string | undefined {
  if (!payload) return undefined;
  if (typeof payload === 'string') return payload.match(/\b\d{10,}\b/)?.[0];
  if (typeof payload === 'object') {
    const o = payload as Record<string, unknown>;
    for (const k of ['barCode', 'barcode', 'bar_code', 'code_a_barre', 'tracking', 'reference']) {
      const v = o[k];
      if (typeof v === 'string' && /^\d{8,}$/.test(v.trim())) return v.trim();
      if (typeof v === 'number' && String(v).length >= 8) return String(v);
    }
    if (o.result && typeof o.result === 'object' && !Array.isArray(o.result)) return extractBarcode(o.result);
    if (Array.isArray(o.result) && o.result.length > 0) return extractBarcode(o.result[0]);
  }
  return undefined;
}

function isSuccess(httpStatus: number, payload: unknown): boolean {
  if (httpStatus < 200 || httpStatus >= 300) return false;
  if (payload && typeof payload === 'object') {
    const o = payload as Record<string, unknown>;
    if (o.isError === true) return false;
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

/** Ported from lib/firstdelivery.ts — same request shapes and locality resolution. */
@Injectable()
export class FirstDeliveryService {
  private localitiesCache: FDLocality[] | null = null;
  private localitiesCachedAt = 0;
  private readonly LOCALITIES_TTL_MS = 12 * 60 * 60 * 1000;

  constructor(private readonly config: ConfigService) {}

  get configured(): boolean {
    return Boolean(this.config.get<string>('FIRST_DELIVERY_TOKEN'));
  }

  private base(): string {
    return (this.config.get<string>('FIRST_DELIVERY_API_BASE') ?? 'https://www.firstdeliverygroup.com/api/v2').replace(/\/+$/, '');
  }

  private authHeaders(): Record<string, string> {
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${this.config.get<string>('FIRST_DELIVERY_TOKEN') ?? ''}` };
  }

  private async getLocalities(): Promise<FDLocality[]> {
    const now = Date.now();
    if (this.localitiesCache && now - this.localitiesCachedAt < this.LOCALITIES_TTL_MS) return this.localitiesCache;
    try {
      const res = await fetch(`${this.base()}/localities`, { headers: this.authHeaders() });
      const data = (await readBody(res)) as { result?: FDLocality[] };
      const list = Array.isArray(data?.result) ? data.result : [];
      if (list.length > 0) { this.localitiesCache = list; this.localitiesCachedAt = now; }
      return list.length > 0 ? list : (this.localitiesCache ?? []);
    } catch {
      return this.localitiesCache ?? [];
    }
  }

  private async resolveLocalityId(gov: string, city = '', address = ''): Promise<number> {
    const localities = await this.getLocalities();
    if (!localities.length) return 1534; // Ain Zaghouen Nord fallback

    const g = normalizeCarrierString(gov);
    const c = normalizeCarrierString(city);
    const addr = normalizeCarrierString(address);

    let hit = localities.find((l) => normalizeCarrierString(l.governorate_name) === g);
    if (hit) return hit.locality_id;
    hit = localities.find((l) => normalizeCarrierString(l.governorate_name).includes(g) || g.includes(normalizeCarrierString(l.governorate_name)));
    if (hit) return hit.locality_id;
    for (const l of localities) {
      const govNorm = normalizeCarrierString(l.governorate_name);
      if (govNorm.length > 3 && (c.includes(govNorm) || addr.includes(govNorm))) return l.locality_id;
    }
    hit = localities.find((l) => normalizeCarrierString(l.delegation_name) === g || normalizeCarrierString(l.delegation_name) === c);
    if (hit) return hit.locality_id;
    hit = localities.find((l) => normalizeCarrierString(l.delegation_name).includes(g) || g.includes(normalizeCarrierString(l.delegation_name)));
    if (hit) return hit.locality_id;
    hit = localities.find((l) => normalizeCarrierString(l.locality_name) === g || normalizeCarrierString(l.locality_name) === c);
    if (hit) return hit.locality_id;
    hit = localities.find((l) => normalizeCarrierString(l.locality_name).includes(g) || g.includes(normalizeCarrierString(l.locality_name)));
    if (hit) return hit.locality_id;

    const defaultHit = localities.find((l) => normalizeCarrierString(l.governorate_name) === 'tunis' || normalizeCarrierString(l.governorate_name) === 'ariana') || localities[0];
    return defaultHit ? defaultHit.locality_id : 1534;
  }

  async createShipment(s: FirstDeliveryShipmentInput): Promise<CarrierResult> {
    if (!this.configured) return { ok: false, raw: null, error: 'FIRST_DELIVERY_TOKEN missing' };

    const gov = (s.receiverGov ?? '').trim();
    const ville = (s.receiverCity ?? s.receiverGov ?? '').trim();
    const adresse = (s.receiverAddress ?? '').trim() || gov;
    const locality_id = await this.resolveLocalityId(gov, ville, adresse);

    const body = {
      Client: {
        nom: s.receiverName.trim(),
        locality_id,
        gouvernerat: gov,
        ville,
        adresse,
        telephone: sanitizeCarrierPhone(s.receiverPhone),
        telephone2: s.receiverPhone2 ? sanitizeCarrierPhone(s.receiverPhone2) : '',
      },
      Produit: {
        prix: Math.min(999, Math.max(0, Math.round(s.codAmount))),
        designation: s.productLabel.slice(0, 200),
        nombreArticle: Math.max(1, Math.round(s.itemsCount)),
        commentaire: (s.note ?? '').slice(0, 200),
        article: s.productLabel.slice(0, 100),
        nombreEchange: 0,
      },
    };

    try {
      const res = await fetch(`${this.base()}/create`, { method: 'POST', headers: this.authHeaders(), body: JSON.stringify(body) });
      const raw = await readBody(res);
      const ok = isSuccess(res.status, raw);
      const barcode = extractBarcode(raw);
      if (ok) return { ok: true, barcode, raw };
      return { ok: false, raw, error: extractError(raw) ?? `HTTP ${res.status}` };
    } catch (e) {
      return { ok: false, raw: null, error: e instanceof Error ? e.message : 'network error' };
    }
  }

  async getState(barcode: string): Promise<CarrierResult> {
    if (!this.configured) return { ok: false, raw: null, error: 'FIRST_DELIVERY_TOKEN missing' };
    try {
      const res = await fetch(`${this.base()}/etat`, { method: 'POST', headers: this.authHeaders(), body: JSON.stringify({ barCode: barcode }) });
      const raw = await readBody(res);
      const ok = isSuccess(res.status, raw);
      return { ok, barcode, raw, error: ok ? undefined : (extractError(raw) ?? `HTTP ${res.status}`) };
    } catch (e) {
      return { ok: false, raw: null, error: e instanceof Error ? e.message : 'network error' };
    }
  }

  async cancelShipment(barcode: string): Promise<CarrierResult> {
    if (!this.configured) return { ok: false, raw: null, error: 'FIRST_DELIVERY_TOKEN missing' };
    try {
      const res = await fetch(`${this.base()}/cancel-orders`, { method: 'POST', headers: this.authHeaders(), body: JSON.stringify({ barCodes: [barcode] }) });
      const raw = await readBody(res);
      const ok = isSuccess(res.status, raw);
      return { ok, barcode, raw, error: ok ? undefined : (extractError(raw) ?? `HTTP ${res.status}`) };
    } catch (e) {
      return { ok: false, raw: null, error: e instanceof Error ? e.message : 'network error' };
    }
  }
}
