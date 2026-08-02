import { Type } from 'class-transformer';
import { IsArray, IsIn, IsNumber, IsOptional, IsString, Min, ValidateNested } from 'class-validator';

class SupplierPurchaseOrderLineDto {
  @IsOptional() @IsString() supplierProductId?: string;
  @IsString() name!: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsString() brand?: string;
  @IsOptional() @IsString() size?: string;
  @IsOptional() @IsString() color?: string;
  @IsNumber() @Min(1) quantity!: number;
  @IsNumber() @Min(0) unitPrice!: number; // dinars, converted server-side
}

export class CreateSupplierPurchaseOrderDto {
  @IsString() supplierId!: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => SupplierPurchaseOrderLineDto) lines!: SupplierPurchaseOrderLineDto[];
  @IsOptional() @IsString() notes?: string;
}

export class UpdateSupplierPurchaseOrderStatusDto {
  @IsIn(['DRAFT', 'SENT', 'COMPLETED', 'CANCELLED']) status!: 'DRAFT' | 'SENT' | 'COMPLETED' | 'CANCELLED';
}
