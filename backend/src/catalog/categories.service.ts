import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { Category as CategoryContract, CategoryListQuery } from '@contracts';
import { slugify } from '@/common/slug';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';
import { buildCategoryTree, CategoryTreeNode, toCategoryContract } from './category.mapper';
import { Category, CategoryDocument } from './category.schema';

@Injectable()
export class CategoriesService {
  constructor(@InjectModel(Category.name) private readonly model: Model<Category>) {}

  async list(query: CategoryListQuery = {}): Promise<CategoryContract[]> {
    const filter: Record<string, unknown> = {};
    if (query.hideEmpty) filter.productCount = { $gt: 0 };
    if (query.parentId !== undefined) filter.parentId = query.parentId;
    const q = this.model.find(filter).sort({ menuOrder: 1, name: 1 });
    if (query.perPage) q.limit(query.perPage);
    const docs = await q;
    return docs.map((d) => toCategoryContract(d));
  }

  async getBySlug(slug: string): Promise<CategoryContract | null> {
    const doc = await this.model.findOne({ slug });
    return doc ? toCategoryContract(doc) : null;
  }

  async tree(): Promise<CategoryTreeNode[]> {
    const all = await this.list();
    return buildCategoryTree(all);
  }

  async create(input: CreateCategoryDto): Promise<CategoryContract> {
    const slug = input.slug ? slugify(input.slug) : slugify(input.name);
    await this.assertSlugFree(slug);
    if (input.parentId) await this.assertParentExists(input.parentId);
    const doc = await this.model.create({
      name: input.name,
      slug,
      parentId: input.parentId ?? null,
      description: input.description ?? '',
    });
    return toCategoryContract(doc);
  }

  async update(id: string, input: UpdateCategoryDto): Promise<CategoryContract> {
    const doc = await this.findDoc(id);
    if (input.name !== undefined) doc.name = input.name;
    if (input.slug !== undefined) {
      const slug = slugify(input.slug);
      if (slug !== doc.slug) await this.assertSlugFree(slug, id);
      doc.slug = slug;
    }
    if (input.description !== undefined) doc.description = input.description;
    if (input.parentId !== undefined) {
      if (input.parentId === id) throw new BadRequestException('Une catégorie ne peut pas être son propre parent');
      if (input.parentId) {
        await this.assertParentExists(input.parentId);
        await this.assertNoCycle(id, input.parentId);
      }
      doc.parentId = input.parentId;
    }
    await doc.save();
    return toCategoryContract(doc);
  }

  async remove(id: string): Promise<void> {
    const doc = await this.findDoc(id);
    const hasChildren = await this.model.exists({ parentId: id });
    if (hasChildren) {
      throw new BadRequestException('Impossible de supprimer une catégorie qui a des sous-catégories');
    }
    await doc.deleteOne();
  }

  private async findDoc(id: string): Promise<CategoryDocument> {
    const doc = await this.model.findById(id).catch(() => null);
    if (!doc) throw new NotFoundException('Catégorie introuvable');
    return doc;
  }

  private async assertSlugFree(slug: string, excludeId?: string): Promise<void> {
    const clash = await this.model.findOne(excludeId ? { slug, _id: { $ne: excludeId } } : { slug });
    if (clash) throw new ConflictException('Une catégorie avec ce slug existe déjà');
  }

  private async assertParentExists(parentId: string): Promise<void> {
    const exists = await this.model.exists({ _id: parentId });
    if (!exists) throw new BadRequestException('Catégorie parente introuvable');
  }

  private async assertNoCycle(id: string, newParentId: string): Promise<void> {
    let current: string | null = newParentId;
    while (current) {
      if (current === id) throw new BadRequestException('Hiérarchie de catégories circulaire');
      const parent: CategoryDocument | null = await this.model.findById(current);
      current = parent?.parentId ?? null;
    }
  }
}
