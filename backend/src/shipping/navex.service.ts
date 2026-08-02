import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { extractNavexBarcode, isNavexSuccessStatus, navexStatusMessage, normalizeGov } from './navex.helpers';

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

export type CarrierResult = { ok: boolean; barcode?: string; raw: unknown; error?: string };

function form(body: Record<string, string | number | undefined>): URLSearchParams {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(body)) p.append(k, v === undefined || v === null ? '' : String(v));
  return p;
}

async function readBody(res: Response): Promise<unknown> {
  const text = await res.text();
  try { return JSON.parse(text); } catch { return text; }
}

/** Ported from lib/navex.ts — same request shapes and endpoint layout. */
@Injectable()
export class NavexService {
  constructor(private readonly config: ConfigService) {}

  get configured(): boolean {
    return Boolean(this.config.get<string>('NAVEX_TOKEN_ADD'));
  }

  private endpointFor(token: string): string {
    const host = (this.config.get<string>('NAVEX_API_BASE') ?? 'https://app.navex.tn').replace(/\/+$/, '');
    return `${host}/api/${token}/v1/post.php`;
  }

  async createShipment(s: NavexShipmentInput): Promise<CarrierResult> {
    const token = this.config.get<string>('NAVEX_TOKEN_ADD');
    if (!token) return { ok: false, raw: null, error: 'NAVEX_TOKEN_ADD missing' };

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
      const res = await fetch(this.endpointFor(token), {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      });
      const raw = await readBody(res);
      const ok = res.status >= 200 && res.status < 300 && isNavexSuccessStatus(raw);
      const barcode = extractNavexBarcode(raw);
      if (ok && barcode) return { ok: true, barcode, raw };
      if (ok && !barcode) return { ok: true, raw };
      return { ok: false, raw, error: navexStatusMessage(raw) ?? `HTTP ${res.status}` };
    } catch (e) {
      return { ok: false, raw: null, error: e instanceof Error ? e.message : 'network error' };
    }
  }

  async getState(barcode: string): Promise<CarrierResult> {
    const token = this.config.get<string>('NAVEX_TOKEN_GET');
    if (!token) return { ok: false, raw: null, error: 'NAVEX_TOKEN_GET missing' };
    try {
      const res = await fetch(this.endpointFor(token), {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form({ code: barcode, include_date: '1', include_prix: '1' }),
      });
      const raw = await readBody(res);
      const ok = isNavexSuccessStatus(raw);
      return { ok, barcode, raw, error: ok ? undefined : navexStatusMessage(raw) };
    } catch (e) {
      return { ok: false, raw: null, error: e instanceof Error ? e.message : 'network error' };
    }
  }

  async deleteShipment(barcode: string): Promise<CarrierResult> {
    const token = this.config.get<string>('NAVEX_TOKEN_DELETE');
    if (!token) return { ok: false, raw: null, error: 'NAVEX_TOKEN_DELETE missing' };
    try {
      const res = await fetch(this.endpointFor(token), {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form({ delete_code: barcode }),
      });
      const raw = await readBody(res);
      const ok = isNavexSuccessStatus(raw);
      return { ok, barcode, raw, error: ok ? undefined : navexStatusMessage(raw) };
    } catch (e) {
      return { ok: false, raw: null, error: e instanceof Error ? e.message : 'network error' };
    }
  }
}
