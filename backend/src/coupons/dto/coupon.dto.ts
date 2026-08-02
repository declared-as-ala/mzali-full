import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

class AppliesToDto {
  @IsIn(['all', 'categories', 'products']) kind!: 'all' | 'categories' | 'products';
  @IsArray() @IsString({ each: true }) ids!: string[];
}

export class CreateCouponDto {
  @IsString() code!: string;
  @IsIn(['percent', 'fixed']) type!: 'percent' | 'fixed';
  @IsNumber() value!: number;
  @IsOptional() @IsNumber() minSubtotal?: number | null;
  @IsOptional() @IsISO8601() startsAt?: string | null;
  @IsOptional() @IsISO8601() endsAt?: string | null;
  @IsOptional() @IsNumber() usageLimit?: number | null;
  @IsOptional() @IsNumber() perPhoneLimit?: number | null;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @ValidateNested() @Type(() => AppliesToDto) appliesTo?: AppliesToDto;
}

export class UpdateCouponDto {
  @IsOptional() @IsString() code?: string;
  @IsOptional() @IsIn(['percent', 'fixed']) type?: 'percent' | 'fixed';
  @IsOptional() @IsNumber() value?: number;
  @IsOptional() @IsNumber() minSubtotal?: number | null;
  @IsOptional() @IsISO8601() startsAt?: string | null;
  @IsOptional() @IsISO8601() endsAt?: string | null;
  @IsOptional() @IsNumber() usageLimit?: number | null;
  @IsOptional() @IsNumber() perPhoneLimit?: number | null;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @ValidateNested() @Type(() => AppliesToDto) appliesTo?: AppliesToDto;
}

export class ValidateCouponDto {
  @IsString() code!: string;
  @IsNumber() subtotal!: number; // dinars — the client cart's eligible subtotal preview
  @IsOptional() @IsString() phone?: string;
}
