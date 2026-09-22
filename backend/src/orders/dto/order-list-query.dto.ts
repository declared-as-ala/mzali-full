import { IsOptional, IsString } from 'class-validator';

export class OrderListQueryDto {
  @IsOptional() page?: number;
  @IsOptional() perPage?: number;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsString() after?: string;
  @IsOptional() @IsString() before?: string;
  @IsOptional() @IsString() sortOrder?: 'asc' | 'desc';
  /** Filter orders that contain this product ID in their line items.
   *  Matched against items[].productId — a stable ID reference that survives
   *  product renames and snapshot drift. */
  @IsOptional() @IsString() productId?: string;
  /**
   * Optional variant refinement of `productId`. One of:
   *  - a real Variant `_id` — matches `items.variantId` equal to it, OR a
   *    legacy item (no variantId) whose normalized size/color snapshot
   *    matches that variant's own attributes (see order-variation-key.ts).
   *  - `none` — matches only items with no resolvable variant identity at
   *    all (non-matrix products, or unparseable legacy snapshots).
   *  - `legacy:<size>|<color>` — matches legacy items by normalized
   *    size/color directly, for snapshots that don't uniquely map to any
   *    CURRENT variant (ambiguous or since-removed).
   * Requires `productId` to also be set; ignored otherwise.
   */
  @IsOptional() @IsString() variantId?: string;
  @IsOptional() @IsString() tab?: string;
}
