import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { CommerceSettings, CompanySettings, InventorySettings, InvoicingSettings, LoyaltySettings, PosAlertSettings, SiteSettings } from '@contracts';
import { Setting } from './settings.schema';

const SITE_KEY = 'site';
const COMMERCE_KEY = 'commerce';
const INVENTORY_KEY = 'inventory';
const INVOICING_KEY = 'invoicing';
const COMPANY_KEY = 'company';
const LOYALTY_KEY = 'loyalty';
const POS_ALERTS_KEY = 'posAlerts';

/** Defaults mirror lib/site-config.ts SITE.cities and the hardcoded 8 DT flat shipping. */
const DEFAULT_COMMERCE: CommerceSettings = {
  shippingFlat: 8,
  defaultOrderStatus: 'en-attente',
  cities: [
    'Ariana', 'Beja', 'Ben Arous', 'Bizerte', 'Gabes', 'Gafsa',
    'Jendouba', 'Kasserine', 'Kef', 'Mahdia', 'Manouba', 'Monastir',
    'Nabeul', 'Sfax', 'Sidi Bouzid', 'Sousse', 'Siliana', 'Tataouine',
    'Tozeur', 'Tunis', 'Zaghouan', 'Medenine', 'Kebili', 'Kairouan',
  ],
};

const DEFAULT_INVENTORY: InventorySettings = {
  stockPolicy: 'DEPOT_ONLY',
  stocktakeVarianceThreshold: 3,
};

const DEFAULT_SITE: SiteSettings = {
  photoUrl: undefined,
  phones: [],
  whatsapp: '',
  instagram: '',
  tiktok: '',
  facebook: '',
};

/** enabled defaults false — real invoice finalization stays off until the
 *  business accountant confirms these figures. See invoicing-and-quotes.md. */
const DEFAULT_INVOICING: InvoicingSettings = {
  enabled: false,
  tvaRatePercent: 19,
  timbreFiscalMinor: 1000,
  numberFormats: {
    quote: 'DEV-{year}-{seq:6}',
    invoiceSales: 'FAC-{year}-{seq:6}',
    invoicePos: 'FACB-{year}-{seq:6}',
    invoiceOnline: 'FACW-{year}-{seq:6}',
    invoiceProforma: 'PRO-{year}-{seq:6}',
    creditNote: 'AV-{year}-{seq:6}',
  },
};

/** DTO instances (ES2022 class fields) carry unset optional props as explicit
 *  `undefined` own keys, which would otherwise clobber existing values when
 *  spread over `current` below. */
function omitUndefined<T extends object>(obj: T): Partial<T> {
  const result: Partial<T> = {};
  for (const key of Object.keys(obj) as (keyof T)[]) {
    if (obj[key] !== undefined) result[key] = obj[key];
  }
  return result;
}

const DEFAULT_COMPANY: CompanySettings = {
  legalName: '',
  address: '',
  matriculeFiscal: '',
  rcNumber: '',
  phone: '',
  email: '',
  logoMediaId: null,
};

/** Defaults are placeholders confirmed with the user at Sprint 8 kickoff
 *  (all-time customers.totalSpentMinor as the tier basis; no hardcoded
 *  earning/redemption rates beyond these editable defaults). */
const DEFAULT_LOYALTY: LoyaltySettings = {
  pointsPerDinarSpent: 1,
  minimumPurchaseMinor: 0,
  bonusCategories: [],
  bonusProducts: [],
  birthdayBonusPoints: 0,
  newCustomerBonusPoints: 0,
  earnOnOrderStatus: 'confirme',
  excludeShippingFromEarning: true,
  excludedProductIds: [],
  pointValueMinor: 10,
  maxRedemptionPercentOfSale: 50,
  minimumPointsToRedeem: 100,
  managerApprovalAboveMinor: 10000,
  allowMultipleCardsPerCustomer: false,
};

const DEFAULT_POS_ALERTS: PosAlertSettings = {
  largeCashDifferenceMinor: 5000,
  excessiveDiscountPercent: 30,
  repeatedDiscountCountThreshold: 3,
  repeatedDiscountWindowHours: 2,
  longOpenSessionHours: 14,
  belowCostAlertEnabled: true,
};

@Injectable()
export class SettingsService {
  constructor(@InjectModel(Setting.name) private readonly model: Model<Setting>) {}

  async getSite(): Promise<SiteSettings> {
    const doc = await this.model.findById(SITE_KEY);
    return { ...DEFAULT_SITE, ...(doc?.value ?? {}) };
  }

