import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class CreateLoyaltyAccountDto {
  @IsOptional() @IsString() customerId?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() firstName?: string;
  @IsOptional() @IsString() lastName?: string;
}

export class ManualAdjustmentDto {
  @IsString() @IsNotEmpty() accountId!: string;
  @IsInt() pointsDelta!: number;
  @IsString() @IsNotEmpty() reason!: string;
}

export class RedeemPreviewDto {
  @IsString() @IsNotEmpty() accountId!: string;
  @IsInt() @Min(1) points!: number;
  @IsInt() @Min(0) saleSubtotalMinor!: number;
  @IsOptional() managerApproval?: { employeeId: string; password: string };
}
