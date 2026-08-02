import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

class BundleDto {
  @IsString() id!: string;
  @IsString() name!: string;
  @IsOptional() @IsString() label?: string;
  @IsNumber() regularPrice!: number;
  @IsNumber() price!: number;
  @IsNumber() deliveryPrice!: number;
  @IsInt() quantity!: number;
  @IsIn(['red', 'green', 'blue', 'purple']) badgeColor!: 'red' | 'green' | 'blue' | 'purple';
  @IsOptional() @IsString() imageUrl?: string;
  @IsBoolean() isDefault!: boolean;
}

class OptionDto {
  @IsString() label!: string;
  @IsIn(['text', 'select', 'radio']) type!: 'text' | 'select' | 'radio';
  /** Comma-separated, matching the existing ProductInput contract. */
  @IsString() values!: string;
}

export class CreateProductDto {
  @IsString() name!: string;
  @IsOptional() @IsString() slug?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() shortDescription?: string;
  @IsOptional() @IsNumber() regularPrice?: number;
  @IsOptional() @IsNumber() salePrice?: number | null;
  @IsOptional() @IsString() sku?: string;
  @IsOptional() @IsBoolean() manageStock?: boolean;
  @IsOptional() @IsNumber() stockQuantity?: number | null;
  @IsOptional() @IsIn(['published', 'draft', 'private']) status?: 'published' | 'draft' | 'private';
  @IsOptional() @IsArray() @IsString({ each: true }) categoryIds?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) imageIds?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) upsellIds?: string[];
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => BundleDto) bundles?: BundleDto[];
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => OptionDto) options?: OptionDto[];
  @IsOptional() @IsNumber() cost?: number;
  @IsOptional() @IsNumber() deliveryPrice?: number;
  @IsOptional() @IsNumber() deliveryCost?: number;
  @IsOptional() @IsString() supplierId?: string | null;
}

/** Every field optional — this is a PATCH-style partial update. */
export class UpdateProductDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() slug?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() shortDescription?: string;
  @IsOptional() @IsNumber() regularPrice?: number;
  @IsOptional() @IsNumber() salePrice?: number | null;
  @IsOptional() @IsString() sku?: string;
  @IsOptional() @IsBoolean() manageStock?: boolean;
  @IsOptional() @IsNumber() stockQuantity?: number | null;
  @IsOptional() @IsIn(['published', 'draft', 'private']) status?: 'published' | 'draft' | 'private';
  @IsOptional() @IsArray() @IsString({ each: true }) categoryIds?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) imageIds?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) upsellIds?: string[];
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => BundleDto) bundles?: BundleDto[];
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => OptionDto) options?: OptionDto[];
  @IsOptional() @IsNumber() cost?: number;
  @IsOptional() @IsNumber() deliveryPrice?: number;
  @IsOptional() @IsNumber() deliveryCost?: number;
  @IsOptional() @IsString() supplierId?: string | null;
}

class ReorderItemDto {
  @IsString() id!: string;
  @IsInt() @Min(0) menuOrder!: number;
}

export class ReorderProductsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReorderItemDto)
  items!: ReorderItemDto[];
}