  async setSite(patch: Partial<SiteSettings>): Promise<SiteSettings> {
    const current = await this.getSite();
    const merged = { ...current, ...omitUndefined(patch) };
    await this.model.findByIdAndUpdate(SITE_KEY, { value: merged }, { upsert: true });
    return merged;
  }

  async getCommerce(): Promise<CommerceSettings> {
    const doc = await this.model.findById(COMMERCE_KEY);
    return { ...DEFAULT_COMMERCE, ...(doc?.value ?? {}) };
  }

  async setCommerce(patch: Partial<CommerceSettings>): Promise<CommerceSettings> {
    const current = await this.getCommerce();
    const merged = { ...current, ...omitUndefined(patch) };
    await this.model.findByIdAndUpdate(COMMERCE_KEY, { value: merged }, { upsert: true });
    return merged;
  }

  async getInventorySettings(): Promise<InventorySettings> {
    const doc = await this.model.findById(INVENTORY_KEY);
    return { ...DEFAULT_INVENTORY, ...(doc?.value ?? {}) };
  }

  async setInventorySettings(patch: Partial<InventorySettings>): Promise<InventorySettings> {
    const current = await this.getInventorySettings();
    const merged = { ...current, ...omitUndefined(patch) };
    await this.model.findByIdAndUpdate(INVENTORY_KEY, { value: merged }, { upsert: true });
    return merged;
  }

  async getInvoicingSettings(): Promise<InvoicingSettings> {
    const doc = await this.model.findById(INVOICING_KEY);
    return { ...DEFAULT_INVOICING, ...(doc?.value ?? {}), numberFormats: { ...DEFAULT_INVOICING.numberFormats, ...(doc?.value?.numberFormats ?? {}) } };
  }

  async setInvoicingSettings(patch: Partial<Omit<InvoicingSettings, 'numberFormats'>> & { numberFormats?: Partial<InvoicingSettings['numberFormats']> }): Promise<InvoicingSettings> {
    const current = await this.getInvoicingSettings();
    const cleanPatch = omitUndefined(patch);
    const merged = { ...current, ...cleanPatch, numberFormats: { ...current.numberFormats, ...omitUndefined(patch.numberFormats ?? {}) } };
    await this.model.findByIdAndUpdate(INVOICING_KEY, { value: merged }, { upsert: true });
    return merged;
  }

  async getCompany(): Promise<CompanySettings> {
    const doc = await this.model.findById(COMPANY_KEY);
    return { ...DEFAULT_COMPANY, ...(doc?.value ?? {}) };
  }

  async setCompany(patch: Partial<CompanySettings>): Promise<CompanySettings> {
    const current = await this.getCompany();
    const merged = { ...current, ...omitUndefined(patch) };
    await this.model.findByIdAndUpdate(COMPANY_KEY, { value: merged }, { upsert: true });
    return merged;
  }

  async getLoyaltySettings(): Promise<LoyaltySettings> {
    const doc = await this.model.findById(LOYALTY_KEY);
    return { ...DEFAULT_LOYALTY, ...(doc?.value ?? {}) };
  }

  async setLoyaltySettings(patch: Partial<LoyaltySettings>): Promise<LoyaltySettings> {
    const current = await this.getLoyaltySettings();
    const merged = { ...current, ...omitUndefined(patch) };
    await this.model.findByIdAndUpdate(LOYALTY_KEY, { value: merged }, { upsert: true });
    return merged;
  }

  async getPosAlertSettings(): Promise<PosAlertSettings> {
    const doc = await this.model.findById(POS_ALERTS_KEY);
    return { ...DEFAULT_POS_ALERTS, ...(doc?.value ?? {}) };
  }

  async setPosAlertSettings(patch: Partial<PosAlertSettings>): Promise<PosAlertSettings> {
    const current = await this.getPosAlertSettings();
    const merged = { ...current, ...omitUndefined(patch) };
    await this.model.findByIdAndUpdate(POS_ALERTS_KEY, { value: merged }, { upsert: true });
    return merged;
  }

  /** Generic accessor for internal operational state (e.g. the round-robin pointer). */
  async getRaw(key: string): Promise<Record<string, unknown> | null> {
    const doc = await this.model.findById(key);
    return doc?.value ?? null;
  }

  async setRaw(key: string, value: Record<string, unknown>): Promise<void> {
    await this.model.findByIdAndUpdate(key, { value }, { upsert: true });
  }
}
