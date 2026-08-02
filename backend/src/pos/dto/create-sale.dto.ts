import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsIn, IsInt, IsOptional, IsPositive, IsString, Min, ValidateNested } from 'class-validator';

export class SaleLineDto {
  @IsString() variantId!: string;
  @IsInt() @IsPositive() qty!: number;
  @IsOptional() @IsInt() @Min(0) discountMinor?: number;
}

export class SalePaymentDto {
  @IsIn(['CASH', 'CARD', 'BANK_TRANSFER', 'OTHER']) method!: 'CASH' | 'CARD' | 'BANK_TRANSFER' | 'OTHER';
  @IsInt() @IsPositive() amountMinor!: number;
}

export class ManagerApprovalDto {
  @IsString() employeeId!: string;
  @IsString() password!: string;
}

export class CreateSaleDto {
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => SaleLineDto)
  lines!: SaleLineDto[];

  @IsOptional() @IsString() customerId?: string | null;
  @IsOptional() @IsInt() @Min(0) discountMinor?: number;

  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => SalePaymentDto)
  payments!: SalePaymentDto[];

  @IsOptional() @IsInt() @Min(0) cashTenderedMinor?: number | null;

  @IsOptional() @IsInt() @Min(1) redeemPoints?: number;

  @IsOptional() @ValidateNested() @Type(() => ManagerApprovalDto) managerApproval?: ManagerApprovalDto;
}
