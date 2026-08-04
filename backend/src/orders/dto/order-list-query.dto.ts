import { IsOptional, IsString } from 'class-validator';

export class OrderListQueryDto {
  @IsOptional() page?: number;
  @IsOptional() perPage?: number;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsString() after?: string;
  @IsOptional() @IsString() before?: string;
}
