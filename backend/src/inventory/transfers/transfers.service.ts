import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model } from 'mongoose';
import type { AuditActor } from '@contracts';
import { LocationsService } from '@/catalog/locations.service';
import { ProductVariantsService } from '@/catalog/product-variants.service';
import { Product } from '@/catalog/product.schema';
import { CountersService } from '@/database/counters.service';
import { InsufficientStockError, StockLedgerService } from '../stock-ledger.service';
import { ApproveTransferDto, CreateTransferDto, ReceiveTransferDto } from './dto/transfer.dto';
import { StockTransfer, StockTransferDocument, TransferLine } from './stock-transfer.schema';

const SEQUENCE_NAME = 'stock-transfer';

@Injectable()
export class TransfersService {
  constructor(
    @InjectModel(StockTransfer.name) private readonly model: Model<StockTransfer>,
    @InjectModel(Product.name) private readonly products: Model<Product>,
    private readonly variants: ProductVariantsService,
    private readonly locations: LocationsService,
    private readonly ledger: StockLedgerService,
    private readonly counters: CountersService,
    @InjectConnection() private readonly connection: Connection,
  ) {}

  async create(dto: CreateTransferDto, requestedBy: AuditActor): Promise<StockTransferDocument> {
    const source = dto.sourceLocationId.toUpperCase();
    const destination = dto.destinationLocationId.toUpperCase();
    if (source === destination) throw new BadRequestException('Le dépôt source et destination doivent être différents');
    await this.locations.requireByCode(source);
    await this.locations.requireByCode(destination);

    const lines = await Promise.all(
      dto.lines.map(async (l) => {
        const product = await this.products.findOne({ _id: l.productId, deletedAt: null });
        if (!product) throw new BadRequestException(`Produit introuvable: ${l.productId}`);
        let variant = await this.variants.findByProductId(l.productId);
        if (!variant) variant = await this.variants.generateDefaultVariant(l.productId);
        return {
          variantId: variant.id,
          productId: product.id,
          productName: product.name,
          requestedQuantity: l.requestedQuantity,
          approvedQuantity: null,
          shippedQuantity: null,
          receivedQuantity: 0,
          damagedQuantity: 0,
          missingQuantity: 0,
        };
      }),
    );

    const status = dto.draft ? 'DRAFT' : 'REQUESTED';
    const now = new Date();
    const transferNumber = await this.counters.next(SEQUENCE_NAME);
    const doc = await this.model.create({
      transferNumber,
      sourceLocationId: source,
      destinationLocationId: destination,
      status,
      lines,
      statusHistory: [{ from: null, to: status, by: requestedBy, at: now, note: null }],
      requestedBy,
      approvedBy: null,
      note: dto.note ?? null,
    });
    return doc;
  }

  async list(status?: string): Promise<StockTransferDocument[]> {
    const filter = status && status !== 'any' ? { status } : {};
    return this.model.find(filter).sort({ createdAt: -1 }).limit(200);
  }

  async getById(id: string): Promise<StockTransferDocument> {
    const doc = await this.model.findById(id).catch(() => null);
    if (!doc) throw new NotFoundException('Transfert introuvable');
    return doc;
  }

  /** Approving a still-DRAFT transfer submits and approves it in one step — this sprint has no separate submit endpoint. */
  async approve(id: string, dto: ApproveTransferDto, approvedBy: AuditActor): Promise<StockTransferDocument> {
    const doc = await this.getById(id);
    if (doc.status !== 'REQUESTED' && doc.status !== 'DRAFT') {
      throw new BadRequestException(`Impossible d'approuver un transfert au statut ${doc.status}`);
    }
    const byVariant = new Map(dto.lines.map((l) => [l.variantId, l.approvedQuantity]));
    for (const line of doc.lines) {
      const approvedQuantity = byVariant.get(line.variantId);
      if (approvedQuantity === undefined) {
        throw new BadRequestException(`Quantité approuvée manquante pour la variante ${line.variantId}`);
      }
      line.approvedQuantity = approvedQuantity;
    }
    this.transition(doc, 'APPROVED', approvedBy);
    doc.approvedBy = approvedBy;
    await doc.save();
    return doc;
  }

