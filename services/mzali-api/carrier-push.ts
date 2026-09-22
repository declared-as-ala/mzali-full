import { apiRequest } from './client';

export type CarrierPushResult = {
  ok: boolean;
  barcode?: string;
  raw: unknown;
  error?: string;
  needsConfirmation?: boolean;
  candidates?: { localityId: number; label: string }[];
};

/** Shared by every admin/employee carrier route when COMMERCE_PROVIDER=mzali-api. */
export async function pushCarrier(
  scope: 'admin' | 'employee',
  carrier: 'navex' | 'firstdelivery' | 'axess',
  orderId: string,
  bearer: string,
  force?: boolean,
  localityId?: number,
): Promise<{ status: number; body: CarrierPushResult | { error: string } }> {
  try {
    const result = await apiRequest<{ skipped: boolean; result: CarrierPushResult }>(`/${scope}/shipping/${carrier}`, {
      method: 'POST',
      bearer,
      body: { orderId, ...(force ? { force: true } : {}), ...(localityId ? { localityId } : {}) },
    });
    return { status: result.result.ok ? 200 : 502, body: result.result };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'push failed';
    const status = e instanceof Error && 'status' in e ? Number((e as { status: number }).status) : 500;
    return { status: status || 500, body: { error: message } };
  }
}

export type FirstDeliveryPreview =
  | { status: 'resolved'; governorate: string; delegation: string; locality: string; localityId: number; address: string }
  | { status: 'ambiguous'; address: string; candidates: { localityId: number; label: string }[] }
  | { status: 'not_found'; address: string };

/** Read-only First Delivery destination preview — admin scope only. */
export async function previewFirstDelivery(orderId: string, bearer: string): Promise<{ status: number; body: FirstDeliveryPreview | { error: string } }> {
  try {
    const result = await apiRequest<FirstDeliveryPreview>('/admin/shipping/firstdelivery/preview', {
      method: 'POST',
      bearer,
      body: { orderId },
    });
    return { status: 200, body: result };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'preview failed';
    const status = e instanceof Error && 'status' in e ? Number((e as { status: number }).status) : 500;
    return { status: status || 500, body: { error: message } };
  }
}
