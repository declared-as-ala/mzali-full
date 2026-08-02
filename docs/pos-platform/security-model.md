# Security Model

Covers master-prompt §42–§43 as additions to the existing auth system
(`current-state-audit.md` §5) — extends, does not replace.

## Reused as-is

JWT access tokens (15m) + rotating refresh tokens (30d, reuse-detection →
family revocation), Argon2id password hashing, `sessions` collection,
role/permission guards (`backend/src/auth/permissions.ts`,
`backend/src/auth/guards/permissions.guard.ts`). POS employee login is the
same `POST /api/v1/auth/login` endpoint every other console uses — no
parallel auth system.

## New: POS terminal binding

A POS terminal must be pre-approved before it can process sales — the
login screen authenticating an *employee* is necessary but not sufficient;
the *device* must also be recognized.

```typescript
// backend/src/pos/terminal.schema.ts
{
  terminalCode: string;           // human-readable, e.g. 'BOUTIQUE-CAISSE-1'
  name: string;
  locationId: string;             // ref locations, must be a STORE type
  registerId: string | null;      // ref cash_registers, assigned at setup
  active: boolean;
  lastSeenAt: Date | null;
  deviceFingerprint: string;      // generated client-side on first run, stored in localStorage
  approvedAt: Date | null;
  approvedBy: string | null;
}
```

Flow: on first run, the POS app generates a `deviceFingerprint`, shows a
"waiting for approval" screen with a short pairing code, and polls
`GET /api/v1/pos/terminals/pairing/:code`. An administrator approves it
from `app/mzali` (`POST /api/v1/admin/pos/terminals/:id/approve`). Once
approved, every subsequent POS API call includes the terminal's id (not
just the employee's JWT) via a request header
(`X-POS-Terminal: <terminalCode>`), and `PosTerminalGuard` rejects calls
from a terminal that's inactive, unapproved, or whose fingerprint doesn't
match the stored one — this is what makes "don't rely only on the POS URL
being secret" (master-prompt §42) actually true.

## New permissions

Additive to `backend/src/auth/permissions.ts`'s existing `ALL_PERMISSIONS`
list, following the same `resource.action` naming already used
(`customers.read`, `stats.read`, etc.):

```
pos.open_session   pos.close_session   pos.sell
pos.view_boutique_stock   pos.view_depot_stock
pos.apply_basic_discount   pos.apply_advanced_discount
pos.cancel_item   pos.cancel_sale
pos.refund   pos.exchange
pos.reprint_ticket   pos.open_cash_drawer
pos.view_reports   pos.request_transfer   pos.override_stock
inventory.view_cost   inventory.adjust   inventory.transfer_approve
purchasing.manage   invoicing.finalize   loyalty.adjust
```

Role presets extend `ROLE_PERMISSIONS` (same file): a new `cashier` role
gets the base `pos.*` set (sell, sessions, view both stocks, basic
discount, print); `store_manager` gets cashier's set plus approvals,
refunds, cancellations, transfer requests, cost visibility;
`super_admin`/`admin` already get everything via the existing `ALL`
wildcard, no change needed there. Enforced with `@RequirePermissions(...)`
guards exactly like every existing admin controller — never a
frontend-only check.

## Idempotency

POS sale creation and refund endpoints require an `Idempotency-Key` header
(same pattern already used for online-order checkout,
`backend/src/common/idempotency.interceptor.ts` if that's the existing
interceptor name — reuse it, don't reimplement). A duplicate submission
(network retry, double-tap on a slow connection) returns the original
sale, never creates a second one or double-deducts stock.

## Audit log entries (master-prompt §43)

New action types logged through the existing `AuditModule`
(`backend/src/audit/*`, already global per the original migration's
core/API module split — reused directly, no new module needed):

```
pos.session.open   pos.session.close
pos.sale.create   pos.sale.cancel   pos.sale.refund   pos.sale.exchange
pos.discount.override   pos.price.override   pos.cash_drawer.open
inventory.adjustment   inventory.transfer.create/approve/receive
purchasing.po.approve   purchasing.receipt.post
invoicing.finalize
loyalty.adjustment
employee.role_change
settings.change
```

Entry shape unchanged from the existing `audit_logs` collection: actor,
action, entity, before/after diff, reason, IP, user agent, timestamp — new
fields `locationId`/`terminalCode` added (nullable, populated only for
POS-originated actions) so a security review can filter "what happened at
BOUTIQUE-CAISSE-1 on date X" without cross-referencing sales separately.

## Never exposed publicly (unchanged from the original migration + explicit for POS)

MongoDB, Redis, MinIO console, internal worker endpoints, database
credentials, the printing-bridge's local auth token. Only the reverse
proxy is public — see `deployment-plan.md`.
