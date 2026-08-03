import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class PaymentDrawerEventDto {
  @IsString() @MaxLength(100) saleId!: string;
  @IsIn(['opened', 'failed', 'skipped']) outcome!: 'opened' | 'failed' | 'skipped';
  @IsOptional() @IsString() @MaxLength(300) error?: string;
}

export class ManualDrawerEventDto {
  @IsIn(['manual', 'test']) reason!: 'manual' | 'test';
  @IsIn(['opened', 'failed']) outcome!: 'opened' | 'failed';
  @IsOptional() @IsString() @MaxLength(300) error?: string;
}

export class ManualDrawerAuthorizationDto {
  @IsIn(['manual', 'test']) reason!: 'manual' | 'test';
}
