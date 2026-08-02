import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, Min, ValidateNested } from 'class-validator';

class BonusCategoryDto {
  @IsString() categoryId!: string;
  @IsNumber() multiplier!: number;
}

class BonusProductDto {
  @IsString() productId!: string;
  @IsNumber() multiplier!: number;
}

export class UpdateLoyaltySettingsDto {
  @IsOptional() @IsNumber() @Min(0) pointsPerDinarSpent?: number;
  @IsOptional() @IsInt() @Min(0) minimumPurchaseMinor?: number;

  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => BonusCategoryDto)
  bonusCategories?: BonusCategoryDto[];

  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => BonusProductDto)
  bonusProducts?: BonusProductDto[];

  @IsOptional() @IsInt() @Min(0) birthdayBonusPoints?: number;
  @IsOptional() @IsInt() @Min(0) newCustomerBonusPoints?: number;
  @IsOptional() @IsIn(['en-attente', 'confirme', 'completed', 'delivered']) earnOnOrderStatus?: string;
  @IsOptional() @IsBoolean() excludeShippingFromEarning?: boolean;

  @IsOptional() @IsArray() @IsString({ each: true })
  excludedProductIds?: string[];

  @IsOptional() @IsInt() @Min(1) pointValueMinor?: number;
  @IsOptional() @IsInt() @Min(0) maxRedemptionPercentOfSale?: number;
  @IsOptional() @IsInt() @Min(0) minimumPointsToRedeem?: number;
  @IsOptional() @IsInt() @Min(0) managerApprovalAboveMinor?: number;
  @IsOptional() @IsBoolean() allowMultipleCardsPerCustomer?: boolean;
}
