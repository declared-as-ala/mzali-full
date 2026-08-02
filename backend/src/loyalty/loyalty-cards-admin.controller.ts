import { Body, Controller, Get, Headers, NotFoundException, Param, Post, Query, Req, StreamableFile, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuditService } from '@/audit/audit.service';
import { CurrentUser } from '@/auth/current-user.decorator';
import { AuthedRequest, JwtAuthGuard, RequestUser } from '@/auth/guards/jwt-auth.guard';
import { PermissionsGuard, RequirePermissions } from '@/auth/guards/permissions.guard';
import { AssignCardDto, CardActionReasonDto, CreateCardBatchDto, ReplaceCardDto } from './dto/loyalty-card.dto';
import { toCardBatchContract, toCardContract } from './loyalty-card.mapper';
import { LoyaltyCardExportService } from './loyalty-card-export.service';
import { LoyaltyCardsService } from './loyalty-cards.service';

@ApiTags('admin/loyalty/cards')
@ApiBearerAuth()
@Controller('admin/loyalty')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class LoyaltyCardsAdminController {
  constructor(
    private readonly cards: LoyaltyCardsService,
    private readonly exportService: LoyaltyCardExportService,
    private readonly audit: AuditService,
  ) {}

  // ---- batches ----------------------------------------------------

  @Get('card-batches')
  @RequirePermissions('loyalty.cards.manage')
  async listBatches() {
    const rows = await this.cards.listBatches();
    return rows.map(({ batch, counts }) => toCardBatchContract(batch, counts));
  }

  @Get('card-batches/:id')
  @RequirePermissions('loyalty.cards.manage')
  async getBatch(@Param('id') id: string) {
    const batch = await this.cards.getBatchById(id);
    if (!batch) throw new NotFoundException('Lot introuvable');
    const counts = await this.cards.batchCounts(id);
    return toCardBatchContract(batch, counts);
  }

  @Get('card-batches/:id/cards')
  @RequirePermissions('loyalty.cards.manage')
  async listBatchCards(@Param('id') id: string) {
    const docs = await this.cards.cardsInBatch(id);
    const enriched = await this.cards.enrich(docs);
    return enriched.map(({ doc, customer, batchName }) => toCardContract(doc, customer, batchName));
  }

  /** Read-only — unlike export/:mode below, never marks the batch exported. */
  @Get('card-batches/:id/preview/sheet.pdf')
  @RequirePermissions('loyalty.cards.manage')
  async previewSheet(@Param('id') id: string, @Query('side') side: 'front' | 'back' = 'front'): Promise<StreamableFile> {
    const pdf = await this.exportService.previewSheet(id, side === 'back' ? 'back' : 'front');
    return new StreamableFile(pdf, { type: 'application/pdf', disposition: 'inline' });
  }

  @Post('card-batches')
  @RequirePermissions('loyalty.cards.generate')
  async createBatch(
    @Body() dto: CreateCardBatchDto,
    @CurrentUser() user: RequestUser,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() req: AuthedRequest,
  ) {
    const batch = await this.cards.createBatch(
      dto,
      { type: 'employee', id: user.userId, name: user.name },
      idempotencyKey,
    );
    await this.audit.log({
      actor: { type: 'employee', id: user.userId, name: user.name },
      action: 'loyalty.cards.batch_create',
      entityType: 'loyalty_card_batch',
      entityId: batch.id,
      summary: `Lot de cartes "${batch.name}" généré (${batch.quantity} cartes)`,
      ip: req.ip,
    });
    const counts = await this.cards.batchCounts(batch.id);
    return toCardBatchContract(batch, counts);
  }

  @Post('card-batches/:id/mark-exported')
  @RequirePermissions('loyalty.cards.export')
  async markExported(@Param('id') id: string) {
    const batch = await this.cards.markBatchExported(id);
    const counts = await this.cards.batchCounts(id);
    return toCardBatchContract(batch, counts);
  }

  @Post('card-batches/:id/mark-printed')
  @RequirePermissions('loyalty.cards.manage')
  async markPrinted(@Param('id') id: string, @CurrentUser() user: RequestUser, @Req() req: AuthedRequest) {
    const batch = await this.cards.markBatchPrinted(id);
    await this.audit.log({
      actor: { type: 'employee', id: user.userId, name: user.name },
      action: 'loyalty.cards.batch_printed',
      entityType: 'loyalty_card_batch',
      entityId: batch.id,
      summary: `Lot "${batch.name}" marqué comme imprimé`,
      ip: req.ip,
    });
    const counts = await this.cards.batchCounts(id);
    return toCardBatchContract(batch, counts);
  }

  @Post('card-batches/:id/revoke-unassigned')
  @RequirePermissions('loyalty.cards.manage')
  async revokeUnassigned(
    @Param('id') id: string,
    @Body() dto: CardActionReasonDto,
    @CurrentUser() user: RequestUser,
    @Req() req: AuthedRequest,
  ) {
    const count = await this.cards.revokeUnassignedInBatch(
      id,
      { type: 'employee', id: user.userId, name: user.name },
      dto.reason ?? 'Révocation en masse des cartes non attribuées',
    );
    await this.audit.log({
      actor: { type: 'employee', id: user.userId, name: user.name },
      action: 'loyalty.cards.batch_revoke_unassigned',
      entityType: 'loyalty_card_batch',
      entityId: id,
      summary: `${count} carte(s) non attribuée(s) révoquée(s)`,
      ip: req.ip,
    });
    return { revoked: count };
  }

  @Post('card-batches/:id/export/:mode')
  @RequirePermissions('loyalty.cards.export')
  async exportBatch(
    @Param('id') id: string,
    @Param('mode') mode: 'pvc' | 'sheet' | 'zip',
    @CurrentUser() user: RequestUser,
    @Req() req: AuthedRequest,
  ) {
    let result: Record<string, string>;
    if (mode === 'pvc') result = await this.exportService.exportPvc(id, user.userId);
    else if (mode === 'sheet') result = await this.exportService.exportSheet(id, user.userId);
    else if (mode === 'zip') result = await this.exportService.exportZip(id, user.userId);
    else throw new NotFoundException('Mode d\'export inconnu');

    await this.cards.markBatchExported(id);
    await this.audit.log({
      actor: { type: 'employee', id: user.userId, name: user.name },
      action: 'loyalty.cards.batch_export',
      entityType: 'loyalty_card_batch',
      entityId: id,
      summary: `Export du lot en mode "${mode}"`,
      ip: req.ip,
    });
    return result;
  }

  // ---- individual cards ----------------------------------------------------

  @Get('cards')
  @RequirePermissions('loyalty.cards.manage')
  async listCards(
    @Query('search') search?: string,
    @Query('batchId') batchId?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('perPage') perPage?: string,
  ) {
    const result = await this.cards.listAdmin(
      { search, batchId, status },
      page ? Number(page) : undefined,
      perPage ? Number(perPage) : undefined,
    );
    return { ...result, items: result.items.map((row) => toCardContract(row.doc, row.customer, row.batchName)) };
  }

  @Get('cards/:id')
  @RequirePermissions('loyalty.cards.manage')
  async getCard(@Param('id') id: string) {
    const doc = await this.cards.getById(id);
    if (!doc) throw new NotFoundException('Carte introuvable');
    const [enriched] = await this.cards.enrich([doc]);
    return toCardContract(enriched.doc, enriched.customer, enriched.batchName);
  }

  // ---- non-mutating previews ----------------------------------------------------
  // Read-only renders for the admin "front/back/print" toggle — unlike
  // card-batches/:id/export/:mode below, these never touch MinIO or the
  // batch's exported/printed status, so clicking through the preview tabs
  // has no side effects.

  @Get('cards/:id/preview/front.png')
  @RequirePermissions('loyalty.cards.manage')
  async previewFront(@Param('id') id: string): Promise<StreamableFile> {
    const png = await this.exportService.previewFrontPng(id);
    return new StreamableFile(png, { type: 'image/png', disposition: 'inline' });
  }

  @Get('cards/:id/preview/back.png')
  @RequirePermissions('loyalty.cards.manage')
  async previewBack(@Param('id') id: string): Promise<StreamableFile> {
    const png = await this.exportService.previewBackPng(id);
    return new StreamableFile(png, { type: 'image/png', disposition: 'inline' });
  }

  @Get('cards/:id/preview.pdf')
  @RequirePermissions('loyalty.cards.manage')
  async previewPdf(@Param('id') id: string): Promise<StreamableFile> {
    const pdf = await this.exportService.previewPdf(id);
    return new StreamableFile(pdf, { type: 'application/pdf', disposition: 'inline' });
  }

  @Post('cards/assign')
  @RequirePermissions('loyalty.cards.manage')
  async assignCard(@Body() dto: AssignCardDto, @CurrentUser() user: RequestUser, @Req() req: AuthedRequest) {
    const { card, account } = await this.cards.assign(
      { cardNumber: dto.cardNumber, qrToken: dto.qrToken },
      { customerId: dto.customerId, phone: dto.phone, firstName: dto.firstName, lastName: dto.lastName },
      { type: 'employee', id: user.userId, name: user.name },
    );
    await this.audit.log({
      actor: { type: 'employee', id: user.userId, name: user.name },
      action: 'loyalty.cards.assign',
      entityType: 'loyalty_card',
      entityId: card.id,
      summary: `Carte ${card.cardNumber} attribuée`,
      ip: req.ip,
    });
    return { card: toCardContract(card), accountId: account.id };
  }

  @Post('cards/:id/suspend')
  @RequirePermissions('loyalty.cards.manage')
  async suspendCard(@Param('id') id: string, @Body() dto: CardActionReasonDto, @CurrentUser() user: RequestUser, @Req() req: AuthedRequest) {
    const card = await this.cards.suspend(id, { type: 'employee', id: user.userId, name: user.name }, dto.reason);
    await this.audit.log({
      actor: { type: 'employee', id: user.userId, name: user.name },
      action: 'loyalty.cards.suspend', entityType: 'loyalty_card', entityId: card.id,
      summary: `Carte ${card.cardNumber} suspendue`, ip: req.ip,
    });
    return toCardContract(card);
  }

  @Post('cards/:id/reactivate')
  @RequirePermissions('loyalty.cards.manage')
  async reactivateCard(@Param('id') id: string, @CurrentUser() user: RequestUser, @Req() req: AuthedRequest) {
    const card = await this.cards.reactivate(id, { type: 'employee', id: user.userId, name: user.name });
    await this.audit.log({
      actor: { type: 'employee', id: user.userId, name: user.name },
      action: 'loyalty.cards.reactivate', entityType: 'loyalty_card', entityId: card.id,
      summary: `Carte ${card.cardNumber} réactivée`, ip: req.ip,
    });
    return toCardContract(card);
  }

  @Post('cards/:id/revoke')
  @RequirePermissions('loyalty.cards.manage')
  async revokeCard(@Param('id') id: string, @Body() dto: CardActionReasonDto, @CurrentUser() user: RequestUser, @Req() req: AuthedRequest) {
    const card = await this.cards.revoke(id, { type: 'employee', id: user.userId, name: user.name }, dto.reason ?? 'Révoquée par un administrateur');
    await this.audit.log({
      actor: { type: 'employee', id: user.userId, name: user.name },
      action: 'loyalty.cards.revoke', entityType: 'loyalty_card', entityId: card.id,
      summary: `Carte ${card.cardNumber} révoquée`, ip: req.ip,
    });
    return toCardContract(card);
  }

  @Post('cards/:id/mark-lost')
  @RequirePermissions('loyalty.cards.manage')
  async markLost(@Param('id') id: string, @Body() dto: CardActionReasonDto, @CurrentUser() user: RequestUser, @Req() req: AuthedRequest) {
    const card = await this.cards.markLost(id, { type: 'employee', id: user.userId, name: user.name }, dto.reason);
    await this.audit.log({
      actor: { type: 'employee', id: user.userId, name: user.name },
      action: 'loyalty.cards.mark_lost', entityType: 'loyalty_card', entityId: card.id,
      summary: `Carte ${card.cardNumber} déclarée perdue`, ip: req.ip,
    });
    return toCardContract(card);
  }

  @Post('cards/replace')
  @RequirePermissions('loyalty.cards.manage')
  async replaceCard(@Body() dto: ReplaceCardDto, @CurrentUser() user: RequestUser, @Req() req: AuthedRequest) {
    const { oldCard, newCard, account } = await this.cards.replace(
      dto.oldCardId,
      { cardNumber: dto.newCardNumber, qrToken: dto.newQrToken },
      { type: 'employee', id: user.userId, name: user.name },
      dto.reason,
    );
    await this.audit.log({
      actor: { type: 'employee', id: user.userId, name: user.name },
      action: 'loyalty.cards.replace', entityType: 'loyalty_card', entityId: newCard.id,
      summary: `Carte ${oldCard.cardNumber} remplacée par ${newCard.cardNumber} — ${dto.reason}`, ip: req.ip,
    });
    return { oldCard: toCardContract(oldCard), newCard: toCardContract(newCard), accountId: account.id };
  }
}
