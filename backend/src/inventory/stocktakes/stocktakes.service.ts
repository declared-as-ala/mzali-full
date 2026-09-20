import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model } from 'mongoose';
import type { AuditActor } from '@contracts';
import { Product } from '@/catalog/product.schema';
import { ProductVariantsService } from '@/catalog/product-variants.service';
import { LocationsService } from '@/catalog/locations.service';
import { CountersService } from '@/database/counters.service';
import { SettingsService } from '@/settings/settings.service';
import { StockLedgerService } from '../stock-ledger.service';
import { CreateStocktakeDto, SubmitCountDto } from './dto/stocktake.dto';
import { Stocktake, StocktakeDocument } from './stocktake.schema';

const SEQUENCE_NAME = 'stocktake';

@Injectable()
export class StocktakesService {
  constructor(
    @InjectModel(Stocktake.name) private readonly model: Model<Stocktake>,
    @InjectModel(Product.name) private readonly products: Model<Product>,
    private readonly variants: ProductVariantsService,
    private readonly locations: LocationsService,
    private readonly ledger: StockLedgerService,
    private readonly counters: CountersService,
    private readonly settings: SettingsService,
    @InjectConnection() private readonly connection: Connection,
  ) {}

  async create(dto: CreateStocktakeDto, startedBy: AuditActor): Promise<StocktakeDocument> {
    const locationId = dto.locationId.toUpperCase();
    await this.locations.requireByCode(locationId);

    const productFilter: Record<string, unknown> = { deletedAt: null };
    if (dto.scopeKind === 'categories') {
      if (!dto.categoryIds?.length) throw new BadRequestException('Sélectionnez au moins une catégorie');
      productFilter.categoryIds = { $in: dto.categoryIds };
    }
    const productDocs = await this.products.find(productFilter).select({ _id: 1, name: 1 });
    const productIds = productDocs.map((p) => p.id);
    const productNameById = new Map(productDocs.map((p) => [p.id, p.name]));
    const allVariants = await this.variants.allForProducts(productIds);
    if (!allVariants.length) throw new BadRequestException('Aucune variante dans ce périmètre');

    const variantIds = allVariants.map(v => v.id);
    const stockItems = await this.ledger.stockForVariants(variantIds, locationId);
    const onHandByVariant = new Map(stockItems.map((i) => [i.variantId, i.quantityOnHand]));

    const stocktakeNumber = await this.counters.next(SEQUENCE_NAME);
    const doc = await this.model.create({
      stocktakeNumber,
      locationId,
      status: 'IN_PROGRESS',
      scope: { kind: dto.scopeKind, categoryIds: dto.categoryIds ?? [] },
      blindCount: dto.blindCount ?? false,
      lines: allVariants.map(variant => ({
        variantId: variant.id,
        productId: variant.productId,
        productName: [productNameById.get(variant.productId) ?? variant.productId, variant.attributes.size, variant.attributes.color].filter(Boolean).join(' / '),
        expectedQuantity: onHandByVariant.get(variant.id) ?? 0,
        countedQuantity: null,
        difference: null,
        reasonIfLarge: null,
      })),
      startedBy,
      approvedBy: null,
      postedAt: null,
    });
    return doc;
  }

  async list(status?: string): Promise<StocktakeDocument[]> {
    const filter = status && status !== 'any' ? { status } : {};
    return this.model.find(filter).sort({ createdAt: -1 }).limit(200);
  }

  async getById(id: string): Promise<StocktakeDocument> {
    const doc = await this.model.findById(id).catch(() => null);
    if (!doc) throw new NotFoundException('Inventaire introuvable');
    return doc;
  }

  async submitCount(id: string, dto: SubmitCountDto, _actor: AuditActor): Promise<StocktakeDocument> {
    const session = await this.connection.startSession();
    try {
      return await session.withTransaction(async () => {
        const doc = await this.model.findById(id).session(session);
        if (!doc) throw new NotFoundException('Inventaire introuvable');
        await this.model.updateOne({ _id: id }, { $currentDate: { updatedAt: true } }, { session });
        if (doc.status !== 'IN_PROGRESS' && doc.status !== 'REVIEW_REQUIRED') {
          throw new BadRequestException(`Impossible de compter un inventaire au statut ${doc.status}`);
        }
        const { stocktakeVarianceThreshold } = await this.settings.getInventorySettings();
        const byVariant = new Map(dto.lines.map((l) => [l.variantId, l]));

        let needsReview = false;
        for (const line of doc.lines) {
          const input = byVariant.get(line.variantId);
          if (!input) continue;
          line.countedQuantity = input.countedQuantity;
          line.difference = input.countedQuantity - line.expectedQuantity;
          line.reasonIfLarge = input.reasonIfLarge ?? line.reasonIfLarge;
          const isLarge = Math.abs(line.difference) > stocktakeVarianceThreshold;
          if (isLarge && !line.reasonIfLarge) needsReview = true;
        }

        const fullyCounted = doc.lines.every((line) => line.countedQuantity !== null);
        if (fullyCounted) {
          doc.status = needsReview ? 'REVIEW_REQUIRED' : 'COUNTED';
        }
        await doc.save({ session });
        return doc;
      }) as StocktakeDocument;
    } finally { await session.endSession(); }
  }

