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
}
