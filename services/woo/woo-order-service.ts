import type { CheckoutPayload, OrderResponse } from '@/types';
import type { OrderService, OrderListQuery, OrderListResult, OrderUpdate } from '../order-service';
import { wooClient } from './woo-client';
import type { WooOrderRaw } from './woo-types';
import { mapOrder } from './woo-mappers';
import { navex, navexConfigured, buildNavexDesignation } from '@/lib/navex';
import { employeeStore } from '@/lib/employee-storage';
import { pickNextInRoundRobin } from '@/lib/round-robin';

/**
 * Assign a new order to an employee.
 *
 * Algorithm (in order):
 *  1. STICKY CUSTOMER — if this customer was already handled by an active
 *     employee (within the last 30 days), send to the same employee.
 *  2. ROUND-ROBIN — for new customers, assign via strict turn order between
 *     all active employees (safe from race conditions via file locking).
 */
async function pickEmployeeForOrder(customerEmail: string, customerPhone: string): Promise<string | null> {
  const employees = await employeeStore.list();
  const activeEmployees = employees
    .filter((e) => e.active)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  if (!activeEmployees.length) return null;

  const activeIds = activeEmployees.map((e) => e.id);

  // STEP 1 — sticky customer (30-day window)
  const stickyId = await findStickyEmployee(customerEmail, customerPhone, activeIds);
  if (stickyId) return stickyId;

  // STEP 2 — round-robin between active employees (race-safe via file lock)
  return pickNextInRoundRobin(activeIds);
}

/**
 * Search for recent orders from the same customer (by email or phone).
 * If found and assigned to a still-active employee, return that employee ID.
 */
async function findStickyEmployee(
  customerEmail: string,
  customerPhone: string,
  activeIds: string[],
): Promise<string | null> {
  const email = customerEmail?.trim().toLowerCase();
  const phone = customerPhone?.trim().replace(/\s/g, '');
  const lookup = email || phone;
  if (!lookup) return null;

  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
  try {
    // Search WooCommerce by email first (most precise), then by phone
    const queries = [];
    if (email) queries.push(email);
    if (phone && phone !== email) queries.push(phone);

    for (const q of queries) {
      const res = await wooClient.get<WooOrderRaw[]>('/orders', {
        search: q, per_page: 5, after: since, orderby: 'date', order: 'desc',
      });
      for (const o of res.data) {
        const oEmail = (o.billing?.email ?? '').toLowerCase();
        const oPhone = (o.billing?.phone ?? '').replace(/\s/g, '');
        const matchesEmail = email && oEmail === email;
        const matchesPhone = phone && oPhone === phone;
        if (!matchesEmail && !matchesPhone) continue;

        const empMeta = (o.meta_data ?? []).find((m) => m.key === '_mzem_employee_id');
        const prevId = typeof empMeta?.value === 'string' ? empMeta.value : '';
        if (prevId && activeIds.includes(prevId)) return prevId;
      }
    }
  } catch {
    // WC failure is non-fatal — fall through to round-robin
  }
  return null;
}

export class WooCommerceOrderService implements OrderService {
  async list(query: OrderListQuery = {}): Promise<OrderListResult> {
    const wantsEmployeeFilter = query.assignedEmployeeId !== undefined && query.assignedEmployeeId !== 'any';
    // WC has no native filter on our meta key — overfetch when filtering, then filter in memory.
    const perPage = query.perPage ?? 50;
    const res = await wooClient.get<WooOrderRaw[]>('/orders', {
      page: query.page ?? 1,
      per_page: wantsEmployeeFilter ? 100 : perPage,
      status: query.status && query.status !== 'any' ? query.status : 'any',
      search: query.search || undefined,
      after: query.after || undefined,
      before: query.before || undefined,
    });
    let items = res.data.map(mapOrder);
    if (wantsEmployeeFilter) {
      const wanted = query.assignedEmployeeId;
      items = items.filter((o) => {
        const id = o.assignedEmployeeId ?? null;
        if (wanted === 'unassigned') return id === null;
        return id === wanted;
      });
    }
    return { items, total: wantsEmployeeFilter ? items.length : res.total, totalPages: res.totalPages, page: query.page ?? 1 };
  }

