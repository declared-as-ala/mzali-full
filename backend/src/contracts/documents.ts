// Backend-only contract (not mirrored from frontend types/).
// Shared shapes between quotes and invoices — see
// docs/pos-platform/invoicing-and-quotes.md.

export type DocumentAddress = {
  line1: string | null;
  line2: string | null;
  city: string | null;
  governorate: string | null;
  postalCode: string | null;
  country: string;
};

export type CustomerSnapshot = {
  name: string;
  phone: string;
  email: string | null;
  address: string | null;
};

export type CompanySnapshot = {
  legalName: string;
  address: string;
  matriculeFiscal: string;
  rcNumber: string;
  phone: string;
  email: string;
};

export type DocumentActor = { type: 'system' | 'employee' | 'migration' | 'service'; id: string | null; name: string };

export type DocumentLine = {
  variantId: string | null; // null for a free-text/custom line
  productId: string | null;
  descriptionSnapshot: string;
  quantity: number;
  unitPriceMinor: number;
  discountMinor: number;
  taxMinor: number;
  lineTotalMinor: number;
};
