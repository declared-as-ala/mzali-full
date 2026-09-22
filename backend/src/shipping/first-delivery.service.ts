import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { describeFetchError } from '@/common/fetch-error';
import { sanitizeCarrierPhone } from './carrier-phone';
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
  /**
   * Admin-confirmed First Delivery locality id, bypassing automatic
   * resolution entirely. Set this once the admin has confirmed the
   * destination (see `previewLocality`) to guarantee the exact locality
   * the admin picked is the one actually sent — never re-resolved from
   * free text on the way out.
   */
  localityId?: number;
};

export type FDLocality = { locality_id: number; locality_name: string; delegation_name: string; governorate_name: string };

export type LocalityResolution =
  | { status: 'resolved'; locality: FDLocality }
  | { status: 'ambiguous'; candidates: FDLocality[] }
  | { status: 'not_found' };

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

  /**
   * Normalizes for comparison while preserving word boundaries (single
   * spaces between words) instead of collapsing everything into one
   * blob. Word-boundary-safe matching is what `addressContains` below
   * relies on to avoid false substring hits across word boundaries.
   */
  private normGov(s: string | undefined | null): string {
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

  /** Whole-word-boundary substring check: does `haystack` contain `needle` as a contiguous run of whole words? */
  private addressContains(haystack: string, needle: string): boolean {
    if (!needle || needle.length < 3) return false;
    return ` ${haystack} `.includes(` ${needle} `);
  }

  /**
   * Resolves a First Delivery locality from the order's governorate, city
   * and free-text address.
   *
   * Priority — explicit, structured signals always win over fuzzy
   * free-text matching, and the free-text address is only used to
   * DISAMBIGUATE within an already-narrowed set of candidates, never to
   * override an exact city/delegation selection with an unrelated
   * delegation found by a loose substring match. When more than one
   * locality remains equally plausible, the result is `ambiguous` rather
   * than silently picking the first array entry — callers must surface
   * that to the admin for manual confirmation instead of guessing (this
   * is what previously caused an unrelated delegation such as "Akouda"
   * to be silently inserted for a "Sousse" + free-text address order).
   */
  private async resolveLocalityDetailed(gov: string, city = '', address = ''): Promise<LocalityResolution> {
    const localities = await this.getLocalities();
    const g = this.normGov(gov);
    const c = this.normGov(city);
    const addr = this.normGov(address);

    const sameGov = localities.filter((l) => g && this.normGov(l.governorate_name) === g);
    const pool = sameGov.length > 0 ? sameGov : localities;

    // 1) Explicit, exact match: the customer's city IS a real delegation or
    //    locality name (not just the governorate) — the strongest signal.
    const delegationMatches = c ? pool.filter((l) => this.normGov(l.delegation_name) === c) : [];
    const localityMatches = c ? pool.filter((l) => this.normGov(l.locality_name) === c) : [];
    const explicit = delegationMatches.length > 0 ? delegationMatches : localityMatches;

    if (explicit.length === 1) return { status: 'resolved', locality: explicit[0] };
    if (explicit.length > 1) {
      // City matched a delegation with several localities in it — use the
      // address to pick ONE of THOSE localities, never one from a
      // different, unselected delegation.
      const withinExplicit = explicit.filter((l) => addr && this.addressContains(addr, this.normGov(l.locality_name)));
      if (withinExplicit.length === 1) return { status: 'resolved', locality: withinExplicit[0] };
      return { status: 'ambiguous', candidates: withinExplicit.length > 1 ? withinExplicit : explicit };
    }

    // 2) No explicit delegation/locality selection — fall back to matching
    //    the free-text address against locality names within the governorate.
    //    Prefer the longest (most specific) matching name; if several
    //    equally-specific, distinct localities match, that is genuinely
    //    ambiguous — do not guess which one the customer meant.
    if (addr) {
      const localityHits = pool.filter((l) => this.addressContains(addr, this.normGov(l.locality_name)));
      if (localityHits.length > 0) {
        const maxLen = Math.max(...localityHits.map((l) => this.normGov(l.locality_name).length));
        const best = localityHits.filter((l) => this.normGov(l.locality_name).length === maxLen);
        if (best.length === 1) return { status: 'resolved', locality: best[0] };
        return { status: 'ambiguous', candidates: best };
      }

      const delegationHits = pool.filter((l) => this.addressContains(addr, this.normGov(l.delegation_name)));
      if (delegationHits.length === 1) return { status: 'resolved', locality: delegationHits[0] };
      if (delegationHits.length > 1) return { status: 'ambiguous', candidates: delegationHits };
    }

    // 3) Nothing in the address helped — only auto-resolve if the whole
    //    governorate maps to a single locality; otherwise ask the admin.
    if (sameGov.length === 1) return { status: 'resolved', locality: sameGov[0] };
    if (sameGov.length > 1) return { status: 'ambiguous', candidates: sameGov };
    return { status: 'not_found' };
  }

  /** Public, side-effect-free preview used by the admin UI before sending. */
  async previewLocality(gov: string, city = '', address = ''): Promise<LocalityResolution> {
    return this.resolveLocalityDetailed(gov, city, address);
  }

  /**
   * Distinct délégation ("Mo3tamadia") names under one governorate, from
   * First Delivery's own live locality directory — never a separately
   * maintained hardcoded list, so the admin's "Localité" picker can never
   * offer a name First Delivery itself doesn't recognize. Powers the
   * per-governorate `admin/shipping/firstdelivery/delegations` endpoint.
   */
  async delegationsForGovernorate(gov: string): Promise<string[]> {
    const g = this.normGov(gov);
    if (!g) return [];
    const localities = await this.getLocalities();
    const names = new Set(
      localities.filter((l) => this.normGov(l.governorate_name) === g).map((l) => l.delegation_name),
    );
    return [...names].sort((a, b) => a.localeCompare(b, 'fr'));
  }

  async createShipment(s: FirstDeliveryShipmentInput): Promise<CarrierResult> {
    if (!this.configured) return { ok: false, raw: null, error: 'FIRST_DELIVERY_TOKEN missing' };

    const gov = (s.receiverGov ?? '').trim();
    const ville = (s.receiverCity ?? s.receiverGov ?? '').trim();
    const adresse = (s.receiverAddress ?? '').trim() || gov;
    if (!gov && !ville) return { ok: false, raw: null, error: 'First Delivery : sélectionnez une ville et enregistrez la commande avant de renvoyer.' };

    let locality: FDLocality | null = null;
    if (s.localityId) {
      const localities = await this.getLocalities();
      locality = localities.find((l) => l.locality_id === s.localityId) ?? null;
      if (!locality) return { ok: false, raw: null, error: "First Delivery : la localité confirmée est introuvable, veuillez la resélectionner." };
    } else {
      const resolution = await this.resolveLocalityDetailed(gov, ville, adresse);
      if (resolution.status === 'ambiguous') {
        return {
          ok: false,
          raw: null,
          error: "First Delivery : localité à confirmer — plusieurs localités correspondent, sélectionnez la bonne avant d'envoyer.",
          needsConfirmation: true,
          candidates: resolution.candidates.map((l) => ({
            localityId: l.locality_id,
            label: `${l.locality_name} — ${l.delegation_name}, ${l.governorate_name}`,
          })),
        };
      }
      if (resolution.status === 'not_found') {
        return { ok: false, raw: null, error: 'First Delivery : localité introuvable ou indisponible. Vérifiez la ville et le gouvernorat de la commande.' };
      }
      locality = resolution.locality;
    }

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
