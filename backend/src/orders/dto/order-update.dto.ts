import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsIn, IsInt, IsNumber, IsObject, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { ORDER_STATUS_VALUES } from '@/orders/order-status';

class OrderUpdateCustomerDto {
  @IsOptional() @IsString() firstName?: string;
  @IsOptional() @IsString() lastName?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() phone2?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsString() locality?: string;
  @IsOptional() @IsInt() firstDeliveryLocalityId?: number;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() note?: string;
}

class OrderUpdateItemDto {
  /** Echoed back from the loaded order for an existing line so its
   *  identity survives the save (see order.schema.ts's OrderItem.itemId
   *  doc). Omitted (or unrecognized) means "this is a new line" — a
   *  fresh id is generated for it. */
  @IsOptional() @IsString() itemId?: string;
  @IsString() productId!: string;
  @IsOptional() @IsString() variantId?: string;
  @IsInt() qty!: number;
  @IsOptional() @IsNumber() unitPrice?: number;
  @IsOptional() @IsObject() variation?: Record<string, string>;
  @IsOptional() @IsString() bundleName?: string;
  @IsOptional() @IsInt() bundleSlot?: number;
}

/** Admin/employee order edits — every field optional (PATCH-style). */
export class UpdateOrderDto {
  @IsOptional() @IsIn(ORDER_STATUS_VALUES) status?: string;
  @IsOptional() @ValidateNested() @Type(() => OrderUpdateCustomerDto) customer?: OrderUpdateCustomerDto;
  @IsOptional() @IsNumber() shipping?: number;
  @IsOptional() @IsString() deliveryCompany?: string;
  @IsOptional() @IsBoolean() exchange?: boolean;
  @IsOptional() @IsString() privateNote?: string;
  @IsOptional() @IsNumber() subtotal?: number;
  @IsOptional() @IsNumber() total?: number;
  @IsOptional() @IsInt() attempts?: number;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => OrderUpdateItemDto) items?: OrderUpdateItemDto[];
  /** Required when editing an order that's already confirmed (stock has
   *  physically moved) — see OrdersService.update()'s sensitivity check. */
  @IsOptional() @IsString() reason?: string;
  /** Optimistic concurrency: the version the editor loaded (see
   *  Order.version). Mismatch with the persisted version aborts with 409 —
   *  the order was modified by someone else since it was opened. */
  @IsOptional() @IsInt() @Min(0) version?: number;
}

export class UpdateStatusDto {
  @IsIn(ORDER_STATUS_VALUES) status!: string;
}