  async ship(id: string, actor: AuditActor): Promise<StockTransferDocument> {
    const doc = await this.getById(id);
    if (doc.status !== 'APPROVED') {
      throw new BadRequestException(`Impossible d'expédier un transfert au statut ${doc.status}`);
    }
    const source = await this.locations.requireByCode(doc.sourceLocationId);

    const session = await this.connection.startSession();
    try {
      await session.withTransaction(async () => {
        for (const line of doc.lines) {
          const qty = line.approvedQuantity ?? 0;
          if (qty <= 0) continue;
          try {
            await this.ledger.applyMovement({
              variantId: line.variantId,
              locationId: doc.sourceLocationId,
              type: 'transfer_out',
              onHandDelta: -qty,
              requireAvailableAtLeast: source.allowNegativeStock ? undefined : qty,
              reference: doc.id,
              actor,
              session,
            });
          } catch (err) {
            if (err instanceof InsufficientStockError) {
              throw new BadRequestException(`Stock source insuffisant pour la variante ${line.variantId}`);
            }
            throw err;
          }
          line.shippedQuantity = qty;
        }
        this.transition(doc, 'SHIPPED', actor);
        await doc.save({ session });
      });
    } finally {
      await session.endSession();
    }
    return doc;
  }

  /** Incremental — safe to call more than once for a partial receipt. */
  async receive(id: string, dto: ReceiveTransferDto, actor: AuditActor): Promise<StockTransferDocument> {
    const doc = await this.getById(id);
    if (doc.status !== 'SHIPPED' && doc.status !== 'PARTIALLY_RECEIVED') {
      throw new BadRequestException(`Impossible de réceptionner un transfert au statut ${doc.status}`);
    }
    const byVariant = new Map(dto.lines.map((l) => [l.variantId, l]));

    const session = await this.connection.startSession();
    try {
      await session.withTransaction(async () => {
        for (const line of doc.lines) {
          const input = byVariant.get(line.variantId);
          if (!input) continue;
          const shipped = line.shippedQuantity ?? 0;
          const alreadyAccounted = line.receivedQuantity + line.damagedQuantity + line.missingQuantity;
          const incoming = input.receivedQuantity + (input.damagedQuantity ?? 0) + (input.missingQuantity ?? 0);
          if (alreadyAccounted + incoming > shipped) {
            throw new BadRequestException(
              `La quantité réceptionnée pour ${line.variantId} dépasse la quantité expédiée (${shipped})`,
            );
          }
          if (input.receivedQuantity > 0) {
            await this.ledger.applyMovement({
              variantId: line.variantId,
              locationId: doc.destinationLocationId,
              type: 'transfer_in',
              onHandDelta: input.receivedQuantity,
              reference: doc.id,
              actor,
              session,
            });
          }
          line.receivedQuantity += input.receivedQuantity;
          line.damagedQuantity += input.damagedQuantity ?? 0;
          line.missingQuantity += input.missingQuantity ?? 0;
        }

        const fullyAccounted = doc.lines.every(
          (line: TransferLine) => line.receivedQuantity + line.damagedQuantity + line.missingQuantity >= (line.shippedQuantity ?? 0),
        );
        this.transition(doc, fullyAccounted ? 'RECEIVED' : 'PARTIALLY_RECEIVED', actor);
        await doc.save({ session });
      });
    } finally {
      await session.endSession();
    }
    return doc;
  }

  /** Before shipping: cancels (or rejects, if never approved) with zero stock effect — nothing was ever shipped. */
  async cancel(id: string, actor: AuditActor, note?: string): Promise<StockTransferDocument> {
    const doc = await this.getById(id);
    if (!['DRAFT', 'REQUESTED', 'APPROVED', 'PREPARING'].includes(doc.status)) {
      throw new BadRequestException(`Impossible d'annuler un transfert au statut ${doc.status}`);
    }
    const nextStatus = doc.status === 'REQUESTED' || doc.status === 'DRAFT' ? 'REJECTED' : 'CANCELLED';
    this.transition(doc, nextStatus, actor, note ?? null);
    await doc.save();
    return doc;
  }

  private transition(doc: StockTransferDocument, to: StockTransfer['status'], by: AuditActor, note: string | null = null): void {
    doc.statusHistory.push({ from: doc.status, to, by, at: new Date(), note } as StockTransfer['statusHistory'][number]);
    doc.status = to;
  }
}
