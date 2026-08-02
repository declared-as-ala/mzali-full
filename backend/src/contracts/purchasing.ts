// Backend-only contract (not mirrored from frontend types/).

export type SupplierStatus = 'ACTIVE' | 'INACTIVE' | 'BLOCKED';

export type SupplierAddress = {
  line1: string | null;
  line2: string | null;
  city: string | null;
  governorate: string | null;
  postalCode: string | null;
  country: string;
};

export type Supplier = {
  id: string;
  code: string;
  companyName: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  secondaryPhone: string | null;
  whatsapp: string | null;
  taxIdentifier: string | null;
  registrationNumber: string | null;
  billingAddress: SupplierAddress | null;
  warehouseAddress: SupplierAddress | null;
  paymentTermsDays: number | null;
  preferredPaymentMethod: string | null;
  currency: 'TND';
  leadTimeDays: number | null;
  minimumOrderMinor: number | null;
  status: SupplierStatus;
  notes: string | null;
  documentMediaIds: string[];
  createdAt: string;
  updatedAt: string;
};
