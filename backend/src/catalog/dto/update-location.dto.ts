import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class UpdateLocationDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() address?: string | null;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsBoolean() allowNegativeStock?: boolean;
}
