# Loyalty System

Covers master-prompt §27–§32. Fully net-new
(`current-state-audit.md` §6) — delivered in `SPRINT-08-loyalty.md`.

## Relationship to the existing `customers` collection

`backend/src/customers/customer.schema.ts` already exists and is the
identity anchor (deduped by normalized phone, already used by online
orders and POS customer lookup from Sprint 2). Loyalty is a **separate**
collection referencing it by `customerId`, not new fields bolted onto
`Customer` — keeps the points ledger independently auditable and lets
loyalty be entirely absent for the majority of guest customers who never
join without touching the hot `customers` write path.

## Collections

### `loyalty_accounts`

```typescript
{
  customerId: string;             // unique — one account per customer
  cardNumber: string;              // unique, printable/scannable
  qrCodeValue: string;              // derived from cardNumber, cached for fast lookup
  barcodeValue: string;             // same
  pointsBalance: number;
  lifetimePointsEarned: number;
  lifetimePointsRedeemed: number;
  tierId: string | null;
  status: 'ACTIVE' | 'SUSPENDED' | 'EXPIRED';
  joinedAt: Date;
  lastActivityAt: Date | null;
}
```

### `loyalty_transactions` (immutable ledger)

```typescript
{
  customerId: string;
  loyaltyAccountId: string;
  type: 'EARN' | 'REDEEM' | 'REFUND_REVERSAL' | 'MANUAL_ADJUSTMENT' | 'BONUS' | 'EXPIRATION' | 'MIGRATION';
  pointsDelta: number;             // signed
  balanceBefore: number;
  balanceAfter: number;
  sourceType: 'POS_SALE' | 'ONLINE_ORDER' | 'REFUND' | 'MANUAL' | 'CAMPAIGN';
  sourceId: string | null;
  reason: string | null;           // required for MANUAL_ADJUSTMENT
  performedBy: string | null;      // employee id, null for system-generated EARN
  createdAt: Date;
}
```

`loyalty_accounts.pointsBalance` is a denormalized running total —
**every** write to it happens inside the same transaction as the
corresponding `loyalty_transactions` insert (`LoyaltyLedgerService.apply()`
is the single call site, same pattern as `StockLedgerService`). No
controller or script ever `$inc`s `pointsBalance` directly.

### `loyalty_tiers`

```typescript
{
  code: 'STANDARD' | 'SILVER' | 'GOLD' | 'VIP';
  minimumAnnualSpendMinor: number | null;
  minimumPoints: number | null;
  earningMultiplier: number;       // 1.0 = no bonus
  specialDiscountPercent: number | null;
  birthdayReward: string | null;
  freeDelivery: boolean;
  earlyAccess: boolean;
}
```

## Earning rules (master-prompt §29)

Configurable in `settings.loyalty`:

```typescript
{
  pointsPerDinarSpent: number;
  minimumPurchaseMinor: number;
  bonusCategories: { categoryId: string; multiplier: number }[];
  bonusProducts: { productId: string; multiplier: number }[];
  birthdayBonusPoints: number;
  newCustomerBonusPoints: number;
  earnOnOrderStatus: 'confirme' | 'completed' | 'delivered';  // when online points post
  excludeShippingFromEarning: boolean;
  excludedProductIds: string[];
}
```

Earning posts (`type: 'EARN'`) only when:

- A POS sale completes payment (same transaction as the `pos_sale` stock
  movement — one commit, both side effects).
- An online order reaches `settings.loyalty.earnOnOrderStatus` — hooked
  into the existing `OrderStatusService` transition handler (the same
  place `stockEffectForStatus` already runs), not a new polling job.

Never earned on cancelled/refunded value, gift-card lines (if a future
gift-card feature exists), excluded products/categories, or shipping when
configured. Refund of a sale that already earned points creates a
`REFUND_REVERSAL` transaction for the proportional points, in the same
transaction as the refund's stock movement.

## Redemption (master-prompt §30)

`POST /api/v1/pos/loyalty/redeem` (also callable from the checkout flow
for online redemption if the business wants that later — not required for
Sprint 8, the master prompt's redemption flow is POS-first). Guards,
enforced server-side regardless of what the UI shows:

- `maxRedemptionPercentOfSale` (settings) — can't zero out a sale with
  points.
- `minimumPointsToRedeem` — no micro-redemptions.
- `managerApprovalAboveMinor` — redemptions past a configured discount
  value require a second employee's PIN (reuses the existing manager-
  approval pattern already used for discount overrides, see
  `pos-architecture.md`).
- No redemption on an anonymous/no-customer sale.
- Redemption amount deducted from `pointsBalance` inside the same sale
  transaction that applies the resulting discount to the sale total — a
  sale is never left in a state where points were deducted but the
  discount didn't apply, or vice versa.

## Tiers (master-prompt §31)

Evaluated by a scheduled BullMQ job (`loyalty.evaluate-tiers`, nightly),
never computed ad hoc in the frontend. The job reads each account's
trailing-12-month spend (from `loyalty_transactions` `EARN` sourceType
aggregation, or directly from `customers.totalSpentMinor` if that's
accurate enough — confirm at Sprint 8 kickoff since that field currently
aggregates *all-time* spend, not trailing-12-month) and
`lifetimePointsEarned`, and updates `tierId` when thresholds are crossed,
writing a `BONUS` transaction if the new tier grants an immediate
point bonus.

## UX surfaces (master-prompt §32)

- **POS**: customer panel (already scaffolded in Sprint 2, see
  `pos-architecture.md`) gains balance/tier/points-earned-this-cart/
  points-available-to-redeem once this module ships; quick account
  creation reuses the existing quick-customer-create flow, layering a
  `POST /api/v1/loyalty/accounts` call after the customer is created.
- **Storefront**: a new `/mon-compte/fidelite`-style page (exact route TBD
  at Sprint 8 — the storefront currently has no customer-account area at
  all, since checkout is guest-only per the original migration's D2
  "customer accounts DEFERRED (schema-ready only)" — this is the first
  feature that actually needs one. Minimum viable: a phone-number +
  card-number lookup page, not a full account system, unless the user
  wants the fuller account system built now).
- **Admin**: `app/mzali/loyalty` — search accounts, view ledger, adjust
  points (mandatory reason, same UX pattern as the existing stock manual-
  adjustment drawer), suspend/replace card, configure earning/redemption/
  tiers as a settings form.

## Open question for Sprint 8 kickoff

The storefront currently has no logged-in customer concept
(`current-state-audit.md` §6). A full "customer account" system (login,
order history, saved addresses) is a meaningfully larger scope than
"look up my loyalty card" — flag this to the user before Sprint 8 starts
so the storefront-facing piece is scoped deliberately rather than
assumed.
