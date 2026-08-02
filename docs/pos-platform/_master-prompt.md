# Source master prompt (verbatim, for reference)

> Kept unedited as the source of truth for scope/intent. See `PLAN.md` for
> how this was reconciled against the actual codebase, and `tasks/pos-platform/`
> for the executable sprint breakdown. Where this document and `PLAN.md`
> disagree, `PLAN.md`'s "Decisions locked" section wins.

# MASTER PROMPT — MZALI E-COMMERCE, POS, INVENTORY, SUPPLIERS, INVOICING AND LOYALTY PLATFORM

Act as a senior software architect, NestJS expert, MongoDB database architect, Next.js engineer, POS system engineer, inventory-management specialist, DevOps engineer, security engineer and senior UI/UX designer.

We are extending the existing Mzali Boutique e-commerce platform into a complete unified commerce system.

The platform has three applications:

```text
Customer storefront:
https://ahmedmzaliboutique.com/

Administration dashboard:
https://admin.ahmedmzaliboutique.com/

Point-of-sale application:
https://pos.ahmedmzaliboutique.com/
```

The existing customer-facing Next.js website must remain visually and functionally stable.

The target architecture is:

* Next.js storefront
* Next.js administration dashboard
* Next.js POS application
* One central NestJS API
* MongoDB with Mongoose
* MongoDB replica set for transactions
* Redis
* BullMQ workers
* MinIO object storage
* Docker and Docker Compose
* CI/CD through GitHub Actions
* Centralized authentication, authorization and audit logs
* Real-time inventory synchronization

The storefront, administration dashboard and POS must not maintain separate product, stock, customer or order databases.

The NestJS backend and MongoDB database must be the single source of truth.

---

# 1. MAIN BUSINESS OBJECTIVE

Create a complete omnichannel retail system connecting: the online e-commerce website, the physical boutique, the main repository or depot, administration, suppliers, purchases, inventory, customers, loyalty cards, POS sales, online orders, quotes, invoices, payments, reports.

A product sold through the POS must immediately affect boutique stock.

An online order confirmed through the administration dashboard must affect depot stock.

When the stock available for online selling reaches zero, the relevant product variant must immediately appear as sold out on the customer website.

Every application must receive updated stock information from the same backend.

---

# 2. FIRST ACTION: INSPECT THE EXISTING PROJECT

Before making changes, inspect the complete existing project. Identify existing storefront architecture, admin dashboard, employee auth, WooCommerce integration, product types/variants/categories, order statuses, stock behavior, customer records, payment/delivery methods, invoice logic, reports, MinIO integration, Docker files, CI/CD, API clients, TXT/JSON employee storage, permissions, UI design system, ticket-printing code, barcode support, business rules.

Search the codebase for: `woocommerce`, `wc/v3`, `stock_quantity`, `manage_stock`, `orders`, `employees.txt`, `users.txt`, `fs.readFile`, `fs.writeFile`, `localStorage`, mock products/stock, hardcoded products/employees.

Do not start by rewriting everything. Create an audit and identify what can be reused safely.

Update or create: `docs/current-system-audit.md`, `docs/pos-architecture.md`, `docs/inventory-architecture.md`, `docs/stock-business-rules.md`, `docs/supplier-management.md`, `docs/invoicing-and-quotes.md`, `docs/loyalty-system.md`, `docs/printing-architecture.md`, `docs/security-model.md`, `docs/deployment-plan.md`.

After the audit, continue with the actual implementation.

---

# 3. UNIFIED ARCHITECTURE

Use a modular NestJS monolith. Do not create premature microservices.

Recommended applications: `apps/storefront`, `apps/admin`, `apps/pos`, `apps/api`, `apps/worker`.

Recommended shared packages: `packages/contracts`, `packages/api-client`, `packages/domain`, `packages/ui`, `packages/validation`, `packages/shared`.

Applications must communicate only through well-defined API contracts. Do not allow each frontend application to implement different interpretations of stock, prices, customers or orders. The backend must own all critical business calculations.

---

# 4. DOMAIN STRUCTURE

Create or extend NestJS modules for: auth, employees, roles, permissions, sessions, customers, loyalty, products, variants, categories, brands, pricing, promotions, warehouses, inventory, stock-movements, stock-reservations, stock-transfers, stocktakes, suppliers, purchase-orders, goods-receipts, carts, checkout, orders, pos, cash-registers, cash-sessions, payments, returns, refunds, exchanges, quotes, invoices, credit-notes, media, notifications, reports, analytics, audit-logs, settings, printing, health.

