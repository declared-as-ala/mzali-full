import { IsBoolean, IsIn, IsInt, IsOptional, Min } from 'class-validator';

export class UpdateInventorySettingsDto {
  @IsOptional() @IsBoolean()
  enabled?: boolean;

  @IsOptional() @IsIn(['DEPOT_ONLY', 'BOUTIQUE_ONLY', 'COMBINED_LOCATIONS', 'PRIORITY_LOCATIONS'])
  stockPolicy?: 'DEPOT_ONLY' | 'BOUTIQUE_ONLY' | 'COMBINED_LOCATIONS' | 'PRIORITY_LOCATIONS';

  @IsOptional() @IsInt() @Min(0)
  stocktakeVarianceThreshold?: number;
}
