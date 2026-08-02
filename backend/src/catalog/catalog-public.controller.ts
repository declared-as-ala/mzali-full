import { Controller, Get, NotFoundException, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ServiceTokenGuard } from '@/auth/guards/service-token.guard';
import { CategoriesService } from './categories.service';
import { ProductListQueryDto } from './dto/product-query.dto';
import { ProductsService } from './products.service';

/**
 * Storefront-facing catalog reads. Only the Next BFF calls these
 * (X-Service-Token) — browsers never hit this API directly.
 */
@ApiTags('catalog')
@Controller('catalog')
@UseGuards(ServiceTokenGuard)
export class CatalogPublicController {
  constructor(
    private readonly products: ProductsService,
    private readonly categories: CategoriesService,
  ) {}

  @Get('products')
  listProducts(@Query() query: ProductListQueryDto) {
    return this.products.list(query, true);
  }

  @Get('products/slug/:slug')
  async productBySlug(@Param('slug') slug: string) {
    const product = await this.products.getBySlug(slug, true);
    if (!product) throw new NotFoundException('Produit introuvable');
    return product;
  }

  @Get('products/:id/related')
  relatedProducts(@Param('id') id: string, @Query('limit') limit?: string) {
    return this.products.getRelated(id, limit ? Number(limit) : undefined);
  }

  @Get('products/:id')
  async productById(@Param('id') id: string) {
    const product = await this.products.getById(id);
    if (!product) throw new NotFoundException('Produit introuvable');
    return product;
  }

  @Get('categories')
  listCategories(@Query() query: { hideEmpty?: string; parentId?: string; perPage?: string }) {
    return this.categories.list({
      hideEmpty: query.hideEmpty === 'true',
      parentId: query.parentId,
      perPage: query.perPage ? Number(query.perPage) : undefined,
    });
  }

  @Get('categories/tree')
  categoryTree() {
    return this.categories.tree();
  }

  @Get('categories/slug/:slug')
  async categoryBySlug(@Param('slug') slug: string) {
    const category = await this.categories.getBySlug(slug);
    if (!category) throw new NotFoundException('Catégorie introuvable');
    return category;
  }
}