Controllers must not contain business logic. Use services for business operations and transactions. Use repositories for complex database access where helpful.

---

# 5. INVENTORY LOCATIONS

Create inventory locations. Initial locations: `DEPOT` (main warehouse/repository used for online orders and stock storage), `BOUTIQUE` (physical boutique used by the POS). The system must support additional boutiques or depots later.

```typescript
{
  publicId: string;
  code: string;
  name: string;
  type: 'WAREHOUSE' | 'STORE';
  address?: Address;
  active: boolean;
  isDefaultOnlineLocation: boolean;
  isDefaultPosLocation: boolean;
  allowOnlineFulfillment: boolean;
  allowPosSales: boolean;
  createdAt: Date;
  updatedAt: Date;
}
```

Do not hardcode business behavior only around two locations. Build the model so more boutiques can be added later.

---

# 6. STOCK ITEM MODEL

Stock must be managed per variant and location.

```typescript
{
  publicId: string;
  variantId: ObjectId;
  locationId: ObjectId;
  quantityOnHand: number;
  quantityReserved: number;
  quantityAvailable: number;
  reorderPoint: number;
  targetStockLevel?: number;
  lowStockThreshold?: number;
  averageCostMinor?: number;
  lastPurchaseCostMinor?: number;
  version: number;
  updatedAt: Date;
}
```

`quantityAvailable = quantityOnHand - quantityReserved`. Unique compound index on `variantId + locationId`. Do not maintain duplicate stock numbers inside products, POS records and orders. The stock-item collection is the current inventory state; the stock-movement collection is the permanent historical ledger.

---

# 7. STOCK MOVEMENT LEDGER

Every inventory modification must create an immutable stock movement.

Movement types: `INITIAL_IMPORT, PURCHASE_RECEIPT, POS_SALE, ONLINE_SALE, RETURN, REFUND_RESTOCK, EXCHANGE_OUT, EXCHANGE_IN, TRANSFER_OUT, TRANSFER_IN, MANUAL_ADJUSTMENT, DAMAGE, LOSS, STOCKTAKE_CORRECTION, RESERVATION, RESERVATION_RELEASE, ORDER_CANCELLATION, SUPPLIER_RETURN`.

```typescript
{
  publicId: string;
  movementType: StockMovementType;
  variantId: ObjectId;
  locationId: ObjectId;
  quantityDelta: number;
  quantityBefore: number;
  quantityAfter: number;
  reservedDelta?: number;
  reservedBefore?: number;
  reservedAfter?: number;
  sourceType: 'POS_SALE' | 'ONLINE_ORDER' | 'TRANSFER' | 'PURCHASE_ORDER' | 'STOCKTAKE' | 'MANUAL' | 'RETURN';
  sourceId?: ObjectId;
  reference?: string;
  reason?: string;
  unitCostMinor?: number;
  totalCostMinor?: number;
  performedByEmployeeId?: ObjectId;
  approvedByEmployeeId?: ObjectId;
  createdAt: Date;
}
```

Never allow an employee to update stock directly without a stock movement. Never delete stock movements. Corrections must be made through compensating movements.

---

# 8. STOCK SHOWN IN THE POS

For every searched or scanned product variant, the POS must clearly show boutique stock, depot stock, reserved online, online available. The cashier can normally sell only from boutique stock; depot stock is informational, with a permission-gated transfer-request flow. Do not allow a normal cashier to silently sell depot stock. Labels: Available, Low stock, Last article, Out of stock, Reserved, Transfer pending. Warn before exceeding boutique availability. Negative stock disabled by default, enable only via explicit permission, and audit any negative-stock sale prominently.

---

# 9. WEBSITE STOCK POLICY

Default: online website stock source = DEPOT, POS stock source = BOUTIQUE. Variant available online when `DEPOT quantityAvailable > 0`, sold out when `<= 0`. Product appears sold out only when all active variants are sold out; disable only unavailable variants otherwise. Build a configurable policy: `DEPOT_ONLY, BOUTIQUE_ONLY, COMBINED_LOCATIONS, PRIORITY_LOCATIONS` — do not activate combined stock by default.

---

# 10. ONLINE ORDER STOCK FLOW

**On order creation:** recalculate prices server-side, verify depot availability, create order pending, create stock reservations per item, increase `quantityReserved`, reduce `quantityAvailable`, set reservation expiration. Do not reduce `quantityOnHand` yet.

