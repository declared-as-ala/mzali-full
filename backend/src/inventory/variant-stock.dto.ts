import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, MaxLength, Min, ValidateNested } from 'class-validator';

export class MatrixRowDto {
  @IsString() @MaxLength(80) size!: string;
  @IsString() @MaxLength(80) color!: string;
  @IsString() @MaxLength(160) sku!: string;
  @IsBoolean() active!: boolean;
  @IsInt() @Min(0) depot!: number;
  @IsInt() @Min(0) boutique!: number;
  @IsOptional() @IsInt() @Min(0) sellingPriceMinor?: number | null;
  @IsOptional() @IsInt() @Min(0) lowStockThreshold?: number | null;
}
export class ActivateMatrixDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(500) @ValidateNested({ each: true }) @Type(() => MatrixRowDto) rows!: MatrixRowDto[];
  @IsString() @MaxLength(500) reason!: string;
  @IsOptional() @IsBoolean() dryRun?: boolean;
  @IsOptional() @IsBoolean() initialStock?: boolean;
  @IsOptional() @IsBoolean() replaceDepotStock?: boolean;
}
export class VariantAdjustmentDto {
  @IsString() variantId!: string;
  @IsIn(['DEPOT', 'BOUTIQUE']) locationId!: string;
  @IsInt() qty!: number;
  @IsString() @MaxLength(500) reason!: string;
}
