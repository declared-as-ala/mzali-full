import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsBoolean, IsInt, IsOptional, IsPositive, IsString, Min, ValidateNested } from 'class-validator';

class TransferLineInputDto {
  @IsString() productId!: string;
  @IsInt() @IsPositive() requestedQuantity!: number;
}

export class CreateTransferDto {
  @IsString() sourceLocationId!: string;
  @IsString() destinationLocationId!: string;
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => TransferLineInputDto)
  lines!: TransferLineInputDto[];
  @IsOptional() @IsString() note?: string;
  /** Defaults to submitting straight to REQUESTED; pass true to save as DRAFT instead. */
  @IsOptional() @IsBoolean() draft?: boolean;
}

class ApproveLineDto {
  @IsString() variantId!: string;
  @IsInt() @Min(0) approvedQuantity!: number;
}

export class ApproveTransferDto {
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => ApproveLineDto)
  lines!: ApproveLineDto[];
}

class ReceiveLineDto {
  @IsString() variantId!: string;
  @IsInt() @Min(0) receivedQuantity!: number;
  @IsOptional() @IsInt() @Min(0) damagedQuantity?: number;
  @IsOptional() @IsInt() @Min(0) missingQuantity?: number;
}

export class ReceiveTransferDto {
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => ReceiveLineDto)
  lines!: ReceiveLineDto[];
}
