import { parseToMinor } from '@/common/money';
import type { WooMetaEntry, WooOrderRaw } from '../woo-types';

export type MappedOrderItem = {
  legacyProductId: string;
  name: string;
  imageUrl: string | null;
  qty: number;
  unitPriceMinor: number;
  totalMinor: number;
  variation: Record<string, string> | null;
  bundleName: string | null;
};

export type MappedCarrierResult = {
  status: 'sent' | 'failed';
  response: string | null;
  tracking: string | null;
  error: string | null;
};

export type MappedOrder = {
  legacyId: string;
  status: string;
  createdAt: Date;
  customer: {
    firstName: string;
    lastName: string;
    phone: string;
    phone2: string;
    email: string;
    city: string;
    address: string;
    note: string;
  };
  items: MappedOrderItem[];
  totalMinor: number;
  shippingMinor: number;
  currency: string;
  deliveryCompany: string;
  privateNote: string;
  exchange: boolean;
  manualSubtotalMinor: number | null;
  manualTotalMinor: number | null;
  attempts: number;
  source: string;
  carrier: { navex: MappedCarrierResult | null; firstdelivery: MappedCarrierResult | null; axess: MappedCarrierResult | null };
};

function findMeta(meta: WooMetaEntry[], key: string): unknown {
  return meta.find((m) => m.key === key)?.value;
}
function metaString(meta: WooMetaEntry[], key: string): string {
  const v = findMeta(meta, key);
  return typeof v === 'string' ? v : '';
}

function mapCarrier(meta: WooMetaEntry[], prefix: string): MappedCarrierResult | null {
  const status = findMeta(meta, `${prefix}_status`);
  if (status !== 'sent' && status !== 'failed') return null;
  const response = findMeta(meta, `${prefix}_response`);
  const tracking = findMeta(meta, `${prefix}_tracking`);
  const error = findMeta(meta, `${prefix}_error`);
  return {
    status,
    response: typeof response === 'string' ? response : null,
    tracking: typeof tracking === 'string' ? tracking : null,
    error: typeof error === 'string' ? error : null,
  };
}

function numberish(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

export function mapWooOrder(raw: WooOrderRaw): MappedOrder {
  const meta = raw.meta_data ?? [];
  const activeShipping = (raw.shipping_lines ?? []).filter((l) => parseToMinor(l.total) > 0);
  const shippingMinor = activeShipping.length > 0 ? parseToMinor(activeShipping[0].total) : 0;

  const items: MappedOrderItem[] = (raw.line_items ?? []).map((li) => {
    const lineMeta = li.meta_data ?? [];
    const bundleMeta = lineMeta.find((m) => String(m.key).toLowerCase() === 'offre');
    const variationEntries = lineMeta.filter(
      (m) => !String(m.key ?? '').startsWith('_') && String(m.key).toLowerCase() !== 'offre',
    );
    const variation: Record<string, string> = {};
    for (const m of variationEntries) {
      const key = String(m.display_key ?? m.key ?? '');
      const value = typeof m.value === 'string' ? m.value : String(m.display_value ?? '');
      if (key && value) variation[key] = value;
    }
    return {
      legacyProductId: String(li.product_id),
      name: li.name,
      imageUrl: li.image?.src ?? null,
      qty: li.quantity,
      unitPriceMinor: parseToMinor(li.price),
      totalMinor: parseToMinor(li.total),
      variation: Object.keys(variation).length > 0 ? variation : null,
      bundleName: typeof bundleMeta?.value === 'string' ? bundleMeta.value : null,
    };
  });

  const manualTotal = numberish(findMeta(meta, '_mzem_manual_total'));
  const manualSubtotal = numberish(findMeta(meta, '_mzem_manual_subtotal'));
  let totalMinor = parseToMinor(raw.total);
  if (manualTotal !== null) {
    totalMinor = Math.round(manualTotal * 1000);
  } else if (totalMinor <= 0) {
    totalMinor = items.reduce((s, i) => s + (i.totalMinor || i.unitPriceMinor * i.qty), 0) + shippingMinor;
  }

  return {
    legacyId: String(raw.id),
    status: raw.status || 'pending',
    createdAt: new Date(raw.date_created),
    customer: {
      firstName: raw.billing.first_name ?? '',
      lastName: raw.billing.last_name ?? '',
      phone: raw.billing.phone ?? '',
      phone2: metaString(meta, '_mzem_phone_2'),
      email: raw.billing.email ?? '',
      city: raw.billing.city ?? '',
      address: raw.billing.address_1 ?? '',
      note: '',
    },
    items,
    totalMinor,
    shippingMinor,
    currency: raw.currency || 'TND',
    deliveryCompany: metaString(meta, '_mzem_delivery_company'),
    privateNote: metaString(meta, '_mzem_private_note'),
    exchange: metaString(meta, '_mzem_exchange') === 'yes',
    manualSubtotalMinor: manualSubtotal !== null ? Math.round(manualSubtotal * 1000) : null,
    manualTotalMinor: manualTotal !== null ? Math.round(manualTotal * 1000) : null,
    attempts: Number(metaString(meta, '_mzem_attempts')) || 0,
    source: metaString(meta, '_mzem_source'),
    carrier: {
      navex: mapCarrier(meta, '_navex'),
      firstdelivery: mapCarrier(meta, '_fd'),
      axess: mapCarrier(meta, '_axess'),
    },
  };
}
