import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { describeFetchError } from '@/common/fetch-error';
import { normalizeCarrierString, sanitizeCarrierPhone } from './carrier-phone';
import type { CarrierResult } from './navex.service';

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

type ZonesData = Record<string, Record<string, Record<string, { codePostal: string }>>>;
type ResolvedZone = { gouvernorat: string; delegation: string; localite: string; codePostal: string };

async function readBody(res: Response): Promise<unknown> {
  const text = await res.text();
  try { return JSON.parse(text); } catch { return text; }
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

function extractBarcode(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object') return undefined;
  const o = payload as Record<string, unknown>;
  if (typeof o.trackingNumber === 'string' && o.trackingNumber) return o.trackingNumber;
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

/** Ported from lib/axess.ts — same request shapes and zone resolution. */
@Injectable()
export class AxessService {
  private zonesCache: ZonesData | null = null;
  private zonesCachedAt = 0;
  private readonly ZONES_TTL_MS = 12 * 60 * 60 * 1000;

  constructor(private readonly config: ConfigService) {}

  get configured(): boolean {
    return Boolean(this.config.get<string>('AXESS_TOKEN'));
  }

  private base(): string {
    return (this.config.get<string>('AXESS_API_BASE') ?? 'https://fast.axesslogistique.com').replace(/\/+$/, '');
  }

  private token(): string {
    return this.config.get<string>('AXESS_TOKEN') ?? '';
  }

  private async getZones(): Promise<ZonesData> {
    const now = Date.now();
    if (this.zonesCache && now - this.zonesCachedAt < this.ZONES_TTL_MS) return this.zonesCache;
    try {
      const res = await fetch(`${this.base()}/api/zones`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: this.token() }),
      });
      const data = await readBody(res);
      if (data && typeof data === 'object' && !Array.isArray(data)) {
        this.zonesCache = data as ZonesData;
        this.zonesCachedAt = now;
        return this.zonesCache;
      }
    } catch { /* fall through to cache */ }
    return this.zonesCache ?? {};
  }

  private async resolveZone(gov: string): Promise<ResolvedZone | null> {
    const zones = await this.getZones();
    const govKeys = Object.keys(zones);
    if (!govKeys.length) return null;

    const g = normalizeCarrierString(gov);
    let govKey = govKeys.find((k) => normalizeCarrierString(k) === g);
    if (!govKey) govKey = govKeys.find((k) => normalizeCarrierString(k).includes(g) || g.includes(normalizeCarrierString(k)));
    if (!govKey) return null;

    const delegations = zones[govKey];
    const delegKey = Object.keys(delegations)[0];
    if (!delegKey) return null;
    const localites = delegations[delegKey];
    const locKey = Object.keys(localites)[0];
    if (!locKey) return null;

    return { gouvernorat: govKey, delegation: delegKey, localite: locKey, codePostal: localites[locKey]?.codePostal ?? '' };
  }

  async createShipment(s: AxessShipmentInput): Promise<CarrierResult> {
    if (!this.configured) return { ok: false, raw: null, error: 'AXESS_TOKEN missing' };

    const zone = await this.resolveZone(s.receiverGov);
    const gouvernorat = zone?.gouvernorat ?? s.receiverGov;
    const delegation = zone?.delegation ?? s.receiverGov;
    const localite = zone?.localite ?? s.receiverGov;
    const codePostal = zone?.codePostal ?? '';

    const entrepotId = this.config.get<string>('AXESS_ENTREPOT_ID');
    const body: Record<string, unknown> = {
      token: this.token(),
      nomContactSource: this.config.get<string>('AXESS_SOURCE_NOM') ?? 'Mzali Boutique',
      telContactSource: this.config.get<string>('AXESS_SOURCE_TEL') || '00000000',
      adresseSource: this.config.get<string>('AXESS_SOURCE_ADDRESS') ?? 'Tunis',
      gouvernoratSource: this.config.get<string>('AXESS_SOURCE_GOV') ?? 'Tunis',
      delegationSource: this.config.get<string>('AXESS_SOURCE_DELEGATION') ?? 'Tunis',
      localiteSource: this.config.get<string>('AXESS_SOURCE_LOCALITE') ?? 'Tunis',
      adresseDestination: (s.receiverAddress ?? '').trim() || gouvernorat,
      gouvernoratDestination: gouvernorat,
      delegationDestination: delegation,
      localiteDestination: localite,
      ...(codePostal ? { codePostal } : {}),
      nomResponsableDestination: s.receiverName.trim(),
      telContactDestination: sanitizeCarrierPhone(s.receiverPhone),
      ...(s.receiverPhone2 ? { telContactDestinationSecondaire: sanitizeCarrierPhone(s.receiverPhone2) } : {}),
      nomProduit: s.productLabel.slice(0, 200),
      description: s.productLabel.slice(0, 200),
      quantite: Math.max(1, Math.round(s.itemsCount)),
      prixTotal: Math.max(0, Math.round(s.codAmount)),
      ...(s.reference ? { reference: s.reference } : {}),
      allowOpening: false,
      fragile: false,
      type: 0,
    };

    if (entrepotId) {
      body.idEntrepot = Number(entrepotId);
      delete body.adresseSource;
      delete body.gouvernoratSource;
      delete body.delegationSource;
      delete body.localiteSource;
    }

    try {
      const res = await fetch(`${this.base()}/api/pickups/new/v3/`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const raw = await readBody(res);
      const ok = isSuccess(res.status, raw);
      const barcode = extractBarcode(raw);
      if (ok && barcode) return { ok: true, barcode, raw };
      if (ok && !barcode) return { ok: false, raw, error: `Créé mais pas de numéro de suivi dans la réponse` };
      return { ok: false, raw, error: extractError(raw) ?? `HTTP ${res.status}` };
    } catch (e) {
      return { ok: false, raw: null, error: describeFetchError(e) };
    }
  }

  async getState(barcode: string): Promise<CarrierResult> {
    if (!this.configured) return { ok: false, raw: null, error: 'AXESS_TOKEN missing' };
    try {
      const res = await fetch(`${this.base()}/api/v2/pickups/status/${encodeURIComponent(barcode)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: this.token() }),
      });
      const raw = await readBody(res);
      const ok = isSuccess(res.status, raw);
      return { ok, barcode, raw, error: ok ? undefined : (extractError(raw) ?? `HTTP ${res.status}`) };
    } catch (e) {
      return { ok: false, raw: null, error: describeFetchError(e) };
    }
  }
}
