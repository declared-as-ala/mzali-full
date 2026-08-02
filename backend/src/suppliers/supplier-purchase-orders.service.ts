import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { AuditActor } from '@contracts';
import { addMinor, toMinor } from '@/common/money';
import { CountersService } from '@/database/counters.service';
import { CreateSupplierPurchaseOrderDto } from './dto/supplier-purchase-order.dto';
import { Supplier } from './supplier.schema';
import { SupplierPurchaseOrder, SupplierPurchaseOrderDocument, SupplierPurchaseOrderStatus } from './supplier-purchase-order.schema';

const SEQUENCE_NAME = 'supplier-purchase-order';

@Injectable()
export class SupplierPurchaseOrdersService {
  constructor(
    @InjectModel(SupplierPurchaseOrder.name) private readonly model: Model<SupplierPurchaseOrder>,
    @InjectModel(Supplier.name) private readonly suppliers: Model<Supplier>,
    private readonly counters: CountersService,
  ) {}

  /** Pure record-keeping — never calls StockLedgerService or touches inventory/product data. */
  async create(dto: CreateSupplierPurchaseOrderDto, createdBy: AuditActor): Promise<SupplierPurchaseOrderDocument> {
    const supplier = await this.suppliers.findById(dto.supplierId).catch(() => null);
    if (!supplier) throw new BadRequestException('Fournisseur introuvable');
    if (!dto.lines.length) throw new BadRequestException('Le bon de commande doit contenir au moins une ligne');

    const lines = dto.lines.map((l) => {
      const unitPriceMinor = toMinor(l.unitPrice);
      return {
        supplierProductId: l.supplierProductId ?? null,
        name: l.name,
        category: l.category ?? null,
        brand: l.brand ?? null,
        size: l.size ?? null,
        color: l.color ?? null,
        quantity: l.quantity,
        unitPriceMinor,
        lineTotalMinor: unitPriceMinor * l.quantity,
      };
    });
    const totalMinor = addMinor(...lines.map((l) => l.lineTotalMinor));

    const poNumber = await this.counters.next(SEQUENCE_NAME);
    return this.model.create({
      poNumber,
      supplierId: dto.supplierId,
      orderDate: new Date(),
      lines,
      totalMinor,
      notes: dto.notes ?? null,
      status: 'DRAFT',
      createdBy,
      pdfMediaId: null,
    });
  }

  async list(supplierId?: string): Promise<SupplierPurchaseOrderDocument[]> {
    const filter = supplierId ? { supplierId } : {};
    return this.model.find(filter).sort({ createdAt: -1 }).limit(300);
  }

  async getById(id: string): Promise<SupplierPurchaseOrderDocument> {
    const doc = await this.model.findById(id).catch(() => null);
    if (!doc) throw new NotFoundException('Bon de commande introuvable');
    return doc;
  }

  /** Organizational only — no status here ever triggers a stock or ledger effect. */
  async setStatus(id: string, status: SupplierPurchaseOrderStatus): Promise<SupplierPurchaseOrderDocument> {
    const doc = await this.getById(id);
    doc.status = status;
    await doc.save();
    return doc;
  }

  async countBySupplier(supplierIds: string[]): Promise<Map<string, number>> {
    if (!supplierIds.length) return new Map();
    const rows = await this.model.aggregate<{ _id: string; count: number }>([
      { $match: { supplierId: { $in: supplierIds } } },
      { $group: { _id: '$supplierId', count: { $sum: 1 } } },
    ]);
    return new Map(rows.map((r) => [r._id, r.count]));
  }

  async lastBySupplier(supplierIds: string[]): Promise<Map<string, Date>> {
    if (!supplierIds.length) return new Map();
    const rows = await this.model.aggregate<{ _id: string; last: Date }>([
      { $match: { supplierId: { $in: supplierIds } } },
      { $sort: { createdAt: -1 } },
      { $group: { _id: '$supplierId', last: { $first: '$createdAt' } } },
    ]);
    return new Map(rows.map((r) => [r._id, r.last]));
  }
}
