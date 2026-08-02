import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { AuditActor } from '@contracts';
import { Product } from '@/catalog/product.schema';
import { ProductVariantsService } from '@/catalog/product-variants.service';
import { addMinor, percentOfMinor, toMinor } from '@/common/money';
import { CountersService } from '@/database/counters.service';
import { OrdersService } from '@/orders/orders.service';
import { SettingsService } from '@/settings/settings.service';
import { CreateQuoteDto, QuoteLineInputDto } from './dto/quote.dto';
import { Quote, QuoteDocument, QuoteLine } from './quote.schema';

const SEQUENCE_NAME = 'quote';

@Injectable()
export class QuotesService {
  constructor(
    @InjectModel(Quote.name) private readonly model: Model<Quote>,
    @InjectModel(Product.name) private readonly products: Model<Product>,
    private readonly variants: ProductVariantsService,
    private readonly settings: SettingsService,
    private readonly counters: CountersService,
    private readonly orders: OrdersService,
  ) {}

  private async resolveLines(inputs: QuoteLineInputDto[], tvaRatePercent: number): Promise<QuoteLine[]> {
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
        } satisfies QuoteLine;
      }),
    );
  }

  async create(dto: CreateQuoteDto, actor: AuditActor): Promise<QuoteDocument> {
    const { tvaRatePercent } = await this.settings.getInvoicingSettings();
    const lines = await this.resolveLines(dto.lines, tvaRatePercent);
    const { subtotalMinor, discountMinor, taxMinor, shippingMinor, totalMinor } = this.computeTotals(lines, dto.shipping);

    const quoteNumber = await this.counters.next(SEQUENCE_NAME);
    return this.model.create({
      quoteNumber,
      customerId: dto.customerId ?? null,
      customerSnapshot: {
        name: dto.customerSnapshot.name,
        phone: dto.customerSnapshot.phone,
        email: dto.customerSnapshot.email ?? null,
        address: dto.customerSnapshot.address ?? null,
      },
      billingAddress: dto.billingAddress ?? null,
      shippingAddress: dto.shippingAddress ?? null,
      issueDate: new Date(),
      expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : null,
      salespersonId: actor.id ?? 'system',
      lines,
      subtotalMinor,
      discountMinor,
      taxMinor,
      shippingMinor,
      totalMinor,
      notes: dto.notes ?? null,
      terms: dto.terms ?? null,
      status: 'DRAFT',
      version: 1,
      previousVersionId: null,
      createdBy: actor.id ?? 'system',
      updatedBy: actor.id ?? 'system',
    });
  }

  private computeTotals(lines: QuoteLine[], shippingDinars?: number) {
    const subtotalMinor = addMinor(...lines.map((l) => l.unitPriceMinor * l.quantity));
    const discountMinor = addMinor(...lines.map((l) => l.discountMinor));
    const taxMinor = addMinor(...lines.map((l) => l.taxMinor));
    const shippingMinor = shippingDinars != null ? toMinor(shippingDinars) : 0;
    const totalMinor = subtotalMinor - discountMinor + taxMinor + shippingMinor;
    return { subtotalMinor, discountMinor, taxMinor, shippingMinor, totalMinor };
  }

  async list(status?: string): Promise<QuoteDocument[]> {
    const filter = status && status !== 'any' ? { status } : {};
    return this.model.find(filter).sort({ createdAt: -1 }).limit(200);
  }

  /** Only the latest version of each quoteNumber shows in the default list — history stays reachable via getById on a specific document. */
  async listLatestOnly(): Promise<QuoteDocument[]> {
    const all = await this.model.find().sort({ quoteNumber: 1, version: -1 });
    const seen = new Set<number>();
    const latest: QuoteDocument[] = [];
    for (const doc of all) {
      if (seen.has(doc.quoteNumber)) continue;
      seen.add(doc.quoteNumber);
      latest.push(doc);
    }
    return latest.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async getById(id: string): Promise<QuoteDocument> {
    const doc = await this.model.findById(id).catch(() => null);
    if (!doc) throw new NotFoundException('Devis introuvable');
    return doc;
  }

  async history(quoteNumber: number): Promise<QuoteDocument[]> {
    return this.model.find({ quoteNumber }).sort({ version: 1 });
  }

  async send(id: string, actor: AuditActor): Promise<QuoteDocument> {
    const doc = await this.getById(id);
    if (doc.status !== 'DRAFT') throw new BadRequestException(`Impossible d'envoyer un devis au statut ${doc.status}`);
    doc.status = 'SENT';
    doc.updatedBy = actor.id ?? 'system';
    await doc.save();
    return doc;
  }

  async accept(id: string, actor: AuditActor): Promise<QuoteDocument> {
    const doc = await this.getById(id);
    if (!['SENT', 'VIEWED'].includes(doc.status)) throw new BadRequestException(`Impossible d'accepter un devis au statut ${doc.status}`);
    doc.status = 'ACCEPTED';
    doc.updatedBy = actor.id ?? 'system';
    await doc.save();
    return doc;
  }

  async reject(id: string, actor: AuditActor): Promise<QuoteDocument> {
    const doc = await this.getById(id);
    if (!['SENT', 'VIEWED'].includes(doc.status)) throw new BadRequestException(`Impossible de refuser un devis au statut ${doc.status}`);
    doc.status = 'REJECTED';
    doc.updatedBy = actor.id ?? 'system';
    await doc.save();
    return doc;
  }

  /**
   * The only edit path once a quote exists: never mutates in place, always
   * creates version+1 with the same quoteNumber and previousVersionId set.
   * Works from any status (this build has no separate free-form DRAFT
   * PATCH endpoint — revise covers all cases, including DRAFT).
   */
  async revise(id: string, dto: CreateQuoteDto, actor: AuditActor): Promise<QuoteDocument> {
    const previous = await this.getById(id);
    const { tvaRatePercent } = await this.settings.getInvoicingSettings();
    const lines = await this.resolveLines(dto.lines, tvaRatePercent);
    const { subtotalMinor, discountMinor, taxMinor, shippingMinor, totalMinor } = this.computeTotals(lines, dto.shipping);

    const revised = await this.model.create({
      quoteNumber: previous.quoteNumber,
      customerId: dto.customerId ?? previous.customerId,
      customerSnapshot: {
        name: dto.customerSnapshot.name,
        phone: dto.customerSnapshot.phone,
        email: dto.customerSnapshot.email ?? null,
        address: dto.customerSnapshot.address ?? null,
      },
      billingAddress: dto.billingAddress ?? previous.billingAddress,
      shippingAddress: dto.shippingAddress ?? previous.shippingAddress,
      issueDate: new Date(),
      expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : previous.expiryDate,
      salespersonId: previous.salespersonId,
      lines,
      subtotalMinor,
      discountMinor,
      taxMinor,
      shippingMinor,
      totalMinor,
      notes: dto.notes ?? previous.notes,
      terms: dto.terms ?? previous.terms,
      status: 'DRAFT',
      version: previous.version + 1,
      previousVersionId: previous.id,
      createdBy: previous.createdBy,
      updatedBy: actor.id ?? 'system',
    });
    return revised;
  }

  async convertToOrder(id: string, actor: AuditActor): Promise<{ quote: QuoteDocument; orderId: string }> {
    const doc = await this.getById(id);
    if (doc.status !== 'ACCEPTED') throw new BadRequestException(`Seul un devis accepté peut être converti (statut actuel: ${doc.status})`);
    if (doc.lines.some((l) => !l.productId)) {
      throw new BadRequestException('Toutes les lignes doivent référencer un produit du catalogue pour convertir en commande');
    }

    const city = doc.shippingAddress?.city ?? doc.billingAddress?.city ?? '';
    const address = doc.shippingAddress?.line1 ?? doc.billingAddress?.line1 ?? doc.customerSnapshot.address ?? '';
    const order = await this.orders.create(
      {
        customer: {
          firstName: doc.customerSnapshot.name,
          phone: doc.customerSnapshot.phone,
          email: doc.customerSnapshot.email ?? undefined,
          city,
          address,
        },
        items: doc.lines.map((l, i) => ({
          lineId: String(i + 1),
          productId: l.productId!,
          name: l.descriptionSnapshot,
          price: l.unitPriceMinor / 1000,
          qty: l.quantity,
          image: '',
        })),
        shipping: doc.shippingMinor / 1000,
        source: 'quote',
      },
      undefined,
    );

    doc.status = 'CONVERTED';
    doc.convertedOrderId = order.id;
    doc.updatedBy = actor.id ?? 'system';
    await doc.save();
    return { quote: doc, orderId: order.id };
  }

  async delete(id: string): Promise<void> {
    await this.model.deleteOne({ _id: id });
  }

  async deleteMany(ids: string[]): Promise<number> {
    const res = await this.model.deleteMany({ _id: { $in: ids } });
    return res.deletedCount;
  }
}
