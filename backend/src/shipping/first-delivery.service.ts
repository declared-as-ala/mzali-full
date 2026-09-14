import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { describeFetchError } from '@/common/fetch-error';
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
  estFragile?: 'oui' | 'non';
  ouvrirColis?: 'oui' | 'non';
};

type FDLocality = { locality_id: number; locality_name: string; delegation_name: string; governorate_name: string };

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
    return true; // key is hardcoded
  }

  private base(): string {
    return (this.config.get<string>('FIRST_DELIVERY_API_BASE') ?? 'https://www.firstdeliverygroup.com/api/v2').replace(/\/+$/, '');
  }

  private static readonly HARDCODED_TOKEN = 'f56f557e-2dda-472d-8bb9-a1768257c308';

  private authHeaders(): Record<string, string> {
    // Hardcoded token per requirement — do NOT use any other API key from .env
    const token = FirstDeliveryService.HARDCODED_TOKEN;
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
  }

  private async getLocalities(): Promise<FDLocality[]> {
    const now = Date.now();
    if (this.localitiesCache && now - this.localitiesCachedAt < this.LOCALITIES_TTL_MS) return this.localitiesCache;
    try {
      const res = await fetch(`${this.base()}/localities`, { headers: this.authHeaders() });
      const data = (await readBody(res)) as { result?: FDLocality[] };
      const list = res.ok && data && Array.isArray(data.result)
        ? data.result.filter((l) => l && Number.isInteger(l.locality_id) && l.locality_id > 0
          && typeof l.locality_name === 'string' && !!l.locality_name.trim()
          && typeof l.delegation_name === 'string' && !!l.delegation_name.trim()
          && typeof l.governorate_name === 'string' && !!l.governorate_name.trim())
        : [];
      if (list.length > 0) { this.localitiesCache = list; this.localitiesCachedAt = now; }
      return list.length > 0 ? list : (this.localitiesCache ?? []);
    } catch {
      return this.localitiesCache ?? [];
    }
  }

  private normGov(s: string | undefined | null): string {
    if (!s) return '';
    let str = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    for (const [ar, fr] of Object.entries(ARABIC_LOCALITIES)) {
      if (str.includes(ar)) str = str.replaceAll(ar, ' ' + fr + ' ');
    }
    const clean = str
      .replace(/^(la|le|les|el)\s+/, '')
      .replace(/[^a-z0-9]/g, '')
      .trim();
    if (clean === 'manouba' || clean === 'mannouba') return 'manouba';
    if (clean === 'kef') return 'kef';
    return clean;
  }

  private async resolveLocality(gov: string, city = '', address = ''): Promise<FDLocality | null> {
    const localities = await this.getLocalities();
    const g = this.normGov(gov);
    const c = this.normGov(city);
    const addr = this.normGov(address);

    const sameGov = localities.filter((l) => g && this.normGov(l.governorate_name) === g);
    const pool = sameGov.length > 0 ? sameGov : localities;

    const hit =
      pool.find((l) => {
        const name = this.normGov(l.locality_name);
        return name.length >= 3 && addr.includes(name);
      })
      ?? pool.find((l) => {
        const del = this.normGov(l.delegation_name);
        return del.length >= 3 && addr.includes(del);
      })
      ?? pool.find((l) => c && this.normGov(l.locality_name) === c)
      ?? pool.find((l) => c && this.normGov(l.delegation_name) === c)
      ?? pool.find((l) => g && this.normGov(l.delegation_name) === g)
      ?? sameGov[0];

    return hit ?? null;
  }

  async createShipment(s: FirstDeliveryShipmentInput): Promise<CarrierResult> {
    if (!this.configured) return { ok: false, raw: null, error: 'FIRST_DELIVERY_TOKEN missing' };

    const gov = (s.receiverGov ?? '').trim();
    const ville = (s.receiverCity ?? s.receiverGov ?? '').trim();
    const adresse = (s.receiverAddress ?? '').trim() || gov;
    if (!gov && !ville) return { ok: false, raw: null, error: 'First Delivery : sélectionnez une ville et enregistrez la commande avant de renvoyer.' };
    const locality = await this.resolveLocality(gov, ville, adresse);
    if (!locality) return { ok: false, raw: null, error: 'First Delivery : localité introuvable ou indisponible. Vérifiez la ville et le gouvernorat de la commande.' };

    const body = {
      Client: {
        nom: s.receiverName.trim(),
        locality_id: locality.locality_id,
        gouvernerat: locality.governorate_name,
        ville: locality.delegation_name,
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
        estFragile: s.estFragile ?? 'non',
        ouvrirColis: s.ouvrirColis ?? 'non',
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
      return { ok: false, raw: null, error: describeFetchError(e) };
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
      return { ok: false, raw: null, error: describeFetchError(e) };
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
      return { ok: false, raw: null, error: describeFetchError(e) };
    }
  }
}
