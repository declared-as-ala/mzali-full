import { IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class AdjustStockDto {
  @IsString() @IsNotEmpty() productId!: string;
  @IsInt() qty!: number;
  @IsString() @IsNotEmpty() reason!: string;
  @IsOptional() @IsString() locationId?: string;
}