**On confirmation (one MongoDB transaction):** validate reservations active, reduce depot `quantityOnHand` and `quantityReserved`, create `ONLINE_SALE` movements, mark reservations consumed, update order status + history, trigger invoice/notification/analytics jobs.

**On cancellation before confirmation:** release reservation, reduce `quantityReserved`, restore `quantityAvailable`, record `RESERVATION_RELEASE` movement, update order history.

**Expired pending order:** BullMQ job releases reservations after a configurable period (admin-settings-driven). Do not leave abandoned orders reserving stock indefinitely.

---

# 11. POS SALE FLOW

Within one database transaction: validate cashier session, validate POS terminal, recalculate prices, verify boutique stock, create the sale, create sale lines with immutable product snapshots, reduce boutique stock, create `POS_SALE` movements, create payment records, update customer purchase history, apply/redeem loyalty points, create invoice/receipt data, add sale to cashier session, publish inventory-update events, queue ticket printing, queue optional customer notification. The operation must be idempotent — repeated submission must not duplicate sales or stock deductions.

---

# 12. POS APPLICATION UX

Build a premium, extremely fast, keyboard-friendly POS. Top bar: cashier, register, session status, date/time, connection state, notifications. Main area: search, barcode input, categories, product grid, variants, stock badges, favorites. Right area: cart, customer, loyalty, discounts, totals, payment button.

Requirements: barcode/SKU/name search, variant selection (size/color), product images, boutique+depot stock display, quick quantity edit, remove item, suspend/resume sale, customer selection, quick customer creation, anonymous customer, loyalty card, discounts with manager approval, notes, cash/card/mixed/other payment, change calculation, thermal printing, reprint, return/exchange, keyboard shortcuts, touchscreen-friendly, loading/error states, real-time stock update. Keep the frequent workflow fast — scan, pay, print without unnecessary modals.

---

# 13. CASH REGISTER AND CASHIER SESSIONS

Entities: POS Terminal, Cash Register, Cashier Session, Cash Movement, POS Sale, POS Payment. Cashier must open a session before selling (cashier, terminal, register, openingDate, openingCashAmount, note). Track during session: cash/card/mixed sales, refunds, cash added/removed, expenses, discounts, cancelled sales, reprints.

At closing calculate: expected cash, counted cash, cash difference, card total, other-payment totals, gross sales, refund total, discount total, net sales, transaction count, average basket. Require counted-cash entry; warn manager on difference.

Reports: X report (current, no close), Z report (final close), daily boutique report, register report, cashier report. Every session open/close is audited.

---

# 14. POS EMPLOYEE ROLES

Permissions: `pos.open_session, pos.close_session, pos.sell, pos.view_boutique_stock, pos.view_depot_stock, pos.apply_basic_discount, pos.apply_advanced_discount, pos.cancel_item, pos.cancel_sale, pos.refund, pos.exchange, pos.reprint_ticket, pos.open_cash_drawer, pos.view_reports, pos.request_transfer, pos.override_stock`.

Cashier: sell, select customers, use loyalty, view both stocks, small discounts, print tickets. Store Manager: all cashier perms + approve protected discounts, returns, cancel completed sales, manual drawer open, session reports, transfer request/approval, boutique adjustments. Administrator: full access. Enforce all permissions inside NestJS, not only frontend visibility.

---

# 15. THERMAL TICKET PRINTING

80mm tickets with: logo, boutique name/address/phone/tax info, ticket number, date/time, cashier, register, product lines (product/variant/qty/unit price/discount/line total), subtotal/discount/tax/total, payment methods, cash received/change, customer name, loyalty card/points earned/new balance, return policy, thank-you message, QR/barcode for lookup.

**Preferred strategy:** local printing bridge on the boutique computer; web POS sends a secure local print request; bridge talks ESC/POS to the printer. Benefits: silent printing, automatic printer selection, cash-drawer opening, better error detection, reliable reprint.

**Fallback:** HTML print view via browser dialog. Do not depend exclusively on this if automatic printing is required.

The bridge must: accept requests only from approved POS origins, require local auth token, validate payloads, reject arbitrary commands, log errors safely, support printer status when possible.

---

# 16. REAL-TIME SYNCHRONIZATION

