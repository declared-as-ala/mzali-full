import { Type } from 'class-transformer';
import {
  ArrayMinSize, IsArray, IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsPositive, IsString, Min, ValidateNested,
} from 'class-validator';

class AddressDto {
  @IsOptional() @IsString() line1?: string;
  @IsOptional() @IsString() line2?: string;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsString() governorate?: string;
  @IsOptional() @IsString() postalCode?: string;
  @IsOptional() @IsString() country?: string;
}

class CustomerSnapshotInputDto {
  @IsString() name!: string;
  @IsString() phone!: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() address?: string;
}

export class InvoiceLineInputDto {
  @IsOptional() @IsString() productId?: string;
  @IsOptional() @IsString() description?: string;
  @IsInt() @IsPositive() quantity!: number;
  @IsOptional() @IsNumber() @Min(0) unitPrice?: number;
  @IsOptional() @IsNumber() @Min(0) discount?: number;
}

export class CreateInvoiceDto {
  @IsIn(['SALES_INVOICE', 'POS_INVOICE', 'ONLINE_INVOICE', 'PROFORMA'])
  invoiceType!: 'SALES_INVOICE' | 'POS_INVOICE' | 'ONLINE_INVOICE' | 'PROFORMA';
  @ValidateNested() @Type(() => CustomerSnapshotInputDto) customerSnapshot!: CustomerSnapshotInputDto;
  @IsOptional() @ValidateNested() @Type(() => AddressDto) billingAddress?: AddressDto;
  @IsOptional() @IsDateString() dueDate?: string;
  @IsOptional() @IsString() saleId?: string;
  @IsOptional() @IsString() orderId?: string;
  @IsOptional() @IsString() quoteId?: string;
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => InvoiceLineInputDto)
  lines!: InvoiceLineInputDto[];
  @IsOptional() @IsNumber() @Min(0) shipping?: number;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() terms?: string;
}

export class UpdateInvoiceDto {
  @IsOptional() @IsString() notes?: string;
  /** Only settable while status === DRAFT — InvoicesService.update() throws otherwise. */
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => InvoiceLineInputDto) lines?: InvoiceLineInputDto[];
  @IsOptional() @IsNumber() @Min(0) shipping?: number;
}

export class RecordPaymentDto {
  @IsNumber() @Min(0.001) amount!: number; // dinars
  @IsString() method!: string;
}
