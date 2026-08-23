import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { ORDER_STATUS_VALUES } from '@/orders/order-status';

class CheckoutCustomerDto {
  @IsOptional() @IsString() firstName?: string;
  @IsOptional() @IsString() lastName?: string;
  @IsString() phone!: string;
  @IsOptional() @IsString() phone2?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() note?: string;
}

class CartItemDto {
  @IsString() lineId!: string;
  @IsString() productId!: string;
  @IsString() name!: string;
  @IsNumber() price!: number;
  @IsInt() @Min(1) qty!: number;
  @IsString() image!: string;
  @IsOptional() @IsObject() variation?: Record<string, string>;
  @IsOptional() @IsArray() bundleItems?: Record<string, string>[];
  @IsOptional() @IsString() bundleId?: string;
  @IsOptional() @IsString() bundleName?: string;
  @IsOptional() @IsInt() bundleSlot?: number;
  @IsOptional() @IsObject() meta?: Record<string, unknown>;
}

export class CheckoutDto {
  @ValidateNested() @Type(() => CheckoutCustomerDto) customer!: CheckoutCustomerDto;
  @IsArray() @ValidateNested({ each: true }) @Type(() => CartItemDto) items!: CartItemDto[];
  @IsNumber() shipping!: number;
  @IsOptional() @IsNumber() subtotal?: number;
  @IsOptional() @IsNumber() total?: number;
  @IsOptional() @IsString() deliveryCompany?: string;
  @IsOptional() @IsIn(['cod', 'card']) paymentMethod?: 'cod' | 'card';
  @IsOptional() @IsString() source?: string;
  @IsOptional() @IsIn(ORDER_STATUS_VALUES) status?: string;
  @IsOptional() @IsInt() attempts?: number;
  @IsOptional() @IsString() couponCode?: string;
}