On any stock change (POS sale, online confirmation, cancellation, return, transfer, receipt, adjustment, stocktake correction): publish `inventory.updated` domain event → invalidate Redis caches → notify connected POS clients → notify admin dashboard → revalidate storefront product data. Use WebSockets/SSE for admin+POS live updates, Redis pub/sub across multiple API instances. Database remains source of truth — WebSocket messages are notifications, not authoritative records.

---

# 17. STOCK TRANSFERS

Statuses: `DRAFT, REQUESTED, APPROVED, PREPARING, SHIPPED, PARTIALLY_RECEIVED, RECEIVED, CANCELLED, REJECTED`. Lines: variant, requested/approved/shipped/received/damaged/missing quantity.

Process: boutique manager requests → admin reviews/approves quantities → depot prepares → source stock marked → shipped → boutique receives/verifies → destination stock increased → differences recorded → closed. Matching `TRANSFER_OUT`/`TRANSFER_IN` movements. Do not increase boutique stock before receipt confirmation (unless business chooses otherwise). Generate a printable transfer note.

---

# 18. STOCKTAKE AND INVENTORY COUNT

Statuses: `DRAFT, IN_PROGRESS, COUNTED, REVIEW_REQUIRED, APPROVED, POSTED, CANCELLED`. Features: select location/categories, freeze/snapshot expected quantities, scan barcodes, enter counted quantity, show differences, blind-count mode (hide expected), require reason for large differences, manager approval, post correction movements, export report, audit employee actions. Never replace stock quantities directly without correction movements.

---

# 19. LOW STOCK AND REORDERING

Per variant+location: `reorderPoint, targetStockLevel, minimumStock, maximumStock, supplierLeadTime, preferredSupplier`. Alerts: low boutique/depot stock, out of stock, negative stock, high reservation level, slow-moving stock, no recent sales, excess stock.

Suggested quantity: `targetStockLevel - currentAvailableStock - pendingPurchaseQuantity + forecastedDemand`. Keep forecasting simple initially — no complex AI forecast before data quality is reliable.

---

# 20. SUPPLIER MANAGEMENT

```typescript
{
  publicId: string; code: string; companyName: string;
  contactName?: string; email?: string; phone?: string; secondaryPhone?: string;
  taxIdentifier?: string; registrationNumber?: string;
  billingAddress?: Address; warehouseAddress?: Address;
  paymentTermsDays?: number; preferredPaymentMethod?: string; currency: 'TND';
  leadTimeDays?: number; minimumOrderMinor?: number;
  status: 'ACTIVE' | 'INACTIVE' | 'BLOCKED';
  notes?: string; documentMediaIds?: ObjectId[];
  createdAt: Date; updatedAt: Date;
}
```

Features: list, details, contacts, products, price history, lead time, purchase history, outstanding POs, documents, notes, performance, return-to-supplier, balance/payment tracking. A variant may have multiple supplier offers: `supplierId, variantId, supplierSku, purchasePriceMinor, minimumOrderQuantity, packSize, leadTimeDays, preferred, lastPurchaseDate`.

---

# 21. PURCHASE ORDERS

Statuses: `DRAFT, SUBMITTED, CONFIRMED_BY_SUPPLIER, PARTIALLY_RECEIVED, RECEIVED, CANCELLED, CLOSED`.

Fields: `purchaseOrderNumber, supplier, destinationLocation, orderDate, expectedDeliveryDate, currency, lines, subtotal, discount, tax, shipping, total, paymentTerms, internalNotes, supplierNotes, statusHistory, createdBy, approvedBy`. Line: `variant, supplierSku, descriptionSnapshot, orderedQuantity, receivedQuantity, unitCostMinor, discountMinor, taxMinor, lineTotalMinor`.

Features: create manually or from low-stock suggestions, send/export PDF, approve, partial/complete receipt, supplier invoice reference, cost history, attach files, cancel remaining quantity, record differences.

---

# 22. GOODS RECEIPT

Do not increase stock on PO creation — only on receipt.

```text
goodsReceiptNumber, purchaseOrderId, supplierId, locationId, receivedDate, receivedBy, lines, attachments, notes, status
```

Line: `orderedQuantity, previouslyReceived, receivedNow, damagedQuantity, rejectedQuantity, acceptedQuantity, batchReference?, unitCost`.

On posting: increase location stock, create `PURCHASE_RECEIPT` movements, update PO received quantities, update last purchase cost (optionally weighted average), update supplier performance, record discrepancies.

---

# 23. PRODUCT COST AND MARGIN

