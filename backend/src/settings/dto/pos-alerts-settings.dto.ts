import { IsBoolean, IsInt, IsOptional, Min } from 'class-validator';

export class UpdatePosAlertSettingsDto {
  @IsOptional() @IsInt() @Min(0) largeCashDifferenceMinor?: number;
  @IsOptional() @IsInt() @Min(0) excessiveDiscountPercent?: number;
  @IsOptional() @IsInt() @Min(1) repeatedDiscountCountThreshold?: number;
  @IsOptional() @IsInt() @Min(1) repeatedDiscountWindowHours?: number;
  @IsOptional() @IsInt() @Min(1) longOpenSessionHours?: number;
  @IsOptional() @IsBoolean() belowCostAlertEnabled?: boolean;
}
