import { IsIn, IsInt, IsOptional, IsString, Min, MinLength, MaxLength } from 'class-validator';

export class OpenSessionDto {
  @IsInt() @Min(0) openingCashMinor!: number;
}

export class CloseSessionDto {
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
  @IsInt() @Min(0) closingCountedCashMinor!: number;
}

export class CashMovementDto {
  @IsIn(['ADD', 'REMOVE']) type!: 'ADD' | 'REMOVE';
  @IsInt() @Min(1) amountMinor!: number;
  @IsString() @MinLength(1) reason!: string;
}

export class ReportQueryDto {
  @IsOptional() @IsIn(['X', 'Z']) type?: 'X' | 'Z';
}
