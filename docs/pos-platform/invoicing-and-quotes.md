# Quotes, Invoices & Credit Notes

Covers master-prompt §25–§26, §39. Fully net-new
(`current-state-audit.md` §8) — delivered in
`SPRINT-07-quotes-invoices.md`.

## Collections

### `quotes`

```typescript
{
  quoteNumber: string;            // DEV-2026-000001
  customerId: string | null;
  customerSnapshot: CustomerSnapshot;   // name/phone/address at quote time
  billingAddress: Address | null;
  shippingAddress: Address | null;
  issueDate: Date;
  expiryDate: Date | null;
  salespersonId: string;
  lines: DocumentLine[];          // shared shape with invoices, see below
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  shippingMinor: number;
  totalMinor: number;
  notes: string | null;
  terms: string | null;
  status: 'DRAFT' | 'SENT' | 'VIEWED' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED' | 'CONVERTED' | 'CANCELLED';
  version: number;                // incremented on revision, never mutated in place once SENT
  previousVersionId: string | null;
  createdBy: string;
  updatedBy: string;
}
```

### `invoices`

```typescript
{
  invoiceNumber: string;          // FAC-2026-000001, separate counter per invoiceType
  invoiceType: 'SALES_INVOICE' | 'POS_INVOICE' | 'ONLINE_INVOICE' | 'PROFORMA' | 'CREDIT_NOTE';
  customerSnapshot: CustomerSnapshot;
  companySnapshot: CompanySnapshot;   // boutique legal info at issue time — see settings
  billingAddress: Address | null;
  issueDate: Date;
  dueDate: Date | null;
  saleId: string | null;          // POS sale
  orderId: string | null;         // online order
  quoteId: string | null;
  lines: DocumentLine[];
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  shippingMinor: number;
  totalMinor: number;
  paidMinor: number;
  balanceMinor: number;           // totalMinor - paidMinor, derived on write not on read
  currency: 'TND';
  paymentStatus: 'UNPAID' | 'PARTIALLY_PAID' | 'PAID';
  status: 'DRAFT' | 'FINALIZED' | 'SENT' | 'PARTIALLY_PAID' | 'PAID' | 'OVERDUE' | 'CANCELLED' | 'CREDITED';
  notes: string | null;
  terms: string | null;
  createdBy: string;
  finalizedAt: Date | null;
}

type DocumentLine = {
  variantId: string | null;       // null for a free-text/custom line
  descriptionSnapshot: string;
  quantity: number;
  unitPriceMinor: number;
  discountMinor: number;
  taxMinor: number;
  lineTotalMinor: number;
};
```

Credit notes are `invoices` documents with `invoiceType: 'CREDIT_NOTE'` and
a `creditedInvoiceId` reference — same shape, same numbering machinery,
different sequence prefix (`AV-2026-000001`), so all the PDF/email/payment
plumbing is shared code, not duplicated.

## The immutability rule (master-prompt §26)

Once an invoice's `status` moves to `FINALIZED`, no field on `lines`,
`subtotalMinor`…`totalMinor`, `customerSnapshot`, or `companySnapshot` can
be changed — `InvoicesService.update()` throws if the document is already
finalized for anything except `notes` and payment-tracking fields
(`paidMinor`/`balanceMinor`/`paymentStatus`, which change through a
dedicated `recordPayment()` method, not a generic patch). Corrections are
a new `CREDIT_NOTE` document referencing the original, or — if the whole
invoice was wrong before any payment was recorded — cancel it
(`status: 'CANCELLED'`) and issue a fresh one. Never delete a finalized
invoice.

## Quote → order / invoice conversion

`POST /api/v1/admin/quotes/:id/convert-to-order` creates a normal online
order (reusing `OrdersService.create()`) seeded from the quote's lines,
sets the quote's `status: 'CONVERTED'`, links `quote.convertedOrderId`.
`POST /api/v1/admin/quotes/:id/convert-to-invoice` does the equivalent
into `invoices` directly (for cases like a custom/manual sale that never
goes through the cart, e.g. a bespoke tailoring order). Only `ACCEPTED`
quotes can convert; converting twice is rejected (idempotent by status
check, not by a separate lock).

## Revisions (master-prompt §25 "do not change an accepted quote silently")

Any edit to a quote once it's left `DRAFT` creates a new document with
`version: previous.version + 1`, `previousVersionId` set, same
`quoteNumber` (numbering identifies the deal, `version` identifies the
draft). The UI (`app/mzali/quotes`) shows version history as a simple
timeline, same visual pattern as `CommandesView.tsx`'s status history.

## Numbering

Same atomic-counter pattern as orders/POs — one counter key per prefix
(`quote`, `invoice-sales`, `invoice-pos`, `invoice-online`, `invoice-
proforma`, `credit-note`). Configurable prefix/reset-per-year behavior
lives in `settings` so the business can adjust it without a code change,
per master-prompt §39's "configurable sequences."

## PDF generation

No PDF library exists in the backend today (`current-state-audit.md` §7).
Sprint 7 introduces one (evaluate `@react-pdf/renderer` for
layout-as-JSX consistency with the rest of the stack, or a lighter
`pdfkit` if the templates stay simple — decide at kickoff, not here).
Generation runs as a BullMQ job (`invoice.generate-pdf`,
`quote.generate-pdf`), never inline in a request handler; the resulting
PDF uploads to MinIO (`documents` bucket, already provisioned) and the
document row stores the `mediaId`. Email delivery is a separate job
consuming the same generated PDF.

## Fiscal fields — explicit gate

Master-prompt §26: *"all fiscal fields, numbering rules and tax fields
must be configurable and verified with the business accountant before
production activation."* This is a real gate, not boilerplate — Sprint 7's
verification checklist includes an explicit "accountant sign-off"
checkbox before `invoices.finalize` is enabled in production
(`settings.invoicing.enabled`), separate from the feature being merged and
tested. Do not silently assume Tunisian VAT/timbre fiscal rules; ask the
user for the actual figures before hardcoding anything into `taxMinor`
calculation.

## API surface

```
GET    /api/v1/admin/quotes
POST   /api/v1/admin/quotes
POST   /api/v1/admin/quotes/:id/send
POST   /api/v1/admin/quotes/:id/accept
POST   /api/v1/admin/quotes/:id/reject
POST   /api/v1/admin/quotes/:id/convert-to-order
POST   /api/v1/admin/quotes/:id/convert-to-invoice

GET    /api/v1/admin/invoices
POST   /api/v1/admin/invoices
POST   /api/v1/admin/invoices/:id/finalize
POST   /api/v1/admin/invoices/:id/send
POST   /api/v1/admin/invoices/:id/payments        — record a payment, updates paidMinor/balanceMinor
POST   /api/v1/admin/invoices/:id/credit-note
```
