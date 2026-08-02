import { IsArray, IsOptional, IsString } from 'class-validator';

export class UpdateSiteSettingsDto {
  @IsOptional() @IsString() photoUrl?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) phones?: string[];
  @IsOptional() @IsString() whatsapp?: string;
  @IsOptional() @IsString() instagram?: string;
  @IsOptional() @IsString() tiktok?: string;
  @IsOptional() @IsString() facebook?: string;
}