  async create(payload: CheckoutPayload): Promise<OrderResponse> {
    const { customer, items, shipping, subtotal, total, deliveryCompany, paymentMethod = 'cod' } = payload;
    // Status default. Tunisian COD plugins restrict this enum, so allow override via env.
    // For boutiqueahmedmzali.com the allowed values are: en-attente, confirme, annule, tentative, auto-draft, checkout-draft
    const defaultStatus = process.env.WC_DEFAULT_ORDER_STATUS || 'en-attente';
    const billing: Record<string, string> = {
      first_name: customer.firstName,
      last_name: customer.lastName ?? '',
      phone: customer.phone,
      address_1: customer.address,
      city: customer.city,
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
        first_name: customer.firstName,
        last_name: customer.lastName ?? '',
        address_1: customer.address,
        city: customer.city,
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
    let order = mapOrder(res.data);

    // Auto-assign to an employee (sticky customer → least loaded)
    try {
      const employeeId = await pickEmployeeForOrder(customer.email ?? '', customer.phone);
      if (employeeId) {
        const upd = await wooClient.put<WooOrderRaw>(`/orders/${order.id}`, {
          meta_data: [
            { key: '_mzem_employee_id', value: employeeId },
            { key: '_mzem_assigned_at', value: new Date().toISOString() },
            { key: '_mzem_assigned_by', value: 'auto' },
          ],
        });
        order = mapOrder(upd.data);
      }
    } catch { /* assignment failure must never block the order */ }

    // Auto-push to Navex when the carrier label matches NAVEX_AUTO_PUSH_LABEL
    const label = (process.env.NAVEX_AUTO_PUSH_LABEL ?? 'navex').toLowerCase();
    const carrier = String(deliveryCompany ?? '').toLowerCase();
    if (navexConfigured && carrier.includes(label)) {
      const codAmount = order.total > 0 ? order.total : items.reduce((s, i) => s + i.price * i.qty, 0) + shipping;
      const { designation: productLabel, nbArticle: itemsCount } = buildNavexDesignation(items);
      const result = await navex.createShipment({
        reference: `#${order.number || order.id}`,
        receiverName: customer.firstName + (customer.lastName ? ' ' + customer.lastName : ''),
        receiverPhone: customer.phone,
        receiverPhone2: customer.phone2,
        receiverGov: customer.city,
        receiverCity: customer.city,
        receiverAddress: customer.address,
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
        receiverName: order.customer.firstName + (order.customer.lastName ? ' ' + order.customer.lastName : ''),
        receiverPhone: order.customer.phone,
        receiverPhone2: String((order.meta?._mzem_phone_2 as string) ?? ''),
        receiverGov: order.customer.city,
        receiverCity: order.customer.city,
        receiverAddress: order.customer.address,
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

  async assignEmployee(orderId: string, employeeId: string | null, assignedBy: 'auto' | 'admin' = 'admin'): Promise<OrderResponse> {
    // Read previous history so we can append to it (not replace).
    let history: { employeeId: string | null; at: string; by: 'auto' | 'admin' }[] = [];
    try {
      const existing = await wooClient.get<WooOrderRaw>(`/orders/${orderId}`);
      const m = (existing.data.meta_data ?? []).find((x) => x.key === '_mzem_assignment_history');
      if (m && typeof m.value === 'string' && m.value.trim().startsWith('[')) {
        history = JSON.parse(m.value);
      } else if (Array.isArray(m?.value)) {
        history = m.value as typeof history;
      }
    } catch { /* keep history empty */ }

    const at = new Date().toISOString();
    history.push({ employeeId, at, by: assignedBy });

    const meta: { key: string; value: unknown }[] = [
      { key: '_mzem_employee_id', value: employeeId ?? '' },
      { key: '_mzem_assigned_at', value: employeeId ? at : '' },
      { key: '_mzem_assigned_by', value: employeeId ? assignedBy : '' },
      { key: '_mzem_assignment_history', value: JSON.stringify(history) },
    ];
    const res = await wooClient.put<WooOrderRaw>(`/orders/${orderId}`, { meta_data: meta });
    return mapOrder(res.data);
  }
}
