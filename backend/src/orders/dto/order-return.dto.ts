import { IsArray, IsBoolean, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class ReturnItemLineDto {
  @IsString() productId!: string;
  @IsOptional() @IsString() variantId?: string | null;
  @IsString() name!: string;
  @Type(() => Number) qty!: number;
}

export class ProcessOrderReturnDto {
  @IsOptional() @IsString() trackingNumber?: string;
  @IsOptional() @IsString() carrier?: string;
  @IsOptional() @IsString() reason?: string;
  @IsOptional() @IsString() note?: string;
  @IsOptional() @IsBoolean() overrideStockCheck?: boolean;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => ReturnItemLineDto) items?: ReturnItemLineDto[];
}
