import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsInt, IsOptional, IsString, Min, MinLength, ValidateNested } from 'class-validator';
import { SaleLineDto, SalePaymentDto } from './create-sale.dto';

export class UpdateSaleDto {
  @IsOptional() @IsString() customerId?: string | null;

  @IsOptional() @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => SaleLineDto)
  lines?: SaleLineDto[];

  @IsOptional() @IsInt() @Min(0) discountMinor?: number;

  @IsOptional() @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => SalePaymentDto)
  payments?: SalePaymentDto[];

  @IsOptional() @IsString() notes?: string | null;

  /** Required — every edit to a completed sale is a sensitive change and
   *  must be explained for the audit log (mirrors orders.update()'s
   *  reason requirement for confirmed/completed orders). */
  @IsString() @MinLength(3) reason!: string;
}