  async approve(id: string, actor: AuditActor): Promise<StocktakeDocument> {
    const session = await this.connection.startSession();
    try {
      return await session.withTransaction(async () => {
        const doc = await this.model.findById(id).session(session);
        if (!doc) throw new NotFoundException('Inventaire introuvable');
        await this.model.updateOne({ _id: id }, { $currentDate: { updatedAt: true } }, { session });
        if (doc.status !== 'COUNTED' && doc.status !== 'REVIEW_REQUIRED') {
          throw new BadRequestException(`Impossible d'approuver un inventaire au statut ${doc.status}`);
        }
        const { stocktakeVarianceThreshold } = await this.settings.getInventorySettings();
        const missingReason = doc.lines.find(
          (line) => line.difference !== null && Math.abs(line.difference) > stocktakeVarianceThreshold && !line.reasonIfLarge,
        );
        if (missingReason) {
          throw new BadRequestException(`Un motif est requis pour l'écart important sur la variante ${missingReason.variantId}`);
        }
        if (doc.lines.some((line) => line.countedQuantity === null)) {
          throw new BadRequestException('Toutes les lignes doivent être comptées avant approbation');
        }
        doc.status = 'APPROVED';
        doc.approvedBy = actor;
        await doc.save({ session });
        return doc;
      }) as StocktakeDocument;
    } finally { await session.endSession(); }
  }

  /**
   * The one place in the codebase a movement's delta is derived from a
   * target (countedQuantity) rather than a signed input — re-reads live
   * onHand inside the transaction and refuses stale counts if another operation changed the stock.
   */
  async post(id: string, actor: AuditActor): Promise<StocktakeDocument> {
    let doc = await this.getById(id);
    if (doc.status === 'POSTED') return doc;
    if (doc.status !== 'APPROVED') {
      throw new BadRequestException(`Impossible de valider un inventaire au statut ${doc.status}`);
    }

    const session = await this.connection.startSession();
    try {
      await session.withTransaction(async () => {
        doc = await this.model.findById(id).session(session) as StocktakeDocument;
        if (doc.status === 'POSTED') return;
        if (doc.status !== 'APPROVED') throw new BadRequestException('Inventaire non approuvé');
        await this.model.updateOne({ _id: id }, { $currentDate: { updatedAt: true } }, { session });
        for (const line of doc.lines) {
          if (line.countedQuantity === null) continue;
          const current = await this.ledger.stockAt(line.variantId, doc.locationId, session);
          const currentOnHand = current?.quantityOnHand ?? 0;
          if (currentOnHand !== line.expectedQuantity) throw new BadRequestException('Le stock a changé depuis le comptage. Annulez cet inventaire et créez un nouveau comptage.');
          const delta = line.countedQuantity - currentOnHand;
          if (delta === 0) continue;
          await this.ledger.applyMovement({
            variantId: line.variantId,
            locationId: doc.locationId,
            type: 'stocktake_correction',
            onHandDelta: delta,
            reference: doc.id,
            reason: `Inventaire ${doc.stocktakeNumber}: comptage ${line.countedQuantity} (système ${currentOnHand})`,
            actor,
            session,
          });
        }
        doc.status = 'POSTED';
        doc.postedAt = new Date();
        await doc.save({ session });
      });
    } finally {
      await session.endSession();
    }
    return doc;
  }

  async cancel(id: string, _actor: AuditActor): Promise<StocktakeDocument> {
    const session = await this.connection.startSession();
    try {
      return await session.withTransaction(async () => {
        const doc = await this.model.findById(id).session(session);
        if (!doc) throw new NotFoundException('Inventaire introuvable');
        if (doc.status === 'POSTED' || doc.status === 'CANCELLED') throw new BadRequestException(`Impossible d'annuler un inventaire au statut ${doc.status}`);
        await this.model.updateOne({ _id: id }, { $currentDate: { updatedAt: true } }, { session });
        doc.status = 'CANCELLED';
        await doc.save({ session });
        return doc;
      }) as StocktakeDocument;
    } finally { await session.endSession(); }
  }

}
