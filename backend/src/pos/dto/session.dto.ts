import { IsIn, IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class OpenSessionDto {
  @IsInt() @Min(0) openingCashMinor!: number;
}

export class CloseSessionDto {
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
