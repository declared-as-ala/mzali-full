import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsString } from 'class-validator';
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import { PermissionsGuard, RequirePermissions } from '@/auth/guards/permissions.guard';
import { PosRequest, PosTerminalGuard } from './guards/pos-terminal.guard';
import { PosSuggestionsService } from './pos-suggestions.service';

class SuggestionsQueryDto {
  @IsString() variantId!: string;
}

@ApiTags('pos/suggestions')
@ApiBearerAuth()
@Controller('pos/suggestions')
@UseGuards(JwtAuthGuard, PosTerminalGuard, PermissionsGuard)
export class PosSuggestionsController {
  constructor(private readonly suggestions: PosSuggestionsService) {}

  @Get()
  @RequirePermissions('pos.sell')
  async get(@Query() query: SuggestionsQueryDto, @Req() posReq: PosRequest) {
    return this.suggestions.forVariant(query.variantId, posReq.posLocationId!);
  }
}
