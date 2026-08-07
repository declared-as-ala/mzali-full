import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, isValidObjectId, Model } from 'mongoose';
import type { Product as ProductContract, ProductListQuery, ProductListResult } from '@contracts';
import { clampPagination, paginate } from '@/common/pagination';
import { normalizePublicMediaUrl } from '@/common/public-media-url';
import { slugify } from '@/common/slug';
import { toMinor } from '@/common/money';
import { OnlineAvailabilityService } from '@/inventory/online-availability.service';
import { MediaService } from '@/media/media.service';
import { Category } from './category.schema';
import { CreateProductDto, ProductMediaDto, UpdateProductDto } from './dto/product.dto';
import { parseOptionValues, toProductContract } from './product.mapper';
import { buildProductFilter, buildProductSort } from './product-query';
import { ProductVariantsService } from './product-variants.service';
import { Product, ProductDocument } from './product.schema';
import { normalizeProductMedia, primaryProductImage } from './product-media';

@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);
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
  private async resolveImages(
    mediaItems: ProductMediaDto[],
    allowedLegacy: { mediaId: string | null; url: string; alt: string }[] = [],
  ): Promise<{ mediaId: string | null; url: string; alt: string; position: number; isPrimary: boolean }[]> {
    let ordered: ProductMediaDto[];
    try { ordered = normalizeProductMedia(mediaItems); }
    catch (error) { throw new BadRequestException(error instanceof Error ? error.message : 'Médias invalides'); }
    const ids = ordered.map((item) => item.mediaId);
    const persistentIds = ids.filter((id) => isValidObjectId(id));
    const urlById = await this.media.assertAndGetUrls(persistentIds);
    return ordered.map((item) => {
      const url = urlById.get(item.mediaId);
      if (url) return { mediaId: item.mediaId, url, alt: '', position: item.position, isPrimary: item.isPrimary };
      const legacy = allowedLegacy.find((image) => !image.mediaId && image.url === item.mediaId);
      if (!legacy) throw new BadRequestException(`Média introuvable ou non autorisé : ${item.mediaId}`);
      return { mediaId: null, url: legacy.url, alt: legacy.alt, position: item.position, isPrimary: item.isPrimary };
    });
  }

  private mediaInput(input: CreateProductDto | UpdateProductDto): ProductMediaDto[] | undefined {
    if (input.media !== undefined) return input.media;
    if (input.imageIds === undefined) return undefined;
    const ids = [...new Set(input.imageIds)];
    return ids.map((mediaId, position) => ({ mediaId, position, isPrimary: position === 0 }));
  }

  private async finalizeMedia(previousIds: string[], nextIds: string[]): Promise<void> {
    const detached = previousIds.filter((id) => !nextIds.includes(id));
    try {
      await this.media.markAttached(nextIds);
      if (detached.length) {
        await this.media.markDetached(detached);
        for (const mediaId of detached) {
          const [productReferences, categoryReferences] = await Promise.all([
            this.model.countDocuments({ 'images.mediaId': mediaId, deletedAt: null }),
            this.categoryModel.countDocuments({ mediaId }),
          ]);
          if (productReferences === 0 && categoryReferences === 0) await this.media.deleteOrphaned(mediaId);
        }
      }
      this.logger.log({ event: 'product.media.updated', attached: nextIds, detached });
    } catch (error) {
      // The product write has already succeeded. Cleanup bookkeeping is
      // recoverable and must not make the client retry the product mutation.
      this.logger.error({ event: 'product.media.finalize_failed', attached: nextIds, detached, error: error instanceof Error ? error.message : String(error) });
    }
  }

  async list(query: ProductListQuery, forcePublished: boolean, excludePosOnly = false): Promise<ProductListResult> {
    const { page, perPage, skip } = clampPagination(query.page, query.perPage, 100);
    const filter = buildProductFilter(query, forcePublished, excludePosOnly);
    const sort = buildProductSort(query);
    const [docs, total] = await Promise.all([
      this.model.find(filter).sort(sort).skip(skip).limit(perPage),
      this.model.countDocuments(filter),
    ]);
    const result = paginate(docs.map((d) => toProductContract(d)), total, page, perPage);
    return result;
  }

  async getBySlug(slug: string, forcePublished: boolean, excludePosOnly = false): Promise<ProductContract | null> {
    const filter: FilterQuery<Product> = forcePublished ? { slug, status: 'published', deletedAt: null } : { slug, deletedAt: null };
    if (excludePosOnly) filter.posOnly = { $ne: true };
    const doc = await this.model.findOne(filter);
    return doc ? this.withLiveAvailability(toProductContract(doc), doc) : null;
  }

  async getById(id: string, excludePosOnly = false): Promise<ProductContract | null> {
    const filter: FilterQuery<Product> = { _id: id, deletedAt: null };
    if (excludePosOnly) filter.posOnly = { $ne: true };
    const doc = await this.model.findOne(filter).catch(() => null);
    return doc ? this.withLiveAvailability(toProductContract(doc), doc) : null;
  }

  async getRelated(productId: string, limit = 4, excludePosOnly = false): Promise<ProductContract[]> {
    const source = await this.model.findById(productId).catch(() => null);
    if (!source) return [];
    const posOnlyFilter: FilterQuery<Product> = excludePosOnly ? { posOnly: { $ne: true } } : {};
    const ids = source.upsellIds.length > 0 || source.crossSellIds.length > 0
      ? [...source.upsellIds, ...source.crossSellIds]
      : [];
    let docs: ProductDocument[];
    if (ids.length > 0) {
      docs = await this.model.find({ _id: { $in: ids }, status: 'published', deletedAt: null, ...posOnlyFilter }).limit(limit);
    } else {
      docs = await this.model
        .find({
          _id: { $ne: source._id },
          categoryIds: { $in: source.categoryIds },
          status: 'published',
          deletedAt: null,
          ...posOnlyFilter,
        })
        .limit(limit);
    }
    return docs.map((d) => toProductContract(d));
  }

  async create(input: CreateProductDto): Promise<ProductContract> {
    const slug = input.slug ? slugify(input.slug) : slugify(input.name);
    await this.assertSlugFree(slug);
    const mediaInput = this.mediaInput(input) ?? [];
    const images = await this.resolveImages(mediaInput);
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
      posOnly: input.posOnly ?? false,
    });
    await this.finalizeMedia([], images.map((image) => image.mediaId).filter((id): id is string => Boolean(id)));
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
    const previousMediaIds = doc.images.map((image) => image.mediaId).filter((mediaId): mediaId is string => Boolean(mediaId));
    const nextMediaInput = this.mediaInput(input);
    if (nextMediaInput !== undefined) {
      doc.images = await this.resolveImages(nextMediaInput, doc.images);
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
    if (input.posOnly !== undefined) doc.posOnly = input.posOnly;
    await doc.save();
    if (nextMediaInput !== undefined) {
      await this.finalizeMedia(previousMediaIds, doc.images.map((image) => image.mediaId).filter((mediaId): mediaId is string => Boolean(mediaId)));
    }
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
        image: normalizePublicMediaUrl(primaryProductImage(d.images)?.url ?? null),
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
