import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsInt, IsOptional, IsString, MaxLength, Min, ValidateNested } from 'class-validator';

export class MatrixRowDto {
  @IsString() @MaxLength(80) size!: string;
  @IsString() @MaxLength(80) color!: string;
  @IsString() @MaxLength(160) sku!: string;
  @IsBoolean() active!: boolean;
  @IsInt() @Min(0) depot!: number;
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
  @IsInt() qty!: number;
  @IsString() @MaxLength(500) reason!: string;
}

/** One variant's change. Omit `quantity` to leave stock alone, omit `active` to leave availability alone. */
export class StockRowDto {
  @IsString() variantId!: string;
  @IsOptional() @IsInt() @Min(0) quantity?: number;
  /** What the editor saw; a mismatch means someone else changed it meanwhile (409). */
  @IsOptional() @IsInt() @Min(0) expectedQuantity?: number;
  @IsOptional() @IsBoolean() active?: boolean;
}
export class SaveStockDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(500) @ValidateNested({ each: true }) @Type(() => StockRowDto) rows!: StockRowDto[];
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}
