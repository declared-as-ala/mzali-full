# Pointage / Payroll module — TODO

Isolated attendance + payroll system. Explicitly NOT sharing the existing
`backend/src/users/employee.schema.ts` Employee (login/POS accounts) — a
brand new, self-contained domain per the user's explicit instruction.
5 phases, tests/typecheck/lint/build after each. See `agent.md` for
general project conventions (still valid — money/timezone/module-split
patterns carry over).

## Design decisions (from the mandatory audit)

- New Mongo collections: `attendance_employees`, `attendance_sessions`,
  `payroll_payments`. Zero FK/reference to the existing `employees`
  collection.
- PIN hashing: argon2id via a dedicated `attendance-pin.ts` helper (same
  library as `auth/password.ts`, but not importing from it — full
  isolation). PIN uniqueness enforced at create/update time (plaintext
  compared against all active employees before hashing); at kiosk-auth
  time, iterate active employees and argon2-verify each (O(n), fine for
  a small boutique team — noted as a scale assumption).
- One-open-session guarantee: partial unique index
  `{employeeId:1}` where `status:'OPEN'`, mirroring
  `PosCashierSessionSchema`'s proven `one_open_session_per_terminal`
  pattern exactly.
- Business-day boundary: Africa/Tunis via the same
  `Intl.DateTimeFormat('en-CA', {timeZone:'Africa/Tunis'})` pattern as
  `cash-accounting.ts`'s `cashBusinessDate`.
- Money: integer millimes throughout (`hourlyRateMinor`, `baseAmountMinor`,
  etc.), reusing `common/money.ts` helpers — never floats.
