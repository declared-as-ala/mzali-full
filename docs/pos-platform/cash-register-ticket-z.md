# Fond de caisse and daily Ticket Z

## Audit of the previous implementation

- MongoDB `pos_cashier_sessions` already held `openingCashMinor`, terminal,
  cashier, opening/closing timestamps, running totals, and session Z snapshots.
  These business sessions are independent from JWT/refresh-token sessions.
- `pos_payments` already held one payment row per method, including split sales.
- `pos_cash_movements` only recorded manual ADD/REMOVE entries. Its writes and
  running-total updates were separate, nontransactional operations.
- Closing saved CLOSED first and generated Z afterward. A sale could race the
  close. Terminal uniqueness was a read-before-write check without a unique index.
- Cancellations restored inventory but did not refund payments or update cash.
  Sale edits could modify closed-session sales despite a comment saying otherwise.
- Session-specific X/Z existed; there was no persisted daily Z archive/PDF.

## Workflow

The dashboard's opening action checks the backend before entering the till.
An existing session resumes without another fund. Otherwise the opening dialog
accepts DT to three decimal places, including zero. The backend stores integer
millimes, writes OPENING_FUND, and never modifies the initial fund afterward.

The header displays separate **Fond** and **Caisse** values. The detail dialog
shows the cash components and opening date. It refreshes immediately after a
committed payment/edit, on window focus, and every 15 seconds. All amounts come
from the backend. Authentication refresh/logout does not close the register.

Expected cash = opening fund + cash payments + manual additions - cash refunds
- manual withdrawals. Card/bank/other payments never change physical cash.
Manual drawer opening continues through the hardware bridge and audit endpoint;
it creates no financial movement.

Closing requires an entered physical count (including explicit zero), shows the
difference, and accepts a note. CLOSED, the immutable session Z, and the CLOSING
ledger row commit together. Repeating the close returns its original result.

Admin **Point de vente → Sessions de caisse** provides session reports, the
movement journal, and permission-protected manual cash additions/withdrawals
with a mandatory reason. **Informations Caisse** shows live opening funds,
cash sales and expected cash. **Tickets Z** is organized by business day, with
date/period, terminal and cashier filters, session/sale drilldowns, finalization,
PDF download and printing through the browser PDF viewer.

## Business-day policy and immutable archives

- Timezone: `Africa/Tunis`. A session belongs to the date it was opened, even if
  resumed after midnight. The full opening/closing interval is displayed in the
  detail and PDF. This is a **cash-session business day**, not a calendar-day
  revenue report; calendar-day sales analytics remain in Informations Caisse.
- Session closure always freezes its individual Z. The consolidated day remains
  provisional until a manager clicks **Clôturer la journée** after all its
  sessions are closed. This avoids declaring the first cashier's close to be
  the final daily total while another cashier is still working.
- Finalization saves one `pos_daily_z` snapshot and deterministic unique number
  `Z-YYYYMMDD`. It serializes with session openings/closures through the same day
  document. A finalized day refuses new openings for that date.
- Funds and counted cash are **summed per session**. Reusing the same physical
  float across shifts therefore counts that float for each opening. These are
  explicitly labelled cumulative figures, not the store's single end-of-day
  drawer balance. Payment totals are net of refunds.
- Historical exports read only the archive, including merchant/cashier/terminal
  labels saved at closure. They do not query today's catalog/prices or use DOM.
- No endpoint rewrites a closed session's figures or a final daily snapshot.
  Manager review notes use the existing audited review action. Open-session
  sale edits create signed CORRECTION entries; post-close financial edits are
  rejected. There is no general-purpose historical financial override.

## Financial and concurrency boundaries

The existing sale idempotency key remains the authority. Sale, payments,
boutique stock, loyalty and CASH_SALE commit in the same transaction. A retry
returns the original sale; the unique cash operation key is additional defense.
Sale edits use a version/timestamp predicate and update only an OPEN session.
Cancellations are full refunds through original methods, with transactional
stock restoration, payment refund status, cash ledger and loyalty reversal.
Edits to loyalty-bearing sales require cancellation/recreation so points cannot
silently drift. A partial item-return workflow remains outside this change;
the existing sale-edit path records corrections, not a fabricated refund.

Cashiers can access only their own session on their current terminal. Managers
can access another cashier's session on that terminal and all Admin reports.
`pos.sessions.review` controls manual cash movements and daily finalization;
`pos.open_cash_drawer` continues to control only the physical drawer.

## Existing data and rollout

No historical financial totals are rewritten or guessed during startup.
Existing saved session Z values are reused for consolidation. Older Z records
lack merchant/receipt/name snapshots and separate refund-method details; absent
metadata remains unavailable, and original payment buckets are preserved. Do
not treat missing historic metadata as newly verified information.

New schemas add a partial unique index permitting only one OPEN session per
terminal and an operation-key index on cash movements. Startup waits for these
indexes; if legacy duplicate OPEN sessions exist, deployment must stop and a
manager must reconcile them through normal closing before retrying. Do not
delete duplicates or merge their totals automatically. Existing sessions can
continue; their pre-upgrade sales/openings do not gain invented ledger entries.

Changed areas: `backend/src/pos` schemas/services/controllers, the backend and
POS contracts, POS dashboard/open/close/header components, Admin reports and
their BFF routes. Authentication, pairing and hardware bridge implementation
remain separate from these accounting writes.

## Verification

Run backend `npm run typecheck`, `npm run lint`, `npm run check:contracts`,
`npm test -- --runInBand`; run `npx tsc --noEmit` in root and `pos`, plus POS
`npm run test:session` and `npm run bridge:test`.

The real transaction suite is opt-in and requires an **isolated disposable**
Mongo replica set database named `mzali_cash_test`, never the application DB:

```powershell
$env:POS_CASH_TEST_URI='mongodb://127.0.0.1:27119/mzali_cash_test?replicaSet=cash-test'
# From backend/:
npx jest --config jest.integration.config.cjs --runInBand test/integration/pos-cash.spec.ts
```

The suite clears only that disposable database's test collections. Set
`POS_CASH_PDF_QA=1` to also write `tmp/pdfs/ticket-z-qa.pdf` for visual inspection.
