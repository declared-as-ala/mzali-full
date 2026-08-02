import { IsString } from 'class-validator';

export class PushShipmentDto {
  @IsString() orderId!: string;
}
