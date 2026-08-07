import { Body, Controller, Get, NotFoundException, Param, Put, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import { PermissionsGuard, RequirePermissions } from '@/auth/guards/permissions.guard';
import { UpdatePrintStatusDto, UpdatePrinterSettingsDto } from './dto/printer-settings.dto';
import { PosRequest, PosTerminalGuard } from './guards/pos-terminal.guard';
import { PosSalesService } from './pos-sales.service';
import { PosTerminalsService } from './pos-terminals.service';

/**
 * Self-service, not admin-gated: any cashier can read/change the printer
 * settings for the till they're physically standing at, same as they can
 * already open its drawer — PosTerminalGuard has already resolved which
 * terminal that is. Settings live on the terminal document (see
 * pos-terminal.schema.ts), not the browser, so they survive a browser
 * restart, a fresh login, or a token refresh.
 */
@ApiTags('pos/printer')
@ApiBearerAuth()
@Controller('pos/printer')
@UseGuards(JwtAuthGuard, PosTerminalGuard, PermissionsGuard)
export class PosPrinterController {
  constructor(
    private readonly terminals: PosTerminalsService,
    private readonly sales: PosSalesService,
  ) {}

  @Get('settings')
  @RequirePermissions('pos.sell')
  getSettings(@Req() req: PosRequest) {
    return this.terminals.getPrinterSettings(req.posTerminalId!);
  }

  @Put('settings')
  @RequirePermissions('pos.sell')
  updateSettings(@Body() dto: UpdatePrinterSettingsDto, @Req() req: PosRequest) {
    return this.terminals.updatePrinterSettings(req.posTerminalId!, dto);
  }

  /** Called by the browser right after it gets a result back from the
   *  local hardware bridge — 'printed' on success, 'failed' on any bridge/
   *  printer error, so history can offer a retry without ever touching the
   *  sale itself (see PosSalesService.setPrintStatus). Scoped to the
   *  calling terminal so one till can't overwrite another's print status. */
  @Put('sales/:id/status')
  @RequirePermissions('pos.sell')
  async updatePrintStatus(@Param('id') id: string, @Body() dto: UpdatePrintStatusDto, @Req() req: PosRequest) {
    const sale = await this.sales.getById(id);
    if (!sale || sale.terminalId !== req.posTerminalId) throw new NotFoundException('Vente introuvable');
    return this.sales.setPrintStatus(id, dto.status);
  }
}
