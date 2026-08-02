import { Body, Controller, Get, Headers, NotFoundException, Param, Post, Put, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ServiceTokenGuard } from '@/auth/guards/service-token.guard';
import { CheckoutDto } from './dto/checkout.dto';
import { OrdersService } from './orders.service';

/** Storefront-facing checkout endpoints — service-token only (BFF). */
@ApiTags('orders')
@Controller('orders')
@UseGuards(ServiceTokenGuard)
export class OrdersPublicController {
  constructor(private readonly orders: OrdersService) {}

  @Post()
  create(@Body() dto: CheckoutDto, @Headers('idempotency-key') idempotencyKey?: string) {
    return this.orders.create(dto, idempotencyKey);
  }

  @Put(':id/draft')
  updateDraft(@Param('id') id: string, @Body() dto: CheckoutDto) {
    return this.orders.updateDraft(id, dto);
  }

  @Get(':id')
  async getById(@Param('id') id: string) {
    const order = await this.orders.getById(id);
    if (!order) throw new NotFoundException('Commande introuvable');
    return order;
  }
}
