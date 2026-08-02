import { Type } from 'class-transformer';
import { IsIn, IsOptional, IsString, ValidateNested } from 'class-validator';

class AddressDto {
  @IsOptional() @IsString() line1?: string;
  @IsOptional() @IsString() line2?: string;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsString() governorate?: string;
  @IsOptional() @IsString() postalCode?: string;
  @IsOptional() @IsString() country?: string;
}

export class CreateSupplierDto {
  @IsString() companyName!: string;
  @IsOptional() @IsString() contactName?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() whatsapp?: string;
  @IsOptional() @ValidateNested() @Type(() => AddressDto) billingAddress?: AddressDto;
  @IsOptional() @IsString() notes?: string;
}

export class UpdateSupplierDto extends CreateSupplierDto {
  @IsOptional() @IsIn(['ACTIVE', 'INACTIVE', 'BLOCKED']) status?: 'ACTIVE' | 'INACTIVE' | 'BLOCKED';
}
