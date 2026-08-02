import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { AuditActor } from '@contracts';
import { Product } from '@/catalog/product.schema';
import { ProductVariantsService } from '@/catalog/product-variants.service';
import { addMinor, percentOfMinor, toMinor } from '@/common/money';
import { CountersService } from '@/database/counters.service';
import { SettingsService } from '@/settings/settings.service';
import { CreateInvoiceDto, InvoiceLineInputDto, RecordPaymentDto, UpdateInvoiceDto } from './dto/invoice.dto';
import { Invoice, InvoiceDocument, InvoiceLine, InvoiceType } from './invoice.schema';

const SEQUENCE_BY_TYPE: Record<InvoiceType, string> = {
  SALES_INVOICE: 'invoice-sales',
  POS_INVOICE: 'invoice-pos',
  ONLINE_INVOICE: 'invoice-online',
  PROFORMA: 'invoice-proforma',
  CREDIT_NOTE: 'credit-note',
};

// Proforma/credit-note documents don't carry a real fiscal stamp.
const TIMBRE_ELIGIBLE_TYPES: InvoiceType[] = ['SALES_INVOICE', 'POS_INVOICE', 'ONLINE_INVOICE'];

@Injectable()
export class InvoicesService {
  constructor(
    @InjectModel(Invoice.name) private readonly model: Model<Invoice>,
    @InjectModel(Product.name) private readonly products: Model<Product>,
    private readonly variants: ProductVariantsService,
    private readonly settings: SettingsService,
    private readonly counters: CountersService,
  ) {}

  private async resolveLines(inputs: InvoiceLineInputDto[], tvaRatePercent: number): Promise<InvoiceLine[]> {
    return Promise.all(
      inputs.map(async (l) => {
        let descriptionSnapshot: string;
        let unitPriceMinor: number;
        let variantId: string | null = null;
        let productId: string | null = null;

        if (l.productId) {
          const product = await this.products.findOne({ _id: l.productId, deletedAt: null });
          if (!product) throw new BadRequestException(`Produit introuvable: ${l.productId}`);
          let variant = await this.variants.findByProductId(l.productId);
          if (!variant) variant = await this.variants.generateDefaultVariant(l.productId);
          variantId = variant.id;
          productId = product.id;
          descriptionSnapshot = product.name;
          unitPriceMinor = l.unitPrice != null ? toMinor(l.unitPrice) : (product.salePriceMinor ?? product.regularPriceMinor);
        } else {
          if (!l.description || l.unitPrice == null) {
            throw new BadRequestException('Une ligne libre nécessite une description et un prix unitaire');
          }
          descriptionSnapshot = l.description;
          unitPriceMinor = toMinor(l.unitPrice);
        }

        const discountMinor = l.discount != null ? toMinor(l.discount) : 0;
        const lineSubtotal = unitPriceMinor * l.quantity - discountMinor;
        const taxMinor = percentOfMinor(Math.max(0, lineSubtotal), tvaRatePercent);
        return {
          variantId,
          productId,
          descriptionSnapshot,
          quantity: l.quantity,
          unitPriceMinor,
          discountMinor,
          taxMinor,
          lineTotalMinor: lineSubtotal + taxMinor,
        } satisfies InvoiceLine;
      }),
    );
  }

  private computeTotals(lines: InvoiceLine[], shippingDinars: number | undefined, timbreFiscalMinor: number) {
    const subtotalMinor = addMinor(...lines.map((l) => l.unitPriceMinor * l.quantity));
    const discountMinor = addMinor(...lines.map((l) => l.discountMinor));
    const taxMinor = addMinor(...lines.map((l) => l.taxMinor));
    const shippingMinor = shippingDinars != null ? toMinor(shippingDinars) : 0;
    const totalMinor = subtotalMinor - discountMinor + taxMinor + shippingMinor + timbreFiscalMinor;
    return { subtotalMinor, discountMinor, taxMinor, shippingMinor, totalMinor };
  }