Track `sellingPriceMinor, compareAtPriceMinor, lastPurchaseCostMinor, averageCostMinor`. Margin: `grossMarginMinor = netSellingPriceMinor - costMinor`, `grossMarginPercent = grossMarginMinor / netSellingPriceMinor`.

Reports: margin per product/category/POS-sale/online-order/day/month, discounts reducing margin, products sold below cost, supplier price evolution. Restrict cost visibility by permission — cashiers should not see costs by default.

---

# 24. RETURNS AND EXCHANGES

Statuses: `REQUESTED, APPROVED, RECEIVED, COMPLETED, REJECTED`. Disposition per item: `RESTOCK, DAMAGED, RETURN_TO_SUPPLIER, DISCARD, INSPECTION_REQUIRED`. Refund methods: cash, card, store credit, original method, no-refund-for-exchange-difference, mixed.

Return workflow: find original sale/ticket, confirm eligibility, select quantities, record reason/condition, calculate refund, reverse loyalty points, create refund payment, create stock movements, print return receipt, audit employee.

Exchange workflow: return original, add replacements, calculate difference, collect/refund difference, update stock for all affected variants, print exchange ticket.

---

# 25. QUOTES / DEVIS

Fields: `quoteNumber, customer, billingAddress, shippingAddress, issueDate, expiryDate, salesperson, lines, subtotal, discount, tax, shipping, total, notes, terms, status, version, createdBy, updatedBy`. Statuses: `DRAFT, SENT, VIEWED, ACCEPTED, REJECTED, EXPIRED, CONVERTED, CANCELLED`.

Features: create, add existing/custom lines, quantity/discount, customer, expiration, terms, generate PDF, send by email, duplicate, revise, accept/reject, convert to order/invoice, status history. Do not silently change an accepted quote — create revisions/versions.

---

# 26. INVOICES

Types: `SALES_INVOICE, POS_INVOICE, ONLINE_INVOICE, PROFORMA, CREDIT_NOTE`.

Fields: `invoiceNumber, invoiceType, customerSnapshot, companySnapshot, billingAddress, issueDate, dueDate, saleId, orderId, quoteId, lines, subtotalMinor, discountMinor, taxMinor, shippingMinor, totalMinor, paidMinor, balanceMinor, currency, paymentStatus, status, notes, terms, createdBy, finalizedAt`. Statuses: `DRAFT, FINALIZED, SENT, PARTIALLY_PAID, PAID, OVERDUE, CANCELLED, CREDITED`.

Requirements: configurable numbering (separate sequence per document type), immutable snapshots, PDF generation, email delivery, payment tracking incl. partial, remaining balance, print view, customer history, convert quote→invoice, invoice from POS sale/online order, credit notes for corrections, audit finalized documents. A finalized invoice is never silently edited — corrections go through a credit note or authorized workflow. All fiscal fields/numbering/tax rules verified with the business accountant before production activation.

---

# 27. CUSTOMER MANAGEMENT

One unified customer record shared by POS and website. Identified via account, email, phone, loyalty-card barcode/QR, customer number. Profile: name, email, phone, addresses, online account, loyalty account, purchase history (POS + online), returns, total spending, last purchase, average basket, preferred products, notes, marketing consent. Avoid duplicate customers on matching phone/email; implement a safe, permission-gated merge workflow — never auto-merge on name similarity alone.

---

# 28. LOYALTY CARD SYSTEM

```typescript
{
  publicId: string; customerId: ObjectId;
  cardNumber: string; qrCodeValue: string; barcodeValue: string;
  pointsBalance: number; lifetimePointsEarned: number; lifetimePointsRedeemed: number;
  tierId?: ObjectId; status: 'ACTIVE' | 'SUSPENDED' | 'EXPIRED';
  joinedAt: Date; lastActivityAt?: Date;
}
```

Immutable ledger, types: `EARN, REDEEM, REFUND_REVERSAL, MANUAL_ADJUSTMENT, BONUS, EXPIRATION, MIGRATION`. Fields: `customer, loyaltyAccount, pointsDelta, balanceBefore, balanceAfter, sourceType, sourceId, reason, performedBy, createdAt`. Never update points without a ledger transaction.

---

# 29. LOYALTY EARNING RULES

Configurable: points per TND spent, minimum purchase, points per product, bonus category/product, birthday bonus, new-customer bonus, campaign multiplier, tier multiplier. Do not hardcode one rule. Points earned only after POS payment completed or online order confirmed/delivered (configurable). Not earned on: cancelled sales, refunded value, gift-card purchase (configurable), excluded products, shipping (configurable). Reverse earned points on refund. No negative balance unless explicitly configured.

