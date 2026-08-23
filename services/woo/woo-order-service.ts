import type { CheckoutPayload, OrderResponse, OrderStatusCounts } from '@/types';
import type { OrderCountsQuery, OrderService, OrderListQuery, OrderListResult, OrderUpdate } from '../order-service';
import { wooClient } from './woo-client';
import type { WooOrderRaw } from './woo-types';
import { mapOrder } from './woo-mappers';
import { navex, navexConfigured, buildNavexDesignation } from '@/lib/navex';

export class WooCommerceOrderService implements OrderService {
  async list(query: OrderListQuery = {}): Promise<OrderListResult> {
    const res = await wooClient.get<WooOrderRaw[]>('/orders', {
      page: query.page ?? 1,
      per_page: query.perPage ?? 50,
      status: query.status && query.status !== 'any' ? query.status : 'any',
      search: query.search || undefined,
      after: query.after || undefined,
      before: query.before || undefined,
    });
    const items = res.data.map(mapOrder);
    return { items, total: res.total, totalPages: res.totalPages, page: query.page ?? 1 };
  }

  /**
   * WooCommerce has no equivalent to the Mongo backend's single-aggregation
   * counts endpoint (and never got the tentative-1..5 migration — this
   * provider is legacy/rollback-only, still on the flat 'tentative'
   * status), so this falls back to one list({perPage:1}) request per
   * bucket, same as the admin orders page used to do inline before the
   * mzali-api provider got a real aggregation. Only exercised if
   * COMMERCE_PROVIDER is ever rolled back to 'woocommerce'.
   */
  async counts(query: OrderCountsQuery = {}): Promise<OrderStatusCounts> {
    const buckets = ['en-attente', 'confirme', 'tentative', 'annule', 'checkout-draft', 'trash'] as const;
    const totals = await Promise.all(
      buckets.map((status) =>
        this.list({ page: 1, perPage: 1, status, search: query.search, after: query.after, before: query.before })
          .then((r) => r.total)
          .catch(() => 0),
      ),
    );
    const [pending, confirmed, tentative, cancelled, abandoned, trash] = totals;
    return {
      total: pending + confirmed + tentative + cancelled,
      pending,
      confirmed,
      // Woo never had per-attempt statuses — the whole flat bucket reports
      // as attempt1 so it's at least visible somewhere, not silently lost.
      attempts: { total: tentative, attempt1: tentative, attempt2: 0, attempt3: 0, attempt4: 0, attempt5: 0 },
      cancelled,
      abandoned,
      trash,
    };
  }

