import { IsBoolean, IsIn, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateSupplierProductDto {
  @IsString() supplierId!: string;
  @IsString() name!: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsString() brand?: string;
  @IsOptional() @IsString() size?: string;
  @IsOptional() @IsString() color?: string;
  @IsNumber() @Min(0) purchasePrice!: number; // dinars, converted server-side
  @IsOptional() @IsNumber() @Min(0) suggestedSellingPrice?: number;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class UpdateSupplierProductDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsString() brand?: string;
  @IsOptional() @IsString() size?: string;
  @IsOptional() @IsString() color?: string;
  @IsOptional() @IsNumber() @Min(0) purchasePrice?: number;
  @IsOptional() @IsNumber() @Min(0) suggestedSellingPrice?: number | null;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class ListSupplierProductsQueryDto {
  @IsOptional() @IsString() supplierId?: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsString() brand?: string;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsIn(['active', 'inactive']) status?: 'active' | 'inactive';
}
