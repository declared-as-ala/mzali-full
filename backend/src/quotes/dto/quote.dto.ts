import { Type } from 'class-transformer';
import {
  ArrayMinSize, IsArray, IsDateString, IsInt, IsNumber, IsOptional, IsPositive, IsString, Min, ValidateNested,
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

export class QuoteLineInputDto {
  @IsOptional() @IsString() productId?: string;
  /** Required when productId is omitted — a free-text line. */
  @IsOptional() @IsString() description?: string;
  @IsInt() @IsPositive() quantity!: number;
  /** Required when productId is omitted; otherwise defaults to the catalog price. */
  @IsOptional() @IsNumber() @Min(0) unitPrice?: number;
  @IsOptional() @IsNumber() @Min(0) discount?: number;
}

export class CreateQuoteDto {
  @IsOptional() @IsString() customerId?: string;
  @ValidateNested() @Type(() => CustomerSnapshotInputDto) customerSnapshot!: CustomerSnapshotInputDto;
  @IsOptional() @ValidateNested() @Type(() => AddressDto) billingAddress?: AddressDto;
  @IsOptional() @ValidateNested() @Type(() => AddressDto) shippingAddress?: AddressDto;
  @IsOptional() @IsDateString() expiryDate?: string;
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => QuoteLineInputDto)
  lines!: QuoteLineInputDto[];
  @IsOptional() @IsNumber() @Min(0) shipping?: number;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() terms?: string;
}

/** Same shape — applied as a new version rather than mutating in place once the quote has left DRAFT. */
export class ReviseQuoteDto extends CreateQuoteDto {}
