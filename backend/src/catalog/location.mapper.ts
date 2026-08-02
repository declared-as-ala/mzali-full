import type { Location as LocationContract } from '@contracts';
import { LocationDocument } from './location.schema';

export function toLocationContract(doc: LocationDocument): LocationContract {
  return {
    id: doc.id,
    code: doc.code,
    name: doc.name,
    type: doc.type,
    address: doc.address,
    active: doc.active,
    isDefaultOnlineLocation: doc.isDefaultOnlineLocation,
    isDefaultPosLocation: doc.isDefaultPosLocation,
    allowOnlineFulfillment: doc.allowOnlineFulfillment,
    allowPosSales: doc.allowPosSales,
    allowNegativeStock: doc.allowNegativeStock,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}
