'use client';

import { posFetch } from './device';
import type { PosSale } from '@/types/pos';

const CONNECTION_KEY = 'pos_hardware_bridge_connection';
const DEFAULT_URL = 'http://127.0.0.1:17890';

export type DrawerSettings = {
  autoOpenEnabled: boolean;
  openOnCashPayment: boolean;
  openForAllPaymentMethods: boolean;
  drawerPin: 0 | 1;
  pulseOnMs: number;
  pulseOffMs: number;
  printerName: string;
  autoPrintReceipt: boolean;
};

export type BridgeConnection = { url: string; token: string };

export type SaleHardwareResult = {
  autoPrintReceipt: boolean;
  drawerAttempted: boolean;
  drawerOpened: boolean;
  warning: string | null;
};

export function canOpenDrawer(role: string): boolean {
  return role === 'store_manager' || role === 'admin' || role === 'super_admin';
}

function validateLoopbackUrl(value: string): string {
  const url = new URL(value || DEFAULT_URL);
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) {
    throw new Error('Le pont matériel doit utiliser une adresse HTTP locale (127.0.0.1 ou localhost).');
  }
  return url.origin;
}

export function getBridgeConnection(): BridgeConnection {
  try {
    const stored = JSON.parse(localStorage.getItem(CONNECTION_KEY) || '{}') as Partial<BridgeConnection>;
    return { url: validateLoopbackUrl(stored.url || DEFAULT_URL), token: String(stored.token || '') };
  } catch {
    return { url: DEFAULT_URL, token: '' };
  }
}

export function saveBridgeConnection(connection: BridgeConnection): BridgeConnection {
  const safe = { url: validateLoopbackUrl(connection.url), token: connection.token.trim() };
  localStorage.setItem(CONNECTION_KEY, JSON.stringify(safe));
  return safe;
}

async function bridgeFetch<T>(path: string, init: RequestInit = {}, connection = getBridgeConnection()): Promise<T> {
  if (connection.token.length < 32) throw new Error('Le secret du pont matériel n’est pas configuré sur ce terminal.');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);
  try {
    const response = await fetch(`${validateLoopbackUrl(connection.url)}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${connection.token}`,
        ...init.headers,
      },
      cache: 'no-store',
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : `Pont matériel indisponible (${response.status}).`);
    return data as T;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw new Error('Le pont matériel local ne répond pas.');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function getBridgeStatus(connection?: BridgeConnection) {
  return bridgeFetch<{ ok: true; platform: string }>('/v1/health', {}, connection);
}

export async function getDrawerSettings(connection?: BridgeConnection) {
  return bridgeFetch<{ ok: true; settings: DrawerSettings }>('/v1/settings', {}, connection);
}

export async function updateDrawerSettings(settings: DrawerSettings, connection?: BridgeConnection) {
  return bridgeFetch<{ ok: true; settings: DrawerSettings }>('/v1/settings', {
    method: 'PUT', body: JSON.stringify(settings),
  }, connection);
}

export async function getLocalPrinters(connection?: BridgeConnection) {
  return bridgeFetch<{ ok: true; printers: string[] }>('/v1/printers', {}, connection);
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
      body: JSON.stringify({ requestId: `sale:${sale.id}`, saleId: sale.id, paymentMethods }),
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
  if (now - lastManualAttemptAt < 2500) throw new Error('Veuillez patienter avant une nouvelle tentative.');
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
