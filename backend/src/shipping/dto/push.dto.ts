import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class PushShipmentDto {
  @IsString() orderId!: string;
  /** When true, clears any existing failed result and retries the carrier push. */
  @IsOptional() @IsBoolean() force?: boolean;
}
