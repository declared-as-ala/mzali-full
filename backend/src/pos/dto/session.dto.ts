import { IsIn, IsInt, IsOptional, IsString, Min, MinLength, MaxLength } from 'class-validator';

export class OpenSessionDto {
  @IsInt() @Min(0) openingCashMinor!: number;
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
}

export class CloseSessionDto {
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
  @IsInt() @Min(0) closingCountedCashMinor!: number;
}

export class CashMovementDto {
  @IsIn(['ADD', 'REMOVE', 'CASH_IN', 'CASH_OUT']) type!: 'ADD' | 'REMOVE' | 'CASH_IN' | 'CASH_OUT';
  @IsInt() @Min(1) amountMinor!: number;
  @IsString() @MinLength(1) @MaxLength(1000) reason!: string;
  @IsOptional() @IsString() @MaxLength(100) category?: string;
  @IsOptional() @IsString() @MaxLength(200) categoryLabel?: string;
  @IsOptional() @IsString() @MaxLength(200) beneficiary?: string;
  @IsOptional() @IsString() @MaxLength(50) paymentMethod?: string;
  @IsOptional() @IsString() @MaxLength(100) reference?: string;
}

export class TakeoverSessionDto {
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
}

export class ReportQueryDto {
  @IsOptional() @IsIn(['X', 'Z']) type?: 'X' | 'Z';
}
