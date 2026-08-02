import { Body, Controller, Get, Put, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuditService } from '@/audit/audit.service';
import { CurrentUser } from '@/auth/current-user.decorator';
import { AuthedRequest, JwtAuthGuard, RequestUser } from '@/auth/guards/jwt-auth.guard';
import { PermissionsGuard, RequirePermissions } from '@/auth/guards/permissions.guard';
import { UpdateInventorySettingsDto } from './dto/inventory-settings.dto';
import { UpdateCompanySettingsDto, UpdateInvoicingSettingsDto } from './dto/invoicing-settings.dto';
import { UpdateLoyaltySettingsDto } from './dto/loyalty-settings.dto';
import { UpdatePosAlertSettingsDto } from './dto/pos-alerts-settings.dto';
import { UpdateSiteSettingsDto } from './dto/site-settings.dto';
import { SettingsService } from './settings.service';

@ApiTags('admin/settings')
@ApiBearerAuth()
@Controller('admin/settings')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SettingsAdminController {
  constructor(
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
  ) {}

  @Get('site')
  @RequirePermissions('settings.manage')
  getSite() {
    return this.settings.getSite();
  }

  @Put('site')
  @RequirePermissions('settings.manage')
  async updateSite(
    @Body() dto: UpdateSiteSettingsDto,
    @CurrentUser() user: RequestUser,
    @Req() req: AuthedRequest,
  ) {
    const updated = await this.settings.setSite(dto);
    await this.audit.log({
      actor: { type: 'employee', id: user.userId, name: user.name },
      action: 'settings.update',
      entityType: 'settings',
      entityId: 'site',
      summary: 'Mise à jour des paramètres du site',
      ip: req.ip,
    });
    return updated;
  }

  @Get('inventory')
  @RequirePermissions('settings.manage')
  getInventory() {
    return this.settings.getInventorySettings();
  }

  @Put('inventory')
  @RequirePermissions('settings.manage')
  async updateInventory(
    @Body() dto: UpdateInventorySettingsDto,
    @CurrentUser() user: RequestUser,
    @Req() req: AuthedRequest,
  ) {
    const updated = await this.settings.setInventorySettings(dto);
    await this.audit.log({
      actor: { type: 'employee', id: user.userId, name: user.name },
      action: 'settings.update',
      entityType: 'settings',
      entityId: 'inventory',
      summary: `Politique de stock modifiée : ${updated.stockPolicy}`,
      ip: req.ip,
    });
    return updated;
  }

  @Get('invoicing')
  @RequirePermissions('settings.manage')
  getInvoicing() {
    return this.settings.getInvoicingSettings();
  }

  @Put('invoicing')
  @RequirePermissions('settings.manage')
  async updateInvoicing(
    @Body() dto: UpdateInvoicingSettingsDto,
    @CurrentUser() user: RequestUser,
    @Req() req: AuthedRequest,
  ) {
    const updated = await this.settings.setInvoicingSettings(dto);
    await this.audit.log({
      actor: { type: 'employee', id: user.userId, name: user.name },
      action: 'settings.update',
      entityType: 'settings',
      entityId: 'invoicing',
      summary: `Paramètres de facturation modifiés — activée: ${updated.enabled}`,
      ip: req.ip,
    });
    return updated;
  }

  @Get('company')
  @RequirePermissions('settings.manage')
  getCompany() {
    return this.settings.getCompany();
  }

  @Put('company')
  @RequirePermissions('settings.manage')
  async updateCompany(
    @Body() dto: UpdateCompanySettingsDto,
    @CurrentUser() user: RequestUser,
    @Req() req: AuthedRequest,
  ) {
    const updated = await this.settings.setCompany(dto);
    await this.audit.log({
      actor: { type: 'employee', id: user.userId, name: user.name },
      action: 'settings.update',
      entityType: 'settings',
      entityId: 'company',
      summary: 'Informations légales de l\'entreprise mises à jour',
      ip: req.ip,
    });
    return updated;
  }

  @Get('loyalty')
  @RequirePermissions('settings.manage')
  getLoyalty() {
    return this.settings.getLoyaltySettings();
  }

  @Put('loyalty')
  @RequirePermissions('settings.manage')
  async updateLoyalty(
    @Body() dto: UpdateLoyaltySettingsDto,
    @CurrentUser() user: RequestUser,
    @Req() req: AuthedRequest,
  ) {
    const updated = await this.settings.setLoyaltySettings(dto);
    await this.audit.log({
      actor: { type: 'employee', id: user.userId, name: user.name },
      action: 'settings.update',
      entityType: 'settings',
      entityId: 'loyalty',
      summary: 'Règles de fidélité mises à jour',
      ip: req.ip,
    });
    return updated;
  }

  @Get('pos-alerts')
  @RequirePermissions('pos.alerts.configure')
  getPosAlerts() {
    return this.settings.getPosAlertSettings();
  }

  @Put('pos-alerts')
  @RequirePermissions('pos.alerts.configure')
  async updatePosAlerts(
    @Body() dto: UpdatePosAlertSettingsDto,
    @CurrentUser() user: RequestUser,
    @Req() req: AuthedRequest,
  ) {
    const updated = await this.settings.setPosAlertSettings(dto);
    await this.audit.log({
      actor: { type: 'employee', id: user.userId, name: user.name },
      action: 'settings.update',
      entityType: 'settings',
      entityId: 'posAlerts',
      summary: 'Seuils d\'alertes POS mis à jour',
      ip: req.ip,
    });
    return updated;
  }
}
