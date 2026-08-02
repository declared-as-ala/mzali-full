import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model } from 'mongoose';
import type { EmployeeRole, RedeemPreviewResult } from '@contracts';
import { verifyPassword } from '@/auth/password';
import { roleHasPermission } from '@/auth/permissions';
import { clampPagination, paginate } from '@/common/pagination';
import { normalizePhone } from '@/common/phone';
import { Customer } from '@/customers/customer.schema';
import { CustomersService } from '@/customers/customers.service';
import { SettingsService } from '@/settings/settings.service';
import { Employee } from '@/users/employee.schema';
import { LoyaltyAccount, LoyaltyAccountDocument } from './loyalty-account.schema';
import { LoyaltyCardsService } from './loyalty-cards.service';
import { LoyaltyLedgerService } from './loyalty-ledger.service';
import { LoyaltyRulesService } from './loyalty-rules.service';
import { LoyaltyTransaction } from './loyalty-transaction.schema';

@Injectable()
export class LoyaltyService {
  constructor(
    @InjectModel(LoyaltyAccount.name) private readonly accounts: Model<LoyaltyAccount>,
    @InjectModel(LoyaltyTransaction.name) private readonly transactions: Model<LoyaltyTransaction>,
    @InjectModel(Customer.name) private readonly customers: Model<Customer>,
    @InjectModel(Employee.name) private readonly employees: Model<Employee>,
    private readonly customersService: CustomersService,
    private readonly ledger: LoyaltyLedgerService,
    private readonly rules: LoyaltyRulesService,
    private readonly settings: SettingsService,
    private readonly cards: LoyaltyCardsService,
  ) {}

  // ---- Accounts ----------------------------------------------------

  async createAccount(input: { customerId?: string; phone?: string; firstName?: string; lastName?: string }): Promise<LoyaltyAccountDocument> {
    let customerId = input.customerId ?? null;
    if (!customerId) {
      if (!input.phone) throw new BadRequestException('customerId ou phone requis');
      const customer = await this.customersService.findOrCreateByPhone(input.phone, {
        firstName: input.firstName,
        lastName: input.lastName,
      });
      customerId = customer.id;
    }

    const existing = await this.accounts.findOne({ customerId });
    if (existing) return existing;

    // Card and account are created together (see loyalty-cards.service.ts
    // `issueVirtualCardAndAccount`) so every account — quick-create or
    // batch-assigned — is backed by exactly one real `loyalty_cards` row,
    // one numbering scheme, one lifecycle.
    const { account: doc } = await this.cards.issueVirtualCardAndAccount(customerId!, {
      type: 'system', id: null, name: 'Système',
    });

    const rules = await this.settings.getLoyaltySettings();
    if (rules.newCustomerBonusPoints > 0) {
      await this.ledger.apply({
        accountId: doc.id,
        type: 'BONUS',
        pointsDelta: rules.newCustomerBonusPoints,
        sourceType: 'CAMPAIGN',
        reason: 'Bonus de bienvenue',
      });
    }
    return doc;
  }

  async getByCardNumber(cardNumber: string): Promise<LoyaltyAccountDocument | null> {
    return this.accounts.findOne({ cardNumber });
  }

  async getCustomer(customerId: string) {
    return this.customers.findById(customerId).catch(() => null);
  }

  async getByCustomerId(customerId: string): Promise<LoyaltyAccountDocument | null> {
    return this.accounts.findOne({ customerId });
  }

  async getById(id: string): Promise<LoyaltyAccountDocument | null> {
    return this.accounts.findById(id).catch(() => null);
  }

  async lookupByPhone(phone: string): Promise<{ customerId: string | null; customerName: string | null; account: LoyaltyAccountDocument | null }> {
    const normalized = normalizePhone(phone);
    if (!normalized) return { customerId: null, customerName: null, account: null };
    const customer = await this.customers.findOne({ phone: normalized });
    if (!customer) return { customerId: null, customerName: null, account: null };
    const account = await this.accounts.findOne({ customerId: customer.id });
    return {
      customerId: customer.id,
      customerName: `${customer.firstName} ${customer.lastName}`.trim(),
      account,
    };
  }

  async listAdmin(search?: string, page?: number, perPage?: number) {
    const { page: p, perPage: pp, skip } = clampPagination(page, perPage, 50);
    let customerIds: string[] | null = null;
    if (search) {
      const normalized = normalizePhone(search);
      const matches = await this.customers
        .find({
          $or: [
            { phone: { $regex: normalized || search, $options: 'i' } },
            { firstName: { $regex: search, $options: 'i' } },
            { lastName: { $regex: search, $options: 'i' } },
          ],
        })
        .select({ _id: 1 });
      customerIds = matches.map((m) => m.id);
    }
    const filter: Record<string, unknown> = {};
    if (search) {
      filter.$or = [{ cardNumber: { $regex: search, $options: 'i' } }, { customerId: { $in: customerIds ?? [] } }];
    }
    const [docs, total] = await Promise.all([
      this.accounts.find(filter).sort({ createdAt: -1 }).skip(skip).limit(pp),
      this.accounts.countDocuments(filter),
    ]);
    const enriched = await this.enrichAccounts(docs);
    return paginate(enriched, total, p, pp);
  }