  async create(payload: CheckoutPayload): Promise<OrderResponse> {
    const { customer, items, shipping, subtotal, total, deliveryCompany, paymentMethod = 'cod' } = payload;
    // Status default. Tunisian COD plugins restrict this enum, so allow override via env.
    // For boutiqueahmedmzali.com the allowed values are: en-attente, confirme, annule, tentative, auto-draft, checkout-draft
    const defaultStatus = process.env.WC_DEFAULT_ORDER_STATUS || 'en-attente';
    const billing: Record<string, string> = {
      first_name: customer.firstName || 'Client',
      last_name: customer.lastName ?? '',
      phone: customer.phone,
      address_1: customer.address || '',
      city: customer.city || '',
      country: 'TN',
    };
    // WC rejects '' as an invalid email — only include the field if non-empty AND valid.
    const trimmedEmail = (customer.email ?? '').trim();
    if (trimmedEmail && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(trimmedEmail)) billing.email = trimmedEmail;

    const wcPayload: Record<string, unknown> = {
      payment_method: paymentMethod,
      payment_method_title: paymentMethod === 'cod' ? 'Paiement à la livraison' : 'Carte',
      set_paid: false,
      status: payload.status || defaultStatus,
      billing,
      shipping: {
        first_name: customer.firstName || 'Client',
        last_name: customer.lastName ?? '',
        address_1: customer.address || '',
        city: customer.city || '',
        country: 'TN',
      },
      line_items: items.map((i) => {
        const lineMeta: { key: string; value: string }[] = [];
        if (i.bundleName) lineMeta.push({ key: 'Offre', value: i.bundleName });
        if (Array.isArray(i.bundleItems) && i.bundleItems.length) {
          i.bundleItems.forEach((v, idx) => {
            const summary = Object.entries(v).filter(([, val]) => val).map(([k, val]) => `${k}: ${val}`).join(' · ');
            lineMeta.push({ key: `Item ${idx + 1}`, value: summary || '—' });
          });
        } else if (i.variation && Object.keys(i.variation).length) {
          for (const [k, v] of Object.entries(i.variation)) lineMeta.push({ key: k, value: String(v) });
        }
        const li: Record<string, unknown> = { product_id: Number(i.productId), quantity: i.qty, meta_data: lineMeta };
        // Set per-line subtotal/total so WC stores the actual paid amount (bundle/sale prices, not default).
        if (typeof i.price === 'number' && i.price > 0) {
          const lineTotal = (i.price * i.qty).toFixed(2);
          li.subtotal = lineTotal;
          li.total = lineTotal;
        }
        return li;
      }),
      shipping_lines: shipping > 0 ? [{ method_id: 'flat_rate', method_title: deliveryCompany || 'Livraison', total: String(shipping) }] : [],
      customer_note: customer.note ?? '',
      meta_data: [
        ...(customer.phone2 ? [{ key: '_mzem_phone_2', value: customer.phone2 }] : []),
        ...(deliveryCompany ? [{ key: '_mzem_delivery_company', value: deliveryCompany }] : []),
        ...(subtotal !== undefined ? [{ key: '_mzem_manual_subtotal', value: subtotal }] : []),
        ...(total !== undefined ? [{ key: '_mzem_manual_total', value: total }] : []),
        ...(payload.source ? [{ key: '_mzem_source', value: payload.source }] : []),
        ...(payload.attempts !== undefined ? [{ key: '_mzem_attempts', value: String(payload.attempts) }] : []),
      ],
    };
    const res = await wooClient.post<WooOrderRaw>('/orders', wcPayload);
    const order = mapOrder(res.data);

    // Auto-push to Navex when the carrier label matches NAVEX_AUTO_PUSH_LABEL
    const label = (process.env.NAVEX_AUTO_PUSH_LABEL ?? 'navex').toLowerCase();
    const carrier = String(deliveryCompany ?? '').toLowerCase();
    if (navexConfigured && carrier.includes(label)) {
      const codAmount = order.total > 0 ? order.total : items.reduce((s, i) => s + i.price * i.qty, 0) + shipping;
      const { designation: productLabel, nbArticle: itemsCount } = buildNavexDesignation(items);
      const result = await navex.createShipment({
        reference: `#${order.number || order.id}`,
        receiverName: (customer.firstName ?? '') + (customer.lastName ? ' ' + customer.lastName : ''),
        receiverPhone: customer.phone,
        receiverPhone2: customer.phone2,
        receiverGov: customer.city ?? '',
        receiverCity: customer.city ?? '',
        receiverAddress: customer.address ?? '',
        codAmount,
        itemsCount,
        productLabel,
        note: customer.note,
      });
      // Persist the result on the WC order so we can show it in the admin and follow up.
      const navexMeta: { key: string; value: unknown }[] = [
        { key: '_navex_status', value: result.ok ? 'sent' : 'failed' },
        { key: '_navex_response', value: typeof result.raw === 'string' ? result.raw : JSON.stringify(result.raw ?? null) },
      ];
      if (result.barcode) navexMeta.push({ key: '_navex_tracking', value: result.barcode });
      if (result.error) navexMeta.push({ key: '_navex_error', value: result.error });
      try {
        await wooClient.put<WooOrderRaw>(`/orders/${order.id}`, { meta_data: navexMeta });
      } catch { /* non-fatal */ }
    }

    return order;
  }

  async getById(id: string): Promise<OrderResponse | null> {
    try {
      const res = await wooClient.get<WooOrderRaw>(`/orders/${id}`);
      return res.data ? mapOrder(res.data) : null;
    } catch {
      return null;
    }
  }