  async create(dto: CreateInvoiceDto, actor: AuditActor): Promise<InvoiceDocument> {
    const { tvaRatePercent, timbreFiscalMinor: configuredTimbre } = await this.settings.getInvoicingSettings();
    const company = await this.settings.getCompany();
    const lines = await this.resolveLines(dto.lines, tvaRatePercent);
    const timbreFiscalMinor = TIMBRE_ELIGIBLE_TYPES.includes(dto.invoiceType) ? configuredTimbre : 0;
    const { subtotalMinor, discountMinor, taxMinor, shippingMinor, totalMinor } = this.computeTotals(lines, dto.shipping, timbreFiscalMinor);

    const invoiceNumber = await this.counters.next(SEQUENCE_BY_TYPE[dto.invoiceType]);
    return this.model.create({
      invoiceNumber,
      invoiceType: dto.invoiceType,
      customerSnapshot: {
        name: dto.customerSnapshot.name,
        phone: dto.customerSnapshot.phone,
        email: dto.customerSnapshot.email ?? null,
        address: dto.customerSnapshot.address ?? null,
      },
      companySnapshot: {
        legalName: company.legalName,
        address: company.address,
        matriculeFiscal: company.matriculeFiscal,
        rcNumber: company.rcNumber,
        phone: company.phone,
        email: company.email,
      },
      billingAddress: dto.billingAddress ?? null,
      issueDate: new Date(),
      dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
      saleId: dto.saleId ?? null,
      orderId: dto.orderId ?? null,
      quoteId: dto.quoteId ?? null,
      lines,
      subtotalMinor,
      discountMinor,
      taxMinor,
      timbreFiscalMinor,
      shippingMinor,
      totalMinor,
      paidMinor: 0,
      balanceMinor: totalMinor,
      payments: [],
      paymentStatus: 'UNPAID',
      status: 'DRAFT',
      notes: dto.notes ?? null,
      terms: dto.terms ?? null,
      createdBy: actor.id ?? 'system',
      finalizedAt: null,
    });
  }

  async list(status?: string, invoiceType?: string): Promise<InvoiceDocument[]> {
    const filter: Record<string, unknown> = {};
    if (status && status !== 'any') filter.status = status;
    if (invoiceType && invoiceType !== 'any') filter.invoiceType = invoiceType;
    return this.model.find(filter).sort({ createdAt: -1 }).limit(200);
  }

  async getById(id: string): Promise<InvoiceDocument> {
    const doc = await this.model.findById(id).catch(() => null);
    if (!doc) throw new NotFoundException('Facture introuvable');
    return doc;
  }

  /** Enforces the immutability rule: once FINALIZED (or later), only `notes` may change. */
  async update(id: string, dto: UpdateInvoiceDto): Promise<InvoiceDocument> {
    const doc = await this.getById(id);
    const attemptsRestrictedChange = dto.lines !== undefined || dto.shipping !== undefined;
    if (doc.status !== 'DRAFT' && attemptsRestrictedChange) {
      throw new ForbiddenException('Une facture finalisée ne peut plus être modifiée — émettez un avoir à la place');
    }
    if (dto.notes !== undefined) doc.notes = dto.notes;
    if (doc.status === 'DRAFT' && dto.lines) {
      const { tvaRatePercent } = await this.settings.getInvoicingSettings();
      const timbreFiscalMinor = TIMBRE_ELIGIBLE_TYPES.includes(doc.invoiceType) ? doc.timbreFiscalMinor : 0;
      const lines = await this.resolveLines(dto.lines, tvaRatePercent);
      const totals = this.computeTotals(lines, dto.shipping != null ? dto.shipping : doc.shippingMinor / 1000, timbreFiscalMinor);
      doc.lines = lines as Invoice['lines'];
      doc.subtotalMinor = totals.subtotalMinor;
      doc.discountMinor = totals.discountMinor;
      doc.taxMinor = totals.taxMinor;
      doc.shippingMinor = totals.shippingMinor;
      doc.totalMinor = totals.totalMinor;
      doc.balanceMinor = totals.totalMinor - doc.paidMinor;
    }
    await doc.save();
    return doc;
  }

  /** The fiscal gate lives here — everything else works regardless of settings.invoicing.enabled. */
  async finalize(id: string): Promise<InvoiceDocument> {
    const doc = await this.getById(id);
    if (doc.status !== 'DRAFT') throw new BadRequestException(`Impossible de finaliser une facture au statut ${doc.status}`);
    const { enabled } = await this.settings.getInvoicingSettings();
    if (!enabled) {
      throw new ForbiddenException(
        "La facturation n'est pas activée (settings.invoicing.enabled = false) — confirmation du comptable requise avant toute finalisation réelle.",
      );
    }
    doc.status = 'FINALIZED';
    doc.finalizedAt = new Date();
    await doc.save();
    return doc;
  }

