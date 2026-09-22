import { IsBoolean, IsInt, IsOptional, IsPositive, IsString } from 'class-validator';

export class PushShipmentDto {
  @IsString() orderId!: string;
  /** When true, clears any existing failed result and retries the carrier push. */
  @IsOptional() @IsBoolean() force?: boolean;
  /**
   * First Delivery only: an admin-confirmed locality id from a prior
   * `POST /admin/shipping/firstdelivery/preview` call. When set, the
   * carrier push uses this exact locality and skips automatic
   * resolution entirely.
   */
  @IsOptional() @IsInt() @IsPositive() localityId?: number;
}

export class PreviewFirstDeliveryDto {
  @IsString() orderId!: string;
}
