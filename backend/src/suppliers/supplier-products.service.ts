import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model } from 'mongoose';
import { toMinor } from '@/common/money';
import { CreateSupplierProductDto, ListSupplierProductsQueryDto, UpdateSupplierProductDto } from './dto/supplier-product.dto';
import { SupplierProduct, SupplierProductDocument } from './supplier-product.schema';

@Injectable()
export class SupplierProductsService {
  constructor(@InjectModel(SupplierProduct.name) private readonly model: Model<SupplierProduct>) {}

  async list(query: ListSupplierProductsQueryDto): Promise<SupplierProductDocument[]> {
    const filter: FilterQuery<SupplierProductDocument> = {};
    if (query.supplierId) filter.supplierId = query.supplierId;
    if (query.category) filter.category = query.category;
    if (query.brand) filter.brand = query.brand;
    if (query.status) filter.active = query.status === 'active';
    if (query.search?.trim()) filter.$text = { $search: query.search.trim() };
    return this.model.find(filter).sort({ updatedAt: -1 }).limit(500);
  }

  async getById(id: string): Promise<SupplierProductDocument> {
    const doc = await this.model.findById(id).catch(() => null);
    if (!doc) throw new NotFoundException('Produit fournisseur introuvable');
    return doc;
  }

  async create(dto: CreateSupplierProductDto): Promise<SupplierProductDocument> {
    const purchasePriceMinor = toMinor(dto.purchasePrice);
    return this.model.create({
      supplierId: dto.supplierId,
      name: dto.name,
      category: dto.category ?? null,
      brand: dto.brand ?? null,
      size: dto.size ?? null,
      color: dto.color ?? null,
      purchasePriceMinor,
      suggestedSellingPriceMinor: dto.suggestedSellingPrice != null ? toMinor(dto.suggestedSellingPrice) : null,
      notes: dto.notes ?? null,
      active: dto.active ?? true,
      priceHistory: [{ priceMinor: purchasePriceMinor, at: new Date() }],
    });
  }

  async update(id: string, dto: UpdateSupplierProductDto): Promise<SupplierProductDocument> {
    const doc = await this.getById(id);
    if (dto.name !== undefined) doc.name = dto.name;
    if (dto.category !== undefined) doc.category = dto.category || null;
    if (dto.brand !== undefined) doc.brand = dto.brand || null;
    if (dto.size !== undefined) doc.size = dto.size || null;
    if (dto.color !== undefined) doc.color = dto.color || null;
    if (dto.suggestedSellingPrice !== undefined) {
      doc.suggestedSellingPriceMinor = dto.suggestedSellingPrice != null ? toMinor(dto.suggestedSellingPrice) : null;
    }
    if (dto.notes !== undefined) doc.notes = dto.notes || null;
    if (dto.active !== undefined) doc.active = dto.active;
    if (dto.purchasePrice !== undefined) {
      const newPriceMinor = toMinor(dto.purchasePrice);
      if (newPriceMinor !== doc.purchasePriceMinor) {
        doc.purchasePriceMinor = newPriceMinor;
        doc.priceHistory.push({ priceMinor: newPriceMinor, at: new Date() });
      }
    }
    await doc.save();
    return doc;
  }

  async delete(id: string): Promise<void> {
    await this.model.deleteOne({ _id: id });
  }

  async countBySupplier(supplierIds: string[]): Promise<Map<string, number>> {
    if (!supplierIds.length) return new Map();
    const rows = await this.model.aggregate<{ _id: string; count: number }>([
      { $match: { supplierId: { $in: supplierIds } } },
      { $group: { _id: '$supplierId', count: { $sum: 1 } } },
    ]);
    return new Map(rows.map((r) => [r._id, r.count]));
  }

  async distinctCategoriesAndBrands(): Promise<{ categories: string[]; brands: string[] }> {
    const [categories, brands] = await Promise.all([
      this.model.distinct('category', { category: { $ne: null } }),
      this.model.distinct('brand', { brand: { $ne: null } }),
    ]);
    return { categories: categories.sort(), brands: brands.sort() };
  }
}
