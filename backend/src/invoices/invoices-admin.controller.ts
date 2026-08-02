import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { AuditService } from '@/audit/audit.service';
import { CurrentUser } from '@/auth/current-user.decorator';
import { AuthedRequest, JwtAuthGuard, RequestUser } from '@/auth/guards/jwt-auth.guard';
import { PermissionsGuard, RequirePermissions } from '@/auth/guards/permissions.guard';
import { QUEUES } from '@/jobs/queues';
import { CreateInvoiceDto, InvoiceLineInputDto, RecordPaymentDto, UpdateInvoiceDto } from './dto/invoice.dto';
import { toInvoiceContract } from './invoice.mapper';
import { InvoicesService } from './invoices.service';

@ApiTags('admin/invoices')
@ApiBearerAuth()
@Controller('admin/invoices')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class InvoicesAdminController {
  constructor(
    private readonly invoices: InvoicesService,
    @InjectQueue(QUEUES.MEDIA_PROCESSING) private readonly pdfQueue: Queue,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @RequirePermissions('documents.manage')
  async list(@Query('status') status?: string, @Query('invoiceType') invoiceType?: string) {
    const docs = await this.invoices.list(status, invoiceType);
    return docs.map(toInvoiceContract);
  }

  @Get(':id')
  @RequirePermissions('documents.manage')
  async get(@Param('id') id: string) {
    return toInvoiceContract(await this.invoices.getById(id));
  }

  @Post()
  @RequirePermissions('documents.manage')
  async create(@Body() dto: CreateInvoiceDto, @CurrentUser() user: RequestUser) {
    const doc = await this.invoices.create(dto, { type: 'employee', id: user.userId, name: user.name });
    return toInvoiceContract(doc);
  }

  @Patch(':id')
  @RequirePermissions('documents.manage')
  async update(@Param('id') id: string, @Body() dto: UpdateInvoiceDto) {
    return toInvoiceContract(await this.invoices.update(id, dto));
  }

  @Delete(':id')
  @RequirePermissions('documents.manage')
  async delete(@Param('id') id: string) {
    await this.invoices.delete(id);
    return { ok: true };
  }

  @Post('bulk-delete')
  @RequirePermissions('documents.manage')
  async bulkDelete(@Body() dto: { ids: string[] }) {
    const count = await this.invoices.deleteMany(dto.ids || []);
    return { ok: true, deletedCount: count };
  }

  @Post(':id/finalize')
  @RequirePermissions('documents.finalize')
  async finalize(@Param('id') id: string, @CurrentUser() user: RequestUser, @Req() req: AuthedRequest) {
    const doc = await this.invoices.finalize(id);
    await this.pdfQueue.add('invoice.generate-pdf', { documentType: 'invoice', documentId: doc.id });
    await this.audit.log({
      actor: { type: 'employee', id: user.userId, name: user.name },
      action: 'invoicing.finalize',
      entityType: 'invoice',
      entityId: doc.id,
      summary: `Facture ${doc.invoiceNumber} finalisée`,
      ip: req.ip,
    });
    return toInvoiceContract(doc);
  }

  @Post(':id/send')
  @RequirePermissions('documents.manage')
  async send(@Param('id') id: string) {
    return toInvoiceContract(await this.invoices.send(id));
  }

  @Post(':id/payments')
  @RequirePermissions('documents.manage')
  async recordPayment(@Param('id') id: string, @Body() dto: RecordPaymentDto, @CurrentUser() user: RequestUser) {
    return toInvoiceContract(await this.invoices.recordPayment(id, dto, { type: 'employee', id: user.userId, name: user.name }));
  }

  @Post(':id/credit-note')
  @RequirePermissions('documents.finalize')
  async creditNote(@Param('id') id: string, @Body() dto: { lines?: InvoiceLineInputDto[] }, @CurrentUser() user: RequestUser) {
    const { original, creditNote } = await this.invoices.issueCreditNote(id, dto.lines, { type: 'employee', id: user.userId, name: user.name });
    if (creditNote.status === 'FINALIZED') {
      await this.pdfQueue.add('invoice.generate-pdf', { documentType: 'invoice', documentId: creditNote.id });
    }
    return { original: toInvoiceContract(original), creditNote: toInvoiceContract(creditNote) };
  }
}
