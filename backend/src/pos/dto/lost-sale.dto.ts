import { IsString } from 'class-validator';

export class LogLostSaleDto {
  @IsString() variantId!: string;
}
