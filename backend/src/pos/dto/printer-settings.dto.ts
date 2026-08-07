import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class UpdatePrinterSettingsDto {
  @IsOptional() @IsString() @MaxLength(200) printerName?: string | null;
  @IsOptional() @IsIn([58, 80]) paperWidthMm?: 58 | 80;
  @IsOptional() @IsInt() @Min(1) @Max(5) printCopies?: number;
  @IsOptional() @IsBoolean() autoPrint?: boolean;
  @IsOptional() @IsBoolean() autoOpenDrawer?: boolean;
  @IsOptional() @IsBoolean() printLogo?: boolean;
  @IsOptional() @IsBoolean() printQr?: boolean;
}

export class UpdatePrintStatusDto {
  @IsIn(['pending', 'printed', 'failed']) status!: 'pending' | 'printed' | 'failed';
}
