import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsNumber, IsOptional, IsString, Min, ValidateNested } from 'class-validator';

class NumberFormatsDto {
  @IsOptional() @IsString() quote?: string;
  @IsOptional() @IsString() invoiceSales?: string;
  @IsOptional() @IsString() invoicePos?: string;
  @IsOptional() @IsString() invoiceOnline?: string;
  @IsOptional() @IsString() invoiceProforma?: string;
  @IsOptional() @IsString() creditNote?: string;
}

export class UpdateInvoicingSettingsDto {
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional() @IsNumber() @Min(0) tvaRatePercent?: number;
  @IsOptional() @IsInt() @Min(0) timbreFiscalMinor?: number;
  @IsOptional() @ValidateNested() @Type(() => NumberFormatsDto) numberFormats?: NumberFormatsDto;
}

export class UpdateCompanySettingsDto {
  @IsOptional() @IsString() legalName?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() matriculeFiscal?: string;
  @IsOptional() @IsString() rcNumber?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() logoMediaId?: string;
}
