import { Type } from 'class-transformer';
import { IsIn, IsInt, IsISO8601, IsOptional, IsString, Max, Min } from 'class-validator';

export class ListSalesQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) perPage?: number;
  @IsOptional() @IsISO8601() from?: string;
  @IsOptional() @IsISO8601() to?: string;
  @IsOptional() @IsIn(['SUSPENDED', 'COMPLETED', 'REFUNDED', 'CANCELLED']) status?: string;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsString() cashierId?: string;
}
