import { IsBoolean, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class UpdateVariantDto {
  @IsOptional() @IsString() sku?: string;
  @IsOptional() @IsString() barcode?: string | null;
  @IsOptional() @IsInt() @Min(0) sellingPriceMinor?: number | null;
  @IsOptional() @IsInt() @Min(0) compareAtPriceMinor?: number | null;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsInt() @Min(0) purchasePriceMinor?: number | null;
}