- Stale/forgotten session (#20): if an employee's open session's
  business-date != today, kiosk refuses both clock-in and clock-out,
  shows "contact admin" message, flags the session `NEEDS_REVIEW`. Admin
  resolves via a correction (with required reason + audit entry).
- Permissions: `attendance.view`, `attendance.manage`, `attendance.correct`,
  `attendance.employees.manage`, `payroll.view`, `payroll.calculate`,
  `payroll.pay` — added to `ALL_PERMISSIONS`/`ROLE_PERMISSIONS`, gating the
  *admin* JWT users who manage Pointage. Named `attendance.employees.manage`
  (not bare `employees.manage`) to avoid colliding with the existing
  permission that manages login accounts.
- Routes: public kiosk at `/pointage` (service-token BFF, no JWT, no
  employee list shown pre-auth). Admin: `/admin/pointage` (dashboard +
  live present + drill-down profile at `/admin/pointage/[id]`),
  `/admin/pointage-employes` (isolated employee CRUD + PIN + rate),
  `/admin/paie` (payroll). Sidebar ÉQUIPE section gets "Personnel
  (Pointage)", "Pointage", "Paie" added alongside the existing "Employés".
- Payroll numbering: reuse `CountersService.next()` (same mechanism as
  `orderNumber`) for a new `payrollNumber` sequence → `PAY-00001` style.
- `PayrollPayment` is immutable after creation for this pass — a later
  "audited correction" capability (#26) is noted as a stretch goal, not
  silently promised as done.

## Phase 1 — Employees + PIN + /pointage — DONE

- [x] `AttendanceEmployee` schema (firstName, lastName, phone, email?,
      jobTitle, photoUrl?, pinHash, hourlyRateMinor, active, hiredAt?,
      notes?).
- [x] `attendance-pin.ts` — hash/verify, isolated from auth/password.ts.
- [x] `AttendanceSession` schema (employeeId, clockIn, clockOut,
      durationMinutes, status OPEN/CLOSED/NEEDS_REVIEW, businessDate,
      source?, payrollPaymentId?, correction sub-doc) + the partial
      unique `one_open_session_per_employee` index (mirrors
      PosCashierSessionSchema's proven pattern exactly).
- [x] `AttendanceService`: `identify()` state machine (ready_to_start /
      ready_to_end / blocked_stale_session / ok:false, with inactive and
      wrong-PIN both collapsing to the same generic outcome), `clockIn`/
      `clockOut` (transaction-wrapped, idempotent under a double-tap
      race — duplicate-key on clockIn returns the winning session rather
      than erroring; a clock-out repeated within 15s returns the
      just-closed session), PIN uniqueness enforced at create/reset time.
- [x] `AttendanceEmployeesAdminController` (CRUD + reset-pin,
      JWT+PermissionsGuard, `attendance.view`/`attendance.employees.manage`)
      + DTOs. Deactivate-not-delete on remove (#28).
- [x] `AttendancePublicController` (`/pointage/identify`, `/clock-in`,
      `/clock-out` — ServiceTokenGuard + per-IP RateLimitGuard, no JWT;
      failed PIN attempts audited without ever logging the PIN itself).
- [x] `attendance.module.ts` registered in `app.module.ts`; new backend-only
      contract file `backend/src/contracts/attendance.ts` (added to the
      barrel, not part of the mirrored-with-frontend set).
- [x] 7 new permissions in `permissions.ts` (`attendance.view/manage/
      correct`, `attendance.employees.manage`, `payroll.view/calculate/pay`)
      — auto-granted to super_admin/admin via `ALL`, not yet extended to
      other roles (no delegation scope specified).
- [x] BFF routes: `app/api/pointage/{identify,clock-in,clock-out}`
      (public, service-token), `app/api/admin/pointage-employes/*`
      (CRUD + reset-pin, bearer + withAuthRetry, no legacy-provider
      abstraction — this domain has no WooCommerce equivalent).
- [x] `app/pointage/page.tsx` — full kiosk UI: numeric keypad, live PIN
      dots, loading/ready-to-start/ready-to-end (live-ticking elapsed
      time)/blocked-stale/success-in/success-out screens, shake+clear on
      wrong PIN, 4s auto-reset after any terminal screen, manual "Nouveau
      pointage" reset.
- [x] `app/admin/pointage-employes/page.tsx` +
      `components/admin/PointageEmployesView.tsx` — list/search, create/
      edit modal (PIN only requested on create), reset-PIN modal
      (separate from edit, never shows the old PIN), activate/deactivate
      toggle.
- [x] Sidebar: "Personnel (Pointage)" added under Équipe, distinct from
      the existing "Employés" entry. "Pointage" (dashboard) and "Paie"
      intentionally NOT added yet — their pages don't exist until
      Phase 2/4, and a sidebar link to a 404 is worse than no link.
- [x] Backend unit tests (26 total across 3 new spec files): PIN hash/
      verify/format (`attendance-pin.spec.ts`), Africa/Tunis business-date
      boundary (`attendance-date.spec.ts`), identify state machine
      (no-match / inactive / ready_to_start / ready_to_end /
      blocked_stale_session incl. re-flag idempotency), clockIn (create,
      reject-while-open, duplicate-key-race idempotency), clockOut
      (close + duration calc, reject-with-no-session, duplicate-request
      idempotency), PIN-uniqueness on create/reset
      (`attendance.service.spec.ts`).
- [x] Backend: full suite 394/394, typecheck/lint clean. Frontend:
      typecheck/lint/production build all clean (`/pointage`,
      `/admin/pointage-employes`, and all 6 new BFF routes present in
      the build output).

### Known limitation carried into Phase 2+

`clockIn`/`clockOut`/`identify`'s transaction-dependent paths are unit
tested with a mocked `withTransaction` that runs the callback directly
(proves the business logic is correct in isolation) — not integration
tested against a real Mongo replica set, since none is running in this
environment. The partial unique index is the same mechanism already
proven live for POS cashier sessions, but a live concurrency test (two
genuinely parallel clock-ins for one employee) hasn't been run against
this specific collection yet. Flagging rather than claiming full
verification.

## Phase 2 — Attendance admin page + corrections

- [ ] `/admin/pointage` dashboard: top stats, table with filters, "who's
      present now" (polling or light live-update), status badges.
- [ ] Correction flow: required reason, audit entry, original values
      preserved.
- [ ] Multi-session-per-day support verified in the aggregation (daily
      total = sum of completed sessions, not "most recent").

## Phase 3 — Hours + payroll calculation

- [ ] Duration/hours aggregation service (today/week/month/custom,
      Africa/Tunis boundaries).
- [ ] Unpaid-hours computation (sessions with `payrollPaymentId: null`).
- [ ] Employee profile page: today/week/month/unpaid, hourly rate,
      estimated unpaid amount.

## Phase 4 — Payments + history + PDF

- [ ] `PayrollService.createPayment()` — snapshot rate, mark included
      sessions paid, immutable record, `CountersService` payroll number.
- [ ] `/admin/paie` dashboard + payment confirmation modal (bonus/
      deduction/method/note).
- [ ] Payment history / single-payment detail view.
- [ ] PDF payslip (reuse whatever PDF library the invoicing/loyalty-card
      features already use, not a new dependency).

## Phase 5 — Statistics/dashboard

- [ ] Top employees by hours (today/week/month/custom).
- [ ] Per-employee charts (hours by day, totals, averages, longest day).
- [ ] Payroll dashboard totals (paid/unpaid/total).

## Final pass

- [ ] Full backend suite + typecheck + lint.
- [ ] Frontend typecheck + lint + production build.
- [ ] Honest note on anything not verifiable in this environment (no
      browser, no live DB — same constraint as prior work in this repo).
