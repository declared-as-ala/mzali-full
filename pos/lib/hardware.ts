'use client';

import { posFetch } from './device';
import type { PosPrinterSettings, PosSale } from '@/types/pos';

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

export async function completeSaleHardware(sale: PosSale, autoOpenDrawer = true): Promise<SaleHardwareResult> {
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
        autoOpenDrawer,
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
    const wouldHaveOpened = cashSale && autoOpenDrawer;
    if (wouldHaveOpened) await recordPaymentEvent(sale.id, 'failed', message);
    return {
      autoPrintReceipt: false,
      drawerAttempted: wouldHaveOpened,
      drawerOpened: false,
      warning: wouldHaveOpened
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

export const DEFAULT_PRINTER_SETTINGS: PosPrinterSettings = {
  printerName: null, paperWidthMm: 80, printCopies: 1,
  autoPrint: true, autoOpenDrawer: true, printLogo: true, printQr: true,
};

/** Tells the backend how a print attempt for this sale went, independent of
 *  the sale's own status — a failed/retried print never touches the sale
 *  itself, it only ever updates PosSale.printStatus. Best-effort: if this
 *  ping itself fails there's nothing actionable for the caller to do with
 *  that, the receipt already printed (or didn't) regardless. */
export async function reportPrintStatus(saleId: string, status: 'printed' | 'failed'): Promise<void> {
  await posFetch(`/api/sales/${saleId}/print-status`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }),
  }).catch(() => undefined);
}

export type PrinterInfo = { name: string; status: string; isDefault: boolean };

export async function listPrinters(): Promise<PrinterInfo[]> {
  const result = await bridgeFetch<{ ok: true; printers: PrinterInfo[] }>('/v1/printers');
  return result.printers;
}

export async function getPrinterStatus(name: string): Promise<PrinterInfo> {
  const result = await bridgeFetch<{ ok: true; printer: PrinterInfo }>(`/v1/printer/status?name=${encodeURIComponent(name)}`);
  return result.printer;
}

/** Sends the receipt straight to the configured Windows printer through
 *  the local bridge — no window.print(), no browser print dialog. Throws
 *  (with a message from bridgeFetch) if the bridge is unreachable, no
 *  printer is configured, or the OS-level print call fails; callers decide
 *  what to do with that (see Till.tsx: mark the sale's printStatus
 *  'failed' and offer a retry, never touch the sale itself). A fresh
 *  requestId every call is deliberate — unlike the drawer/sale-completed
 *  endpoints, an explicit reprint/retry must always actually re-attempt,
 *  never replay a cached prior failure via the bridge's own dedupe.
 */
export async function printReceiptOnBridge(sale: PosSale, settings: PosPrinterSettings): Promise<void> {
  await bridgeFetch('/v1/print', {
    method: 'POST',
    body: JSON.stringify({
      requestId: `print:${sale.id}:${crypto.randomUUID()}`,
      printerName: settings.printerName,
      copies: settings.printCopies,
      sale,
      settings: { paperWidthMm: settings.paperWidthMm, printLogo: settings.printLogo, printQr: settings.printQr },
    }),
  });
}
