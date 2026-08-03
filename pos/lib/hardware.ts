'use client';

import { posFetch } from './device';
import type { PosSale } from '@/types/pos';

const DEFAULT_URL = 'http://127.0.0.1:17890';

export type SaleHardwareResult = {
  autoPrintReceipt: boolean;
  drawerAttempted: boolean;
  drawerOpened: boolean;
  warning: string | null;
};

export type CustomerDisplayPayment = {
  method: 'CASH' | 'CARD' | 'BANK_TRANSFER' | 'OTHER';
  totalMinor: number;
  cashReceivedMinor: number | null;
  changeMinor: number;
};

export function canOpenDrawer(role: string): boolean {
  return ['employee', 'cashier', 'store_manager', 'admin', 'super_admin'].includes(role);
}

async function bridgeFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(`${DEFAULT_URL}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...init.headers,
      },
      cache: 'no-store',
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : `Pont matériel indisponible (${response.status}).`);
    return data as T;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw new Error('Le service local du tiroir ne répond pas. Lancez « MZALI POS Bridge » sur ce PC.');
    if (error instanceof TypeError) throw new Error('Le service local du tiroir est arrêté. Lancez « MZALI POS Bridge » sur ce PC, puis réessayez.');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function getBridgeStatus() {
  return bridgeFetch<{ ok: true; platform: string; drawerPort: string | null; vfdPort: string | null }>('/v1/health');
}

let displayUpdateTimer: ReturnType<typeof setTimeout> | null = null;

export function scheduleCustomerDisplayPayment(payment: CustomerDisplayPayment): void {
  if (displayUpdateTimer) clearTimeout(displayUpdateTimer);
  displayUpdateTimer = setTimeout(() => {
    displayUpdateTimer = null;
    void bridgeFetch('/v1/display/payment', {
      method: 'POST',
      body: JSON.stringify(payment),
    }).catch(() => undefined);
  }, 80);
}

async function recordPaymentEvent(saleId: string, outcome: 'opened' | 'failed' | 'skipped', error?: string) {
  await posFetch('/api/hardware/drawer/payment-event', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ saleId, outcome, error }),
  }).catch(() => undefined);
}

export async function completeSaleHardware(sale: PosSale): Promise<SaleHardwareResult> {
  const paymentMethods = sale.payments.length
    ? [...new Set(sale.payments.map((payment) => payment.method))]
    : sale.paymentMethod ? [sale.paymentMethod] : [];
  const cashSale = paymentMethods.includes('CASH') || sale.paymentMethod === 'CASH' || sale.paymentMethod === 'MIXED';
  try {
    const result = await bridgeFetch<{
      ok: true; drawerAttempted: boolean; drawerOpened: boolean; autoPrintReceipt: boolean; duplicate: boolean;
    }>('/v1/sale-completed', {
      method: 'POST',
      body: JSON.stringify({
        requestId: `sale:${sale.id}`,
        saleId: sale.id,
        paymentMethods,
        display: {
          method: sale.payments[0]?.method || sale.paymentMethod || 'OTHER',
          totalMinor: sale.totalMinor,
          cashReceivedMinor: sale.cashReceivedMinor,
          changeMinor: sale.changeMinor,
        },
      }),
    });
    await recordPaymentEvent(sale.id, result.drawerOpened ? 'opened' : 'skipped');
    return { ...result, warning: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur matérielle locale.';
    if (cashSale) await recordPaymentEvent(sale.id, 'failed', message);
    return {
      autoPrintReceipt: false,
      drawerAttempted: cashSale,
      drawerOpened: false,
      warning: cashSale
        ? `Vente enregistrée, mais le tiroir-caisse n’a pas pu être ouvert. ${message}`
        : null,
    };
  }
}

let lastManualAttemptAt = 0;

export async function openManualDrawer(reason: 'manual' | 'test'): Promise<void> {
  const now = Date.now();
  if (now - lastManualAttemptAt < 1500) throw new Error('Veuillez patienter avant une nouvelle tentative.');
  lastManualAttemptAt = now;

  const authorization = await posFetch('/api/hardware/drawer/manual-authorize', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason }),
  });
  if (!authorization.ok) throw new Error('Vous n’êtes pas autorisé à ouvrir le tiroir.');

  try {
    await bridgeFetch('/v1/drawer/open', {
      method: 'POST', body: JSON.stringify({ requestId: `${reason}:${crypto.randomUUID()}`, reason }),
    });
    await posFetch('/api/hardware/drawer/manual-event', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason, outcome: 'opened' }),
    }).catch(() => undefined);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur matérielle locale.';
    await posFetch('/api/hardware/drawer/manual-event', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason, outcome: 'failed', error: message }),
    }).catch(() => undefined);
    throw error;
  }
}
