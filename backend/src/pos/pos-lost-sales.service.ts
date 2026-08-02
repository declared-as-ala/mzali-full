import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Product } from '@/catalog/product.schema';
import { Variant } from '@/catalog/variant.schema';
import { PosLostSale } from './pos-lost-sale.schema';

@Injectable()
export class PosLostSalesService {
  constructor(
    @InjectModel(PosLostSale.name) private readonly lostSales: Model<PosLostSale>,
    @InjectModel(Variant.name) private readonly variants: Model<Variant>,
    @InjectModel(Product.name) private readonly products: Model<Product>,
  ) {}

  /** Logs a single "cashier tapped a sold-out product" attempt. Resolves
   *  product/price server-side — never trusts a client-sent name/price. */
  async logAttempt(variantId: string, locationId: string, terminalId: string | null, cashierId: string): Promise<void> {
    const variant = await this.variants.findById(variantId);
    if (!variant) throw new NotFoundException('Variante introuvable');
    const product = await this.products.findById(variant.productId);
    if (!product) throw new NotFoundException('Produit introuvable');

    await this.lostSales.create({
      variantId: variant.id,
      productId: product.id,
      productName: product.name,
      locationId,
      terminalId,
      cashierId,
      priceMinorAtAttempt: variant.sellingPriceMinor ?? product.salePriceMinor ?? product.regularPriceMinor ?? 0,
    });
  }
}