---

# 30. LOYALTY REDEMPTION

Cashier: scan card → find customer → view balance/reward value → ask redemption amount → apply discount → complete payment → deduct points inside the sale transaction → print new balance. Protections: max redemption per sale, minimum remaining cash payment, minimum points threshold, manager approval above a configured limit, PIN/OTP for high-value redemption, no redemption on anonymous customer, audit suspicious adjustments.

---

# 31. LOYALTY TIERS

Optional: `STANDARD, SILVER, GOLD, VIP`. Config per tier: `minimumAnnualSpend, minimumPoints, earningMultiplier, specialDiscount, birthdayReward, freeDelivery, earlyAccess`. Calculate tiers via a backend service + scheduled job, never in frontend code.

---

# 32. LOYALTY CARD UX

POS: search by phone, scan QR/barcode, display name/points/tier/points-earned-from-cart/points-available/last-purchases, quick account creation, reprint/regenerate card. Website: loyalty balance, history, current tier, progress to next tier, available rewards, card QR, points earned from online orders. Admin: search accounts, view ledger, adjust points with mandatory reason, suspend/replace card, configure earning/redemption/tiers, loyalty analytics.

---

# 33. POS REVENUE AND REPORTING

Dashboard metrics: revenue today/yesterday/week/month, by boutique/register/cashier/hour/payment method, ticket count, average basket, products/units sold, discount total, refund total, net revenue, gross margin, cash difference.

Reports: daily/monthly sales, cashier/register performance, payment-method breakdown, product/category/variant sales, hourly sales, discount report, refund report, return reasons, loyalty usage, new loyalty customers, sales by customer/channel, online vs POS, boutique vs depot stock, inventory valuation, low stock, dead stock, stock movement, supplier purchase history, profit and margin. All filters: date range, location, cashier, register, payment method, product, category, brand, channel. Real backend aggregation only — no mock chart data.

---

# 34. UNIFIED ADMIN DASHBOARD

Navigation: Dashboard; Commerce (online orders, POS sales, returns, refunds, customers, loyalty); Catalog (products, variants, categories, brands, pricing, promotions); Inventory (stock overview, depot/boutique stock, movements, transfers, transfer requests, stocktakes, adjustments, low-stock alerts); Purchasing (suppliers, supplier products, purchase orders, goods receipts, supplier returns); Documents (quotes, invoices, credit notes, payments); POS Management (terminals, registers, cashier sessions, X/Z reports, POS settings, ticket settings); Reports (revenue, profit, inventory, employees, suppliers, loyalty, channels); System (employees, roles, permissions, audit logs, settings, media). Professional SaaS-style UI: status badges, filters, saved views, export options.

---

# 35. STOCK MANAGEMENT UI/UX

Row: image, product, variant, SKU, barcode, depot on-hand/reserved/available, boutique on-hand/available, incoming purchase, incoming transfer, low-stock state, last movement. Actions: view movements, adjust stock, create/request transfer, start count, set reorder point, view supplier, view sales history. Views: all, depot, boutique, low stock, out of stock, negative stock, reserved, pending transfer, incoming purchase, slow moving, no movement, recently adjusted. Don't rely on color alone to communicate status.

---

# 36. PRODUCT VARIANTS AND BARCODES

Support size, color, material, other attributes; unique SKU + barcode per variant (optional auto-generated); multiple supplier references; purchase cost, selling price, compare-at price; boutique + depot stock. Barcode ops: generate/print labels, scan into POS/stocktake/goods-receipt/transfer prep/transfer receipt. Label template: product name, variant, price, barcode, SKU.

---

# 37. PROMOTIONS AND DISCOUNTS

Centralize pricing. Types: percentage, fixed, product-specific, category, buy-X-get-Y, quantity discount, loyalty-tier discount, POS-only, online-only, all-channel, date-limited. Every sale stores a snapshot: base price, applied promotion, manual discount, final price, responsible employee, manager approval when required. One backend pricing service — do not calculate promotions differently in POS vs storefront.

---

# 38. PAYMENT MANAGEMENT

