import { IsOptional, IsString } from 'class-validator';

export class CreateCategoryDto {
  @IsString() name!: string;
  @IsOptional() @IsString() slug?: string;
  @IsOptional() @IsString() parentId?: string | null;
  @IsOptional() @IsString() description?: string;
}

export class UpdateCategoryDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() slug?: string;
  @IsOptional() @IsString() parentId?: string | null;
  @IsOptional() @IsString() description?: string;
}
