import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Max, Min } from 'class-validator';

const TEMPLATE_CODES = ['STANDARD', 'SILVER', 'GOLD', 'VIP'] as const;

export class CreateCardBatchDto {
  @IsString() @IsNotEmpty() name!: string;
  @IsInt() @Min(1) @Max(2000) quantity!: number;
  @IsIn(TEMPLATE_CODES) templateCode!: (typeof TEMPLATE_CODES)[number];
  @IsOptional() @IsString() notes?: string;
}

export class AssignCardDto {
  @IsOptional() @IsString() cardNumber?: string;
  @IsOptional() @IsString() qrToken?: string;
  @IsOptional() @IsString() customerId?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() firstName?: string;
  @IsOptional() @IsString() lastName?: string;
}

export class ReplaceCardDto {
  @IsString() @IsNotEmpty() oldCardId!: string;
  @IsOptional() @IsString() newCardNumber?: string;
  @IsOptional() @IsString() newQrToken?: string;
  @IsString() @IsNotEmpty() reason!: string;
}

export class CardActionReasonDto {
  @IsOptional() @IsString() reason?: string;
}

export class LookupCardDto {
  @IsOptional() @IsString() cardNumber?: string;
  @IsOptional() @IsString() qrToken?: string;
}