  async send(id: string): Promise<InvoiceDocument> {
    const doc = await this.getById(id);
    if (!['FINALIZED', 'SENT', 'PARTIALLY_PAID', 'OVERDUE'].includes(doc.status)) {
      throw new BadRequestException(`Impossible d'envoyer une facture au statut ${doc.status}`);
    }
    if (doc.status === 'FINALIZED') doc.status = 'SENT';
    await doc.save();
    return doc;
  }

  /** The only way paidMinor/balanceMinor/paymentStatus ever change — never a generic patch. */
  async recordPayment(id: string, dto: RecordPaymentDto, actor: AuditActor): Promise<InvoiceDocument> {
    const doc = await this.getById(id);
    if (!['FINALIZED', 'SENT', 'PARTIALLY_PAID', 'OVERDUE'].includes(doc.status)) {
      throw new BadRequestException(`Impossible d'enregistrer un paiement sur une facture au statut ${doc.status}`);
    }
    const amountMinor = toMinor(dto.amount);
    doc.payments.push({ amountMinor, method: dto.method, receivedAt: new Date(), receivedBy: actor.id ?? 'system' } as Invoice['payments'][number]);
    this.applyPayment(doc, amountMinor);
    await doc.save();
    return doc;
  }

  private applyPayment(doc: InvoiceDocument, amountMinor: number): void {
    doc.paidMinor += amountMinor;
    doc.balanceMinor = Math.max(0, doc.totalMinor - doc.paidMinor);
    if (doc.paidMinor >= doc.totalMinor) {
      doc.paymentStatus = 'PAID';
      if (doc.status !== 'CANCELLED' && doc.status !== 'CREDITED') doc.status = 'PAID';
    } else if (doc.paidMinor > 0) {
      doc.paymentStatus = 'PARTIALLY_PAID';
      if (doc.status !== 'CANCELLED' && doc.status !== 'CREDITED') doc.status = 'PARTIALLY_PAID';
    }
  }

  /**
   * Creates a linked CREDIT_NOTE document (own numbering, own finalize
   * pass through the same fiscal gate) and applies its total against the
   * original invoice exactly like a payment would — the schema has no
   * separate "creditedMinor" field, so crediting reduces `balanceMinor`
   * the same way recordPayment() does, and flips status to CREDITED once
   * the balance reaches zero.
   */
  async issueCreditNote(id: string, lines: InvoiceLineInputDto[] | undefined, actor: AuditActor): Promise<{ original: InvoiceDocument; creditNote: InvoiceDocument }> {
    const original = await this.getById(id);
    if (!['FINALIZED', 'SENT', 'PARTIALLY_PAID', 'PAID', 'OVERDUE'].includes(original.status)) {
      throw new BadRequestException(`Impossible d'émettre un avoir sur une facture au statut ${original.status}`);
    }
    const { tvaRatePercent, enabled } = await this.settings.getInvoicingSettings();
    const creditLines = lines?.length
      ? await this.resolveLines(lines, tvaRatePercent)
      : (original.lines as unknown as InvoiceLine[]);
    const { subtotalMinor, discountMinor, taxMinor, totalMinor } = this.computeTotals(creditLines, 0, 0);

    const invoiceNumber = await this.counters.next(SEQUENCE_BY_TYPE.CREDIT_NOTE);
    const creditNote = await this.model.create({
      invoiceNumber,
      invoiceType: 'CREDIT_NOTE',
      customerSnapshot: original.customerSnapshot,
      companySnapshot: original.companySnapshot,
      billingAddress: original.billingAddress,
      issueDate: new Date(),
      dueDate: null,
      saleId: original.saleId,
      orderId: original.orderId,
      quoteId: original.quoteId,
      creditedInvoiceId: original.id,
      lines: creditLines,
      subtotalMinor,
      discountMinor,
      taxMinor,
      timbreFiscalMinor: 0,
      shippingMinor: 0,
      totalMinor,
      paidMinor: 0,
      balanceMinor: totalMinor,
      payments: [],
      paymentStatus: 'UNPAID',
      status: enabled ? 'FINALIZED' : 'DRAFT',
      notes: null,
      terms: null,
      createdBy: actor.id ?? 'system',
      finalizedAt: enabled ? new Date() : null,
    });

    this.applyPayment(original, totalMinor);
    if (original.balanceMinor <= 0) original.status = 'CREDITED';
    await original.save();

    return { original, creditNote };
  }

  async delete(id: string): Promise<void> {
    await this.model.deleteOne({ _id: id });
  }

  async deleteMany(ids: string[]): Promise<number> {
    const res = await this.model.deleteMany({ _id: { $in: ids } });
    return res.deletedCount;
  }
}