Methods: `CASH, CARD, BANK_TRANSFER, PAYMENT_ON_DELIVERY, MIXED, OTHER`. Mixed example: total 120 TND = cash 50 + card 70, as separate payment records. Fields: `sale/order, method, amount, status, reference, receivedBy, receivedAt, refundedAmount, metadata`. Statuses: `PENDING, AUTHORIZED, PAID, PARTIALLY_REFUNDED, REFUNDED, FAILED, CANCELLED`. Order status and payment status are separate fields, never conflated.

---

# 39. RECEIPT, INVOICE AND DOCUMENT NUMBERING

Configurable sequences, e.g. `POS-2026-000001, WEB-2026-000001, DEV-2026-000001, FAC-2026-000001, AV-2026-000001, PO-2026-000001, GR-2026-000001, TR-2026-000001, INV-2026-000001`. Must be concurrency-safe — two simultaneous sales never get the same number. Never generate numbers from a collection count.

---

# 40. CACHING AND CONSISTENCY

Cache product lists, category trees, product details, public settings, search suggestions. Do not cache critical writable stock values for long. On inventory change: commit transaction → publish domain event → invalidate cache keys → notify subscribed apps → revalidate storefront pages. Always confirm stock from MongoDB at checkout/POS-payment time — a cached stock badge never authorizes a sale.

---

# 41. OFFLINE POS RECOMMENDATION

Ship the first version as online-only POS with a clear connection-state indicator. Add controlled offline functionality only after the online version is stable — never a naïve offline mode that can create uncontrolled negative stock. Safe offline phase (later): cache catalog + boutique stock snapshot, store pending local sales with temporary local IDs, sync on reconnect, detect conflicts, require manager review for oversold items, block complex refunds/loyalty redemption offline, clearly mark unsynchronized sales. A desktop wrapper may help with local printer/cash-drawer access, offline DB, autostart, kiosk mode — not part of the first migration unless connectivity requires it.

---

# 42. SECURITY

Employee auth, short-lived access tokens, refresh-token rotation, httpOnly secure cookies where appropriate, terminal authorization, register authorization, permission guards, rate limiting, DTO validation, audit logs, account lockout, session revocation, secure password reset, sensitive-field serialization, request correlation IDs, idempotency keys. Bind POS terminals to approved terminal records: `terminalCode, name, location, register, active, lastSeen, deviceFingerprint, approvedAt, approvedBy`. Don't rely on POS URL secrecy. Never expose MongoDB, Redis, MinIO console, internal worker endpoints, DB credentials, printing-bridge secret.

---

# 43. AUDIT LOGS

Audit: POS session open/close, sale creation/cancellation, refund, exchange, discount/price override, cash drawer opening, stock adjustment/transfer, PO approval, goods receipt, supplier changes, invoice finalization, loyalty adjustment, employee-role changes, settings changes. Entry: `actor, action, entity, before, after, reason, location, terminal, request ID, IP, user agent, timestamp`. Sanitize sensitive information.

---

# 44. MINIO STORAGE

Use for: product images/labels, supplier documents, PO/goods-receipt/quote/invoice/credit-note PDFs, ticket logos, customer documents, exports, employee avatars. MongoDB stores object metadata/keys only — never binary content. Secure lifecycle policies for temporary exports/uploads.

---

# 45. BACKGROUND JOBS

BullMQ for: ticket email delivery, invoice/quote/PO PDF generation, stock alerts, reservation expiration, loyalty tier calculation, loyalty point expiration, daily report generation, supplier notifications, cache invalidation, storefront revalidation, data exports, backups. Jobs idempotent and retryable; important failures visible to administrators.

---

# 46. API ENDPOINTS

```text
GET  /api/v1/inventory/variants/:variantId
GET  /api/v1/inventory/variants/:variantId/locations
GET  /api/v1/inventory/locations/:locationId
GET  /api/v1/inventory/movements
POST /api/v1/inventory/adjustments
POST /api/v1/inventory/transfers
POST /api/v1/inventory/transfers/:id/approve
POST /api/v1/inventory/transfers/:id/ship
POST /api/v1/inventory/transfers/:id/receive

POST /api/v1/pos/sessions/open
POST /api/v1/pos/sessions/:id/close
GET  /api/v1/pos/sessions/:id/report
POST /api/v1/pos/sales
POST /api/v1/pos/sales/:id/refund
POST /api/v1/pos/sales/:id/reprint
GET  /api/v1/pos/catalog
GET  /api/v1/pos/products/search
GET  /api/v1/pos/products/barcode/:barcode

GET  /api/v1/suppliers
POST /api/v1/suppliers
POST /api/v1/purchase-orders
POST /api/v1/purchase-orders/:id/approve
POST /api/v1/goods-receipts

GET  /api/v1/quotes
POST /api/v1/quotes
POST /api/v1/quotes/:id/convert-to-order
POST /api/v1/quotes/:id/convert-to-invoice

GET  /api/v1/invoices
POST /api/v1/invoices
POST /api/v1/invoices/:id/finalize
POST /api/v1/invoices/:id/send
POST /api/v1/invoices/:id/credit-note

GET  /api/v1/loyalty/accounts/:cardNumber
POST /api/v1/loyalty/accounts
POST /api/v1/loyalty/redeem
POST /api/v1/loyalty/adjustments

GET  /api/v1/reports/pos/daily
GET  /api/v1/reports/revenue
GET  /api/v1/reports/inventory
GET  /api/v1/reports/margins
```