  async update(id: string, patch: OrderUpdate): Promise<OrderResponse> {
    const body: Record<string, unknown> = {};
    
    // Fetch the existing order to safely manage replacing line_items and shipping_lines
    const existing = await wooClient.get<WooOrderRaw>(`/orders/${id}`);

    // Only forward status if explicitly set — avoids 400s on custom-status plugins.
    if (patch.status && String(patch.status).trim() !== '') body.status = patch.status;
    if (patch.customer) {
      const c = patch.customer;
      const billing: Record<string, string> = {
        first_name: c.firstName ?? '',
        last_name: c.lastName ?? '',
        phone: c.phone ?? '',
        address_1: c.address ?? '',
        city: c.city ?? '',
        country: 'TN',
      };
      const trimmedEmail = (c.email ?? '').trim();
      if (trimmedEmail && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(trimmedEmail)) billing.email = trimmedEmail;
      body.billing = billing;
    }
    if (patch.items) {
      // WC REST appends line_items sent without an `id`. To truly REPLACE the order's
      // lines we must (1) load the existing line ids and mark them for deletion via
      // `{ id, quantity: 0 }`, then (2) append the new lines. Without this, every save
      // duplicates every line — which also doubles the auto-push payload to Navex.
      const deletions = (existing.data.line_items ?? [])
        .filter((li) => li.id != null && li.id > 0)
        .map((li) => ({ id: li.id, quantity: 0 }));
      const additions = patch.items.map((i) => {
        const meta: { key: string; value: string }[] = [];
        if (i.bundleName) meta.push({ key: 'Offre', value: i.bundleName });
        if (i.variation && Object.keys(i.variation).length) {
          const summary = Object.entries(i.variation)
            .filter(([, v]) => v)
            .map(([k, v]) => `${k}: ${v}`)
            .join(' · ');
          if (i.bundleSlot) meta.push({ key: `Item ${i.bundleSlot}`, value: summary || '—' });
          else for (const [k, v] of Object.entries(i.variation)) if (v) meta.push({ key: k, value: String(v) });
        }
        const li: Record<string, unknown> = { product_id: Number(i.productId), quantity: i.qty };
        if (meta.length) li.meta_data = meta;
        if (typeof i.unitPrice === 'number' && i.unitPrice > 0) {
          const lineTotal = (i.unitPrice * i.qty).toFixed(2);
          li.subtotal = lineTotal;
          li.total = lineTotal;
        }
        return li;
      });
      body.line_items = [...deletions, ...additions];
    }
    if (patch.shipping !== undefined) {
      const shippingLines = existing.data.shipping_lines ?? [];
      const firstLine = shippingLines[0];
      const deletions = shippingLines.slice(1)
        .filter((sl) => sl.id != null)
        .map((sl) => ({
          id: sl.id,
          total: '0',
        }));
      
      body.shipping_lines = [
        {
          ...(firstLine ? { id: firstLine.id } : {}),
          method_id: 'flat_rate',
          method_title: patch.deliveryCompany || 'Livraison',
          total: String(patch.shipping),
        },
        ...deletions,
      ];
    }
    const meta: { key: string; value: unknown }[] = [];
    if (patch.deliveryCompany !== undefined) meta.push({ key: '_mzem_delivery_company', value: patch.deliveryCompany });
    if (patch.exchange !== undefined) meta.push({ key: '_mzem_exchange', value: patch.exchange ? 'yes' : 'no' });
    if (patch.privateNote !== undefined) meta.push({ key: '_mzem_private_note', value: patch.privateNote });
    if (patch.subtotal !== undefined) meta.push({ key: '_mzem_manual_subtotal', value: patch.subtotal });
    if (patch.total !== undefined) meta.push({ key: '_mzem_manual_total', value: patch.total });
    if (patch.attempts !== undefined) meta.push({ key: '_mzem_attempts', value: String(patch.attempts) });
    if (meta.length) body.meta_data = meta;

    const res = await wooClient.put<WooOrderRaw>(`/orders/${id}`, body);
    const order = mapOrder(res.data);

    // AUTO-PUSH to Navex when delivery company is Navex and we don't already have a tracking number.
    const label = (process.env.NAVEX_AUTO_PUSH_LABEL ?? 'navex').toLowerCase();
    const carrier = String(patch.deliveryCompany ?? order.meta?._mzem_delivery_company ?? '').toLowerCase();
    const alreadySent = Boolean(order.meta?._navex_tracking);
    if (navexConfigured && carrier.includes(label) && !alreadySent) {
      const codAmount = order.total > 0 ? order.total : 0;
      const { designation: productLabel, nbArticle: itemsCount } = buildNavexDesignation(order.items);
      const result = await navex.createShipment({
        reference: `#${order.number || order.id}`,
        receiverName: (order.customer.firstName ?? '') + (order.customer.lastName ? ' ' + order.customer.lastName : ''),
        receiverPhone: order.customer.phone,
        receiverPhone2: String((order.meta?._mzem_phone_2 as string) ?? ''),
        receiverGov: order.customer.city ?? '',
        receiverCity: order.customer.city ?? '',
        receiverAddress: order.customer.address ?? '',
        codAmount,
        itemsCount,
        productLabel,
        note: String((order.meta?._mzem_private_note as string) ?? ''),
        echange: order.meta?._mzem_exchange === 'yes',
      });
      const navexMeta: { key: string; value: unknown }[] = [
        { key: '_navex_status', value: result.ok ? 'sent' : 'failed' },
        { key: '_navex_response', value: typeof result.raw === 'string' ? result.raw : JSON.stringify(result.raw ?? null) },
      ];
      if (result.barcode) navexMeta.push({ key: '_navex_tracking', value: result.barcode });
      if (result.error) navexMeta.push({ key: '_navex_error', value: result.error });
      try {
        const final = await wooClient.put<WooOrderRaw>(`/orders/${order.id}`, { meta_data: navexMeta });
        return mapOrder(final.data);
      } catch { /* non-fatal */ }
    }

    return order;
  }

  async remove(id: string): Promise<void> {
    const order = await this.getById(id);
    if (order && order.status === 'trash') {
      await wooClient.del(`/orders/${id}`);
    } else {
      await wooClient.trash(`/orders/${id}`);
    }
  }
}
