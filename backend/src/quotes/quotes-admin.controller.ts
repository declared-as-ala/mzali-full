import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { CurrentUser } from '@/auth/current-user.decorator';
import { JwtAuthGuard, RequestUser } from '@/auth/guards/jwt-auth.guard';
import { PermissionsGuard, RequirePermissions } from '@/auth/guards/permissions.guard';
import { QUEUES } from '@/jobs/queues';
import { InvoicesService } from '@/invoices/invoices.service';
import { toInvoiceContract } from '@/invoices/invoice.mapper';
import { CreateQuoteDto, ReviseQuoteDto } from './dto/quote.dto';
import { toQuoteContract } from './quote.mapper';
import { QuotesService } from './quotes.service';

@ApiTags('admin/quotes')
@ApiBearerAuth()
@Controller('admin/quotes')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class QuotesAdminController {
  constructor(
    private readonly quotes: QuotesService,
    private readonly invoices: InvoicesService,
    @InjectQueue(QUEUES.MEDIA_PROCESSING) private readonly pdfQueue: Queue,
  ) {}

  @Get()
  @RequirePermissions('documents.manage')
  async list(@Query('status') status?: string) {
    const docs = await this.quotes.listLatestOnly();
    const filtered = status && status !== 'any' ? docs.filter((d) => d.status === status) : docs;
    return filtered.map(toQuoteContract);
  }

  @Get(':id')
  @RequirePermissions('documents.manage')
  async get(@Param('id') id: string) {
    return toQuoteContract(await this.quotes.getById(id));
  }

  @Delete(':id')
  @RequirePermissions('documents.manage')
  async delete(@Param('id') id: string) {
    await this.quotes.delete(id);
    return { ok: true };
  }

  @Post('bulk-delete')
  @RequirePermissions('documents.manage')
  async bulkDelete(@Body() dto: { ids: string[] }) {
    const count = await this.quotes.deleteMany(dto.ids || []);
    return { ok: true, deletedCount: count };
  }

  @Get(':id/history')
  @RequirePermissions('documents.manage')
  async history(@Param('id') id: string) {
    const doc = await this.quotes.getById(id);
    const docs = await this.quotes.history(doc.quoteNumber);
    return docs.map(toQuoteContract);
  }

  @Post()
  @RequirePermissions('documents.manage')
  async create(@Body() dto: CreateQuoteDto, @CurrentUser() user: RequestUser) {
    const doc = await this.quotes.create(dto, { type: 'employee', id: user.userId, name: user.name });
    return toQuoteContract(doc);
  }

  @Post(':id/send')
  @RequirePermissions('documents.manage')
  async send(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    const doc = await this.quotes.send(id, { type: 'employee', id: user.userId, name: user.name });
    await this.pdfQueue.add('quote.generate-pdf', { documentType: 'quote', documentId: doc.id });
    return toQuoteContract(doc);
  }

  @Post(':id/accept')
  @RequirePermissions('documents.manage')
  async accept(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return toQuoteContract(await this.quotes.accept(id, { type: 'employee', id: user.userId, name: user.name }));
  }

  @Post(':id/reject')
  @RequirePermissions('documents.manage')
  async reject(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return toQuoteContract(await this.quotes.reject(id, { type: 'employee', id: user.userId, name: user.name }));
  }

  @Post(':id/revise')
  @RequirePermissions('documents.manage')
  async revise(@Param('id') id: string, @Body() dto: ReviseQuoteDto, @CurrentUser() user: RequestUser) {
    return toQuoteContract(await this.quotes.revise(id, dto, { type: 'employee', id: user.userId, name: user.name }));
  }

  @Post(':id/convert-to-order')
  @RequirePermissions('documents.manage')
  async convertToOrder(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    const { quote, orderId } = await this.quotes.convertToOrder(id, { type: 'employee', id: user.userId, name: user.name });
    return { ...toQuoteContract(quote), orderId };
  }

  @Post(':id/convert-to-invoice')
  @RequirePermissions('documents.manage')
  async convertToInvoice(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    const actor = { type: 'employee' as const, id: user.userId, name: user.name };
    const quote = await this.quotes.getById(id);
    if (quote.status !== 'ACCEPTED') {
      return { error: `Seul un devis accepté peut être converti (statut actuel: ${quote.status})` };
    }
    const invoice = await this.invoices.create(
      {
        invoiceType: 'SALES_INVOICE',
        customerSnapshot: {
          name: quote.customerSnapshot.name,
          phone: quote.customerSnapshot.phone,
          email: quote.customerSnapshot.email ?? undefined,
          address: quote.customerSnapshot.address ?? undefined,
        },
        billingAddress: quote.billingAddress
          ? {
              line1: quote.billingAddress.line1 ?? undefined,
              line2: quote.billingAddress.line2 ?? undefined,
              city: quote.billingAddress.city ?? undefined,
              governorate: quote.billingAddress.governorate ?? undefined,
              postalCode: quote.billingAddress.postalCode ?? undefined,
              country: quote.billingAddress.country ?? undefined,
            }
          : undefined,
        quoteId: quote.id,
        lines: quote.lines.map((l) => ({
          productId: l.productId ?? undefined,
          description: l.productId ? undefined : l.descriptionSnapshot,
          quantity: l.quantity,
          unitPrice: l.unitPriceMinor / 1000,
          discount: l.discountMinor / 1000,
        })),
        shipping: quote.shippingMinor / 1000,
        notes: quote.notes ?? undefined,
        terms: quote.terms ?? undefined,
      },
      actor,
    );
    quote.status = 'CONVERTED';
    quote.convertedInvoiceId = invoice.id;
    quote.updatedBy = user.userId;
    await quote.save();
    return { ...toQuoteContract(quote), invoice: toInvoiceContract(invoice) };
  }
}
