// Backend-only contract (not mirrored from frontend types/).

export type LocationType = 'WAREHOUSE' | 'STORE';

export type Location = {
  id: string;
  code: string;
  name: string;
  type: LocationType;
  address: string | null;
  active: boolean;
  isDefaultOnlineLocation: boolean;
  isDefaultPosLocation: boolean;
  allowOnlineFulfillment: boolean;
  allowPosSales: boolean;
  allowNegativeStock: boolean;
  createdAt: string;
  updatedAt: string;
};
