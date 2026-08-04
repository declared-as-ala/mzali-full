import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { Product as ProductContract, ProductListQuery, ProductListResult } from '@contracts';
import { clampPagination, paginate } from '@/common/pagination';
import { slugify } from '@/common/slug';
import { toMinor } from '@/common/money';
import { OnlineAvailabilityService } from '@/inventory/online-availability.service';
import { MediaService } from '@/media/media.service';
import { Category } from './category.schema';
import { CreateProductDto, UpdateProductDto } from './dto/product.dto';
import { parseOptionValues, toProductContract } from './product.mapper';
import { buildProductFilter, buildProductSort } from './product-query';
import { ProductVariantsService } from './product-variants.service';
import { Product, ProductDocument } from './product.schema';

@Injectable()
export class ProductsService {
  constructor(
    @InjectModel(Product.name) private readonly model: Model<Product>,
    @InjectModel(Category.name) private readonly categoryModel: Model<Category>,
    private readonly variants: ProductVariantsService,
    private readonly availability: OnlineAvailabilityService,
    private readonly media: MediaService,
  ) {}

  /** Resolves imageIds (media document ids) to their real, publicly
   *  fetchable URLs — never store the bare id as url (see MediaService.
   *  getUrlsByIds). An id with no matching media doc is dropped rather
   *  than saved with a broken url. */
  private async resolveImages(imageIds: string[]): Promise<{ mediaId: string; url: string; alt: string; position: number }[]> {
    const urlById = await this.media.getUrlsByIds(imageIds);
    return imageIds
      .map((id, i) => ({ mediaId: id, url: urlById.get(id), alt: '', position: i }))
      .filter((img): img is { mediaId: string; url: string; alt: string; position: number } => Boolean(img.url));
  }

  async list(query: ProductListQuery, forcePublished: boolean): Promise<ProductListResult> {
    const { page, perPage, skip } = clampPagination(query.page, query.perPage, 100);
    const filter = buildProductFilter(query, forcePublished);
    const sort = buildProductSort(query);
    const [docs, total] = await Promise.all([
      this.model.find(filter).sort(sort).skip(skip).limit(perPage),
      this.model.countDocuments(filter),
    ]);
    const result = paginate(docs.map((d) => toProductContract(d)), total, page, perPage);
    return result;
  }

  async getBySlug(slug: string, forcePublished: boolean): Promise<ProductContract | null> {
    const filter = forcePublished ? { slug, status: 'published', deletedAt: null } : { slug, deletedAt: null };
    const doc = await this.model.findOne(filter);
    return doc ? this.withLiveAvailability(toProductContract(doc), doc) : null;
  }

  async getById(id: string): Promise<ProductContract | null> {
    const doc = await this.model.findOne({ _id: id, deletedAt: null }).catch(() => null);
    return doc ? this.withLiveAvailability(toProductContract(doc), doc) : null;
  }

  async getRelated(productId: string, limit = 4): Promise<ProductContract[]> {
    const source = await this.model.findById(productId).catch(() => null);
    if (!source) return [];
    const ids = source.upsellIds.length > 0 || source.crossSellIds.length > 0
      ? [...source.upsellIds, ...source.crossSellIds]
      : [];
    let docs: ProductDocument[];
    if (ids.length > 0) {
      docs = await this.model.find({ _id: { $in: ids }, status: 'published', deletedAt: null }).limit(limit);
    } else {
      docs = await this.model
        .find({
          _id: { $ne: source._id },
          categoryIds: { $in: source.categoryIds },
          status: 'published',
          deletedAt: null,
        })
        .limit(limit);
    }
    return docs.map((d) => toProductContract(d));
  }

  async create(input: CreateProductDto): Promise<ProductContract> {
    const slug = input.slug ? slugify(input.slug) : slugify(input.name);
    await this.assertSlugFree(slug);
    const images = await this.resolveImages(input.imageIds ?? []);
    const doc = await this.model.create({
      name: input.name,
      slug,
      description: input.description ?? '',
      shortDescription: input.shortDescription ?? '',
      regularPriceMinor: toMinor(input.regularPrice ?? 0),
      salePriceMinor: input.salePrice != null ? toMinor(input.salePrice) : null,
      sku: input.sku ?? null,
      manageStock: input.manageStock ?? true,
      stockQuantity: input.stockQuantity ?? null,
      status: input.status ?? 'draft',
      categoryIds: input.categoryIds ?? [],
      categorySlugs: await this.resolveCategorySlugs(input.categoryIds ?? []),
      images,
      upsellIds: input.upsellIds ?? [],
      bundles: (input.bundles ?? []).map((b) => ({
        id: b.id,
        name: b.name,
        label: b.label ?? null,
        regularPriceMinor: toMinor(b.regularPrice),
        priceMinor: toMinor(b.price),
        deliveryPriceMinor: toMinor(b.deliveryPrice),
        quantity: b.quantity,
        badgeColor: b.badgeColor,
        imageUrl: b.imageUrl ?? null,
        isDefault: b.isDefault,
      })),
      options: (input.options ?? []).map((o) => ({
        label: o.label,
        type: o.type,
        values: parseOptionValues(o.values),
      })),
      costMinor: toMinor(input.cost ?? 0),
      deliveryPriceMinor: toMinor(input.deliveryPrice ?? 0),
      deliveryCostMinor: toMinor(input.deliveryCost ?? 0),
      supplierId: input.supplierId ?? null,
    });
    return toProductContract(doc);
  }

