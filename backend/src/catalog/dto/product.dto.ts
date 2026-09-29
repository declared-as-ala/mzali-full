import { Type } from 'class-transformer';
import {
  IsArray,
  ArrayMaxSize,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  Validate,
  ValidateNested,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

/** Option values arrive either as an array (exact, preferred) or as the legacy
 *  comma-joined string. An array is what lets a value contain a comma. */
@ValidatorConstraint({ name: 'stringOrStringArray', async: false })
class StringOrStringArray implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return typeof value === 'string' || (Array.isArray(value) && value.every((v) => typeof v === 'string'));
  }
  defaultMessage(): string { return 'values must be a string or an array of strings'; }
}

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
  /** Array of exact values (preferred) or the legacy comma-separated string. */
  @Validate(StringOrStringArray) values!: string | string[];
}

export class ProductMediaDto {
  @IsString() mediaId!: string;
  @IsInt() @Min(0) position!: number;
  @IsBoolean() isPrimary!: boolean;
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
  @IsOptional() @IsArray() @ArrayMaxSize(10) @ValidateNested({ each: true }) @Type(() => ProductMediaDto) media?: ProductMediaDto[];
  @IsOptional() @IsArray() @IsString({ each: true }) upsellIds?: string[];
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => BundleDto) bundles?: BundleDto[];
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => OptionDto) options?: OptionDto[];
  @IsOptional() @IsNumber() cost?: number;
  @IsOptional() @IsNumber() deliveryPrice?: number;
  @IsOptional() @IsNumber() deliveryCost?: number;
  @IsOptional() @IsString() supplierId?: string | null;
  @IsOptional() @IsBoolean() posOnly?: boolean;
  @IsOptional() @IsNumber() purchasePrice?: number;
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
  @IsOptional() @IsArray() @ArrayMaxSize(10) @ValidateNested({ each: true }) @Type(() => ProductMediaDto) media?: ProductMediaDto[];
  @IsOptional() @IsArray() @IsString({ each: true }) upsellIds?: string[];
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => BundleDto) bundles?: BundleDto[];
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => OptionDto) options?: OptionDto[];
  @IsOptional() @IsNumber() cost?: number;
  @IsOptional() @IsNumber() deliveryPrice?: number;
  @IsOptional() @IsNumber() deliveryCost?: number;
  @IsOptional() @IsString() supplierId?: string | null;
  @IsOptional() @IsBoolean() posOnly?: boolean;
  /** Purchase price (TND), stored on the product's variants. Send only when changed. */
  @IsOptional() @IsNumber() purchasePrice?: number;
  /** Revision the editor loaded; the update is refused with 409 if it has moved. */
  @IsOptional() @IsInt() @Min(0) expectedRevision?: number;
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
