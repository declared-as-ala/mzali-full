import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';

const toBool = ({ value }: { value: unknown }) => value === 'true' || value === true;

export class ProductListQueryDto {
  @IsOptional() page?: number;
  @IsOptional() perPage?: number;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() categorySlug?: string;
  @IsOptional() @IsString() categoryId?: string;
  @IsOptional()
  @IsIn(['date', 'price', 'popularity', 'rating', 'title', 'menu_order'])
  orderBy?: 'date' | 'price' | 'popularity' | 'rating' | 'title' | 'menu_order';
  @IsOptional() @IsIn(['asc', 'desc']) order?: 'asc' | 'desc';
  @IsOptional() @Transform(toBool) @IsBoolean() onSale?: boolean;
  @IsOptional() @Transform(toBool) @IsBoolean() featured?: boolean;
}
