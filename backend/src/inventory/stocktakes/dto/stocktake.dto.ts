import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, Min, ValidateNested } from 'class-validator';

export class CreateStocktakeDto {
  @IsString() locationId!: string;
  @IsIn(['all', 'categories']) scopeKind!: 'all' | 'categories';
  @IsOptional() @IsArray() @IsString({ each: true }) categoryIds?: string[];
  @IsOptional() @IsBoolean() blindCount?: boolean;
}

class CountLineDto {
  @IsString() variantId!: string;
  @IsInt() @Min(0) countedQuantity!: number;
  @IsOptional() @IsString() reasonIfLarge?: string;
}

export class SubmitCountDto {
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => CountLineDto)
  lines!: CountLineDto[];
}
