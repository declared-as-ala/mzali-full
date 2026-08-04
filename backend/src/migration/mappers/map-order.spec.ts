import { mapWooOrder } from './map-order';
import type { WooOrderRaw } from '../woo-types';

function baseRaw(overrides: Partial<WooOrderRaw> = {}): WooOrderRaw {
  return {
    id: 100,
    number: '100',
    status: 'en-attente',
    currency: 'TND',
    total: '108.000',
    date_created: '2026-01-15T10:00:00',
    billing: {
      first_name: 'Ala', last_name: '', phone: '20123456', email: '',
      address_1: 'Rue Test', address_2: '', city: 'Tunis', state: '', postcode: '', country: 'TN',
    },
    shipping: {
      first_name: 'Ala', last_name: '', phone: '', email: '',
      address_1: 'Rue Test', address_2: '', city: 'Tunis', state: '', postcode: '', country: 'TN',
    },
    line_items: [
      { id: 1, product_id: 55, name: 'Robe Rouge', quantity: 2, price: '50.000', total: '100.000' },
    ],
    shipping_lines: [{ id: 1, method_id: 'flat_rate', method_title: 'Livraison', total: '8.000' }],
    meta_data: [],
    ...overrides,
  };
}

describe('mapWooOrder', () => {
  it('maps basic fields, shipping, and item snapshots', () => {
    const m = mapWooOrder(baseRaw());
    expect(m.legacyId).toBe('100');
    expect(m.status).toBe('en-attente');
    expect(m.shippingMinor).toBe(8000);
    expect(m.totalMinor).toBe(108000);
    expect(m.items).toEqual([
      {
        legacyProductId: '55', name: 'Robe Rouge', imageUrl: null, qty: 2,
        unitPriceMinor: 50000, totalMinor: 100000, variation: null, bundleName: null,
      },
    ]);
  });

  it('prefers _mzem_manual_total over the raw Woo total when present', () => {
    const raw = baseRaw({ meta_data: [{ id: 1, key: '_mzem_manual_total', value: '150' }] });
    expect(mapWooOrder(raw).totalMinor).toBe(150000);
    expect(mapWooOrder(raw).manualTotalMinor).toBe(150000);
  });

  it('reconstructs the total from line items + shipping when Woo total is zero (legacy orders)', () => {
    const raw = baseRaw({ total: '0' });
    // 2 * 50.000 + 8.000 shipping = 108.000
    expect(mapWooOrder(raw).totalMinor).toBe(108000);
  });

  it('extracts _mzem_* order meta into structured fields', () => {
    const raw = baseRaw({
      meta_data: [
        { id: 1, key: '_mzem_phone_2', value: '25123456' },
        { id: 2, key: '_mzem_delivery_company', value: 'Navex' },
        { id: 3, key: '_mzem_private_note', value: 'Fragile' },
        { id: 4, key: '_mzem_exchange', value: 'yes' },
        { id: 5, key: '_mzem_attempts', value: '3' },
        { id: 6, key: '_mzem_source', value: 'facebook' },
      ],
    });
    const m = mapWooOrder(raw);
    expect(m.customer.phone2).toBe('25123456');
    expect(m.deliveryCompany).toBe('Navex');
    expect(m.privateNote).toBe('Fragile');
    expect(m.exchange).toBe(true);
    expect(m.attempts).toBe(3);
    expect(m.source).toBe('facebook');
  });

  it('maps carrier meta into structured results only when a status is present', () => {
    const raw = baseRaw({
      meta_data: [
        { id: 1, key: '_navex_status', value: 'sent' },
        { id: 2, key: '_navex_tracking', value: '123456789' },
        { id: 3, key: '_navex_response', value: '{"ok":true}' },
      ],
    });
    const m = mapWooOrder(raw);
    expect(m.carrier.navex).toEqual({ status: 'sent', response: '{"ok":true}', tracking: '123456789', error: null });
    expect(m.carrier.firstdelivery).toBeNull();
    expect(m.carrier.axess).toBeNull();
  });

  it('extracts a bundle line label from an "Offre" line meta entry', () => {
    const raw = baseRaw({
      line_items: [
        {
          id: 1, product_id: 55, name: 'Robe', quantity: 1, price: '80', total: '80',
          meta_data: [{ key: 'Offre', value: 'Pack 2' }, { key: 'Taille', value: 'M' }],
        },
      ],
    });
    const m = mapWooOrder(raw);
    expect(m.items[0].bundleName).toBe('Pack 2');
    expect(m.items[0].variation).toEqual({ Taille: 'M' });
  });
});
