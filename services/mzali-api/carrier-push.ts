import { apiRequest } from './client';

export type CarrierPushResult = { ok: boolean; barcode?: string; raw: unknown; error?: string };

/** Shared by every admin/employee carrier route when COMMERCE_PROVIDER=mzali-api. */
export async function pushCarrier(
  scope: 'admin' | 'employee',
  carrier: 'navex' | 'firstdelivery' | 'axess',
  orderId: string,
  bearer: string,
): Promise<{ status: number; body: CarrierPushResult | { error: string } }> {
  try {
    const result = await apiRequest<{ skipped: boolean; result: CarrierPushResult }>(`/${scope}/shipping/${carrier}`, {
      method: 'POST',
      bearer,
      body: { orderId },
    });
    return { status: result.result.ok ? 200 : 502, body: result.result };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'push failed';
    const status = e instanceof Error && 'status' in e ? Number((e as { status: number }).status) : 500;
    return { status: status || 500, body: { error: message } };
  }
}
