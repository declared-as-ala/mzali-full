# SPRINT 07 — Quotes, invoices, credit notes, numbering, PDF generation

You are a senior NestJS + Next.js engineer extending the Mzali platform.
Repo root: `c:\Users\Ala\Desktop\mzali full`. SPRINT-01's gate must pass
first. Independent of Sprints 2–6 (no stock or POS dependency), can run in
parallel with them.

**Before writing any tax/numbering logic, stop and confirm with the user**
what Tunisian fiscal fields (TVA rate(s), timbre fiscal, any required
legal mentions) actually apply to this business — do not hardcode assumed
tax rules. This sprint's `taxMinor` fields can be built and tested with
placeholder/configurable rates, but production activation (finalizing real
invoices) is gated on that confirmation per
`docs/pos-platform/invoicing-and-quotes.md` §"Fiscal fields — explicit
gate".

## Read first

- `docs/pos-platform/invoicing-and-quotes.md` — full schema/flow spec.
- `backend/src/database/counters.service.ts` — atomic numbering pattern.
- `backend/src/orders/orders.service.ts` — how the existing order-creation
  service recomputes totals server-side; the quote→order conversion in
  this sprint reuses `OrdersService.create()`, not a parallel totals
  calculator.
- `backend/src/media/*` — MinIO upload, for storing generated PDFs.

## Build — backend (`backend/src/quotes/`, `.../invoices/`)

Schemas exactly as specified in `docs/pos-platform/invoicing-and-quotes.md`
(`quotes`, `invoices` — credit notes are `invoices` with `invoiceType:
'CREDIT_NOTE'`).

### Immutability enforcement

`InvoicesService.update()` throws `ForbiddenException` for any field
outside `notes`/payment-tracking once `status !== 'DRAFT'`. Payment
recording is a separate method (`recordPayment(invoiceId, amountMinor,
method)`) that only ever adds to `paidMinor` and recomputes
`balanceMinor`/`paymentStatus` — never a generic PATCH.

### Numbering

New counter keys per document type/subtype (`quote`, `invoice-sales`,
`invoice-pos`, `invoice-online`, `invoice-proforma`, `credit-note`) via
the existing `CountersService`. Prefix/format configurable in `settings`
(`settings.invoicing.numberFormats`), per master-prompt §39.

### Quote workflow

```
POST /api/v1/admin/quotes
POST /api/v1/admin/quotes/:id/send            — status → SENT
POST /api/v1/admin/quotes/:id/accept          — status → ACCEPTED
POST /api/v1/admin/quotes/:id/reject          — status → REJECTED
POST /api/v1/admin/quotes/:id/revise          — creates a new version document, see below
POST /api/v1/admin/quotes/:id/convert-to-order    — only from ACCEPTED, calls OrdersService.create()
POST /api/v1/admin/quotes/:id/convert-to-invoice  — only from ACCEPTED
```

Revision: any edit attempt on a non-DRAFT quote creates a new document
(`version: n+1`, `previousVersionId` set, same `quoteNumber`) instead of
mutating in place — implement this as the *only* path `update()` takes
once a quote has left DRAFT, so there's no way to accidentally silently
edit an already-sent quote.

### Invoice workflow

```
POST /api/v1/admin/invoices
POST /api/v1/admin/invoices/:id/finalize      — locks the document, requires settings.invoicing.enabled === true
POST /api/v1/admin/invoices/:id/send
POST /api/v1/admin/invoices/:id/payments
POST /api/v1/admin/invoices/:id/credit-note   — creates a linked CREDIT_NOTE invoice
```

`finalize` is where the fiscal-gate check lives
(`ForbiddenException` if `settings.invoicing.enabled` is false) —
everything else in this sprint (drafting, PDF preview) works regardless,
so development/testing isn't blocked on the accountant sign-off, only
real production finalization is.

### PDF generation

Introduce the PDF-rendering dependency (evaluate `@react-pdf/renderer` vs
`pdfkit` at kickoff per `invoicing-and-quotes.md` — pick one, don't bring
in both). BullMQ jobs `quote.generate-pdf`, `invoice.generate-pdf`; output
uploads to the existing MinIO `documents` bucket via `MediaService`,
`mediaId` stored on the document. Never generate inline in a request
handler (master-prompt §47's "do not call external APIs or generate PDFs
inside database transactions" — this isn't a transaction, but the same
"keep request handlers fast, defer heavy work to a queue" principle
applies).

Company snapshot (`companySnapshot` on invoices) sources from a new
`settings.company` key (legal name, address, tax id, logo media id) — add
a settings admin form field for it if one doesn't already exist.

## Build — frontend

- `app/mzali/quotes` — list/create/detail, line editor (same picker as
  Sprint 6's PO line editor — factor it into a shared component if both
  sprints land close together, otherwise duplicate now and consolidate
  later, don't block either sprint on the other), status actions, version
  history timeline (same visual pattern as `CommandesView.tsx`'s status
  history).
- `app/mzali/invoices` — list/create/detail, finalize/send/record-payment
  actions, credit-note creation, PDF preview/download link.
- Both pages follow master-prompt §34's "Documents" nav section.

## Tests

- Editing a `SENT` quote creates a new version, never mutates the
  original document.
- `InvoicesService.update()` rejects any line/total/snapshot change once
  `status !== 'DRAFT'`.
- `finalize()` rejects when `settings.invoicing.enabled` is false, even
  for an admin-role caller.
- Two concurrent quote/invoice creations never receive the same number
  (concurrency test against `CountersService`, same shape as the existing
  order-number concurrency test if one exists in the original migration's
  test suite).
- Quote→order conversion produces an order whose totals exactly match the
  quote's (server-recomputed via `OrdersService.create()`, not copied
  verbatim — verify they agree because the same catalog data was read,
  not because the number was blindly carried over).
- Credit note against a finalized invoice correctly nets out in a
  hand-computed balance scenario.

## Verification gate

`npm run check:contracts && npm run typecheck && npm run lint && npm test`
green in `backend/`. `npx tsc --noEmit` green at repo root. Manual
walkthrough with `settings.invoicing.enabled = false`: create a quote →
revise it → accept → convert to invoice → attempt finalize (expect
rejection with a clear message about the fiscal gate). Flip the setting on
in a dev-only test → finalize succeeds → PDF generates and is downloadable
→ record a partial payment → balance reflects it → issue a credit note →
balance reflects the credit.

## Do NOT

- Hardcode any Tunisian tax rate or fiscal rule without explicit user
  confirmation — leave `taxMinor` calculation configurable and gate
  production use behind `settings.invoicing.enabled`.
- Allow any edit path to a finalized invoice's totals/lines.
- Generate PDFs synchronously inside a request handler.