  async listTransactions(accountId: string, page?: number, perPage?: number) {
    const { page: p, perPage: pp, skip } = clampPagination(page, perPage, 50);
    const filter = { loyaltyAccountId: accountId };
    const [docs, total] = await Promise.all([
      this.transactions.find(filter).sort({ createdAt: -1 }).skip(skip).limit(pp),
      this.transactions.countDocuments(filter),
    ]);
    return paginate(docs, total, p, pp);
  }

  async suspend(id: string): Promise<LoyaltyAccountDocument> {
    const account = await this.accounts.findById(id);
    if (!account) throw new NotFoundException('Compte de fidélité introuvable');
    account.status = 'SUSPENDED';
    await account.save();
    return account;
  }

  async manualAdjustment(accountId: string, pointsDelta: number, reason: string, performedBy: string): Promise<LoyaltyAccountDocument> {
    return this.ledger.apply({
      accountId,
      type: 'MANUAL_ADJUSTMENT',
      pointsDelta,
      sourceType: 'MANUAL',
      reason,
      performedBy,
    });
  }

  private async enrichAccounts(docs: LoyaltyAccountDocument[]) {
    const customerIds = [...new Set(docs.map((d) => d.customerId))];
    const customerDocs = customerIds.length ? await this.customers.find({ _id: { $in: customerIds } }) : [];
    const byId = new Map(customerDocs.map((c) => [c.id, c]));
    return docs.map((d) => ({ doc: d, customer: byId.get(d.customerId) }));
  }

  // ---- Redemption ----------------------------------------------------

  /**
   * Validates every redemption guard without touching the database — the
   * actual points deduction + discount application commits atomically
   * inside PosSalesService.create()'s own transaction (the sale is never
   * left half-applied). This is the guard-checking half of that flow,
   * reused both by the POS preview endpoint and by the sale-creation path
   * itself so the two never drift.
   */
  async validateRedemption(
    account: LoyaltyAccountDocument,
    points: number,
    saleSubtotalMinor: number,
    managerApproval?: { employeeId: string; password: string },
    actingEmployeeRole?: EmployeeRole,
  ): Promise<RedeemPreviewResult> {
    if (account.status !== 'ACTIVE') {
      return { valid: false, discountMinor: 0, requiresManagerApproval: false, error: 'Compte de fidélité suspendu' };
    }
    if (!Number.isInteger(points) || points <= 0) {
      return { valid: false, discountMinor: 0, requiresManagerApproval: false, error: 'Nombre de points invalide' };
    }
    const rules = await this.settings.getLoyaltySettings();
    if (points < rules.minimumPointsToRedeem) {
      return {
        valid: false,
        discountMinor: 0,
        requiresManagerApproval: false,
        error: `Minimum ${rules.minimumPointsToRedeem} points requis pour un échange`,
      };
    }
    if (points > account.pointsBalance) {
      return { valid: false, discountMinor: 0, requiresManagerApproval: false, error: 'Solde de points insuffisant' };
    }

    const discountMinor = this.rules.pointsToDiscountMinor(points, rules);
    const maxDiscountMinor = Math.floor((saleSubtotalMinor * rules.maxRedemptionPercentOfSale) / 100);
    if (discountMinor > maxDiscountMinor) {
      return {
        valid: false,
        discountMinor: 0,
        requiresManagerApproval: false,
        error: `La remise dépasse ${rules.maxRedemptionPercentOfSale}% du montant de la vente`,
      };
    }

    const requiresManagerApproval = discountMinor > rules.managerApprovalAboveMinor
      && !(actingEmployeeRole && roleHasPermission(actingEmployeeRole, 'pos.apply_advanced_discount'));
    if (requiresManagerApproval) {
      if (!managerApproval) {
        return { valid: false, discountMinor, requiresManagerApproval: true, error: "Approbation d'un responsable requise" };
      }
      const approver = await this.employees.findOne({ _id: managerApproval.employeeId, active: true });
      if (!approver || !roleHasPermission(approver.role, 'pos.apply_advanced_discount')) {
        return { valid: false, discountMinor, requiresManagerApproval: true, error: 'Employé approbateur invalide' };
      }
      const ok = await verifyPassword(approver.passwordHash, managerApproval.password);
      if (!ok) {
        return { valid: false, discountMinor, requiresManagerApproval: true, error: 'Mot de passe du responsable incorrect' };
      }
    }

    return { valid: true, discountMinor, requiresManagerApproval, error: null };
  }

  /** Commits the redemption — called only from inside an already-open sale
   *  transaction, after validateRedemption() has passed. */
  async commitRedemption(
    accountId: string,
    points: number,
    saleId: string,
    performedBy: string,
    session?: ClientSession,
  ): Promise<void> {
    await this.ledger.apply({
      accountId,
      type: 'REDEEM',
      pointsDelta: -points,
      sourceType: 'POS_SALE',
      sourceId: saleId,
      performedBy,
      session,
    });
  }
}