DTO validation and permission guards on all protected endpoints.

---

# 47. DATABASE TRANSACTIONS

MongoDB transactions for: POS sale + boutique-stock deduction, online-order confirmation + depot-stock deduction, reservation create/release, refund + stock restoration, exchange, transfer receipt, goods receipt, loyalty redemption/reversal, cash-session close, invoice payment allocation. Transactions stay short — no external API calls or PDF generation inside them; commit first, then publish events / queue jobs.

---

# 48. DOCKER COMPOSE

Extend with: storefront, admin, pos, api, worker, mongodb, mongo-init, redis, minio, minio-init, reverse-proxy. Optional: mailpit (dev), print-bridge (separate local install, not public infra). Domains: `ahmedmzaliboutique.com`/`www.`, `admin.ahmedmzaliboutique.com`, `pos.ahmedmzaliboutique.com`, `api.ahmedmzaliboutique.com`, `media.ahmedmzaliboutique.com`. Only the reverse proxy is publicly exposed — never MongoDB, Redis or the MinIO console. Health checks on all important services.

---

# 49. CI/CD

Build/test storefront, admin, POS, API, worker, Docker images. Run formatting, linting, type checking, unit/integration/e2e tests, Docker builds, security scanning where available. Deploy: build immutable images → tag with commit SHA → push to registry → back up MongoDB → pull on server → run backward-compatible migrations → start services → check readiness → smoke test all domains → retain previous images for rollback. Never deploy using only `latest`.

---

# 50. TESTING

At minimum: POS sale decreases boutique stock only; confirmed online order decreases depot stock only; pending order reserves depot stock; cancelled order releases stock; sold-out variant becomes unavailable on the website; boutique cashier sees depot stock but can't sell it without permission; transfer adds stock only after receipt; PO doesn't increase stock, goods receipt does; duplicate POS request doesn't duplicate sale/stock; two cashiers can't oversell the same boutique item; two customers can't overorder the same depot item; refund restores stock per disposition; loyalty points earned once, refund reverses them; unauthorized cashier can't refund; cash closing detects differences; finalized invoice can't be silently edited; employee TXT storage stays gone; MinIO outage doesn't corrupt a completed sale; Redis outage doesn't duplicate stock changes.

---

# 51. ACCEPTANCE CRITERIA

(See `PLAN.md` §4 — copied there verbatim as the epic-level Definition of Done.)

---

# 52. IMPLEMENTATION PHASES

Phase 1: audit, shared contracts, inventory locations, stock items, stock movements, depot/boutique migration.
Phase 2: POS employee auth, terminal management, product search, barcode scanning, POS cart/sale, boutique stock deduction, ticket printing.
Phase 3: cashier sessions, payments, X/Z reports, daily revenue, refunds/exchanges.
Phase 4: online reservation system, order-confirmation transaction, website sold-out sync, real-time events, cache invalidation.
Phase 5: stock transfers, stocktakes, low-stock alerts, inventory reports.
Phase 6: suppliers, supplier-product relations, purchase orders, goods receipts, purchase-cost tracking.
Phase 7: quotes, invoices, credit notes, PDF generation, payment allocation.
Phase 8: loyalty accounts/cards/points/tiers, website loyalty page, POS redemption.
Phase 9: advanced reports, margin analysis, slow-moving stock, reorder suggestions, operational hardening.

(See `PLAN.md` §5 — mapped 1:1 to `tasks/pos-platform/SPRINT-01..09`.)

Complete and verify every phase before moving to the next one. Implement functional production-ready code, run tests, run builds and document every completed phase.