  async update(id: string, input: UpdateProductDto): Promise<ProductContract> {
    const doc = await this.findDoc(id);
    if (input.name !== undefined) doc.name = input.name;
    if (input.slug !== undefined) {
      const slug = slugify(input.slug);
      if (slug !== doc.slug) await this.assertSlugFree(slug, id);
      doc.slug = slug;
    }
    if (input.description !== undefined) doc.description = input.description;
    if (input.shortDescription !== undefined) doc.shortDescription = input.shortDescription;
    if (input.regularPrice !== undefined) doc.regularPriceMinor = toMinor(input.regularPrice);
    if (input.salePrice !== undefined) {
      doc.salePriceMinor = input.salePrice != null ? toMinor(input.salePrice) : null;
    }
    if (input.sku !== undefined) doc.sku = input.sku;
    if (input.manageStock !== undefined) doc.manageStock = input.manageStock;
    if (input.stockQuantity !== undefined) doc.stockQuantity = input.stockQuantity;
    if (input.status !== undefined) doc.status = input.status;
    if (input.categoryIds !== undefined) {
      doc.categoryIds = input.categoryIds;
      doc.categorySlugs = await this.resolveCategorySlugs(input.categoryIds);
    }
    if (input.imageIds !== undefined) {
      doc.images = await this.resolveImages(input.imageIds);
    }
    if (input.upsellIds !== undefined) doc.upsellIds = input.upsellIds;
    if (input.bundles !== undefined) {
      doc.bundles = input.bundles.map((b) => ({
        id: b.id,
        name: b.name,
        label: b.label ?? null,
        regularPriceMinor: toMinor(b.regularPrice),
        priceMinor: toMinor(b.price),
        deliveryPriceMinor: toMinor(b.deliveryPrice),
        quantity: b.quantity,
        badgeColor: b.badgeColor,
        imageUrl: b.imageUrl ?? null,
        isDefault: b.isDefault,
      }));
    }
    if (input.options !== undefined) {
      doc.options = input.options.map((o) => ({
        label: o.label,
        type: o.type,
        values: parseOptionValues(o.values),
      }));
    }
    if (input.cost !== undefined) doc.costMinor = toMinor(input.cost);
    if (input.deliveryPrice !== undefined) doc.deliveryPriceMinor = toMinor(input.deliveryPrice);
    if (input.deliveryCost !== undefined) doc.deliveryCostMinor = toMinor(input.deliveryCost);
    if (input.supplierId !== undefined) doc.supplierId = input.supplierId;
    await doc.save();
    return toProductContract(doc);
  }

  /**
   * Soft-delete only (a product's order history must remain intact).
   * There is no separate "hard delete" path — orders always hold their own
   * item snapshots, so nothing downstream depends on the product surviving.
   */
  async remove(id: string): Promise<void> {
    const doc = await this.findDoc(id);
    doc.deletedAt = new Date();
    doc.status = 'draft';
    await doc.save();
  }

  async reorder(items: { id: string; menuOrder: number }[]): Promise<void> {
    await this.model.bulkWrite(
      items.map((i) => ({
        updateOne: { filter: { _id: i.id }, update: { $set: { menuOrder: i.menuOrder } } },
      })),
    );
  }

  async picker(): Promise<{ id: string; name: string; price: number; image: string | null }[]> {
    const docs = await this.model
      .find({ deletedAt: null })
      .select({ name: 1, regularPriceMinor: 1, salePriceMinor: 1, images: 1 })
      .sort({ name: 1 });
    return docs.map((d) => {
      const price = d.salePriceMinor ?? d.regularPriceMinor;
      return {
        id: d.id,
        name: d.name,
        price: price / 1000,
        image: d.images[0]?.url ?? null,
      };
    });
  }

  /**
   * The product-detail read path (getBySlug/getById) always resolves
   * availability live from stock_items rather than trusting the product's
   * denormalized `stockQuantity` — see docs/pos-platform/
   * stock-business-rules.md §"Sold-out propagation to the storefront".
   * The listing path deliberately keeps using the cached field (cheap,
   * batched, kept fresh by the revalidation mechanism instead).
   */
  private async withLiveAvailability(contract: ProductContract, doc: ProductDocument): Promise<ProductContract> {
    if (!doc.manageStock) return contract;
    const variant = await this.variants.findByProductId(doc.id);
    if (!variant) return contract;
    const available = await this.availability.resolve(variant.id);
    return { ...contract, stockQuantity: available, inStock: available > 0 };
  }

  private async findDoc(id: string): Promise<ProductDocument> {
    const doc = await this.model.findOne({ _id: id, deletedAt: null }).catch(() => null);
    if (!doc) throw new NotFoundException('Produit introuvable');
    return doc;
  }

  private async assertSlugFree(slug: string, excludeId?: string): Promise<void> {
    const clash = await this.model.findOne(excludeId ? { slug, _id: { $ne: excludeId } } : { slug });
    if (clash) throw new ConflictException('Un produit avec ce slug existe déjà');
  }

  private async resolveCategorySlugs(categoryIds: string[]): Promise<string[]> {
    if (categoryIds.length === 0) return [];
    const docs = await this.categoryModel.find({ _id: { $in: categoryIds } }).select({ slug: 1 });
    return docs.map((d) => d.slug);
  }
}
