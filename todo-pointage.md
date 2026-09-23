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

## Phase 2 — Attendance admin page + corrections — DONE

- [x] `AttendanceStatsService`: `dashboard()` (present-now count, live
      elapsed minutes for open sessions folded into "hours today",
      distinct employees clocked today, open/needs-review count),
      `listSessions()` (paginated, filtered by employeeId/status/date
      range, employee names resolved), `correctSession()` (required
      non-empty reason, original clockIn/clockOut preserved in
      `correction`, blocks correcting an already-paid session, rejects
      clockOut <= clockIn, audit-logged with before/after, resolves
      NEEDS_REVIEW back to CLOSED the same way as a normal correction).
- [x] `AttendanceAdminController` (`admin/attendance/*` — dashboard,
      sessions, employees/:id/summary, employees/:id/daily,
      top-employees, sessions/:id/correct — `attendance.view` /
      `attendance.correct`).
- [x] `/admin/pointage` dashboard (`PointageDashboardView.tsx`): stat
      cards, "Présents actuellement" live list (30s poll), sessions
      table with status/date-range filters, correction modal
      (datetime-local inputs + required reason).
- [x] Multi-session-per-day: `minutesInRange()` sums `durationMinutes`
      across all CLOSED sessions in range (not "most recent"), plus
      live-elapsed time for any still-OPEN session in range.
- [x] `attendance-stats.service.spec.ts` — 21 tests (dashboard,
      listSessions, employeeSummary, topEmployees, dailyBreakdown,
      resolvePreset, correctSession incl. paid-session guard and
      NEEDS_REVIEW resolution).

## Phase 3 — Hours + payroll calculation — DONE

- [x] `attendance-date.ts` extended: `tunisStartOfWeek()`,
      `tunisStartOfMonth()`, `tunisToday()` (Africa/Tunis calendar
      arithmetic, calendar-as-UTC trick to avoid re-deriving the offset
      by hand) — 6 new tests in `attendance-date.spec.ts` (weekday
      rollback across Sunday, month/year boundaries).
- [x] `AttendanceStatsService.employeeSummary()` — today/week/month
      minutes via `minutesInRange`, takes unpaid/paid figures from
      `PayrollService` (kept as separate services; the admin controller
      composes them).
- [x] `/admin/pointage/[id]` employee profile page
      (`PointageEmployeeProfileView.tsx`): today/week/month/unpaid
      hours, unpaid amount, total paid, daily-hours bar breakdown with
      today/week/month toggle.

## Phase 4 — Payments + history + PDF — DONE

- [x] `payroll-payment.schema.ts` — immutable `PayrollPayment` (rate
      snapshot, base/bonus/deduction/final amounts, sessionIds covered,
      payrollNumber via `CountersService`).
- [x] `PayrollService`: `unpaidSummary()` (per-employee unpaid minutes/
      amount at current rate, active or not — a former employee still
      gets paid for time worked), `createPayment()` (transaction-wrapped:
      creates the payment + stamps every covered session's
      `payrollPaymentId` atomically; rejects a negative bonus/deduction
      and a negative final amount; rejects if there are no unpaid closed
      sessions), `listPayments()`, `getPayment()`, `totalPaidForEmployee()`,
      `summary()` (all-time paid total + payment count + current unpaid
      total, for the Paie dashboard's headline cards).
- [x] `PayrollAdminController` (`admin/payroll/*` — unpaid, summary,
      employees/:id/pay, payments, payments/:id, payments/:id/pdf —
      `payroll.view` / `payroll.pay`).
- [x] `payslip-pdf.ts` (pdfkit, same visual language as
      `ticket-z-pdf.ts`) + PDF route streamed through the BFF
      (`app/api/admin/payroll/[[...path]]/route.ts`, inline/attachment
      via `?download=1`, mirrors the tickets-z proxy pattern).
- [x] `/admin/paie` (`PaieView.tsx`): paid/unpaid/payment-count stat
      cards, unpaid-hours table with a "Payer" action, pay modal
      (bonus/deduction/method/note, live final-amount preview, blocks a
      negative final amount client-side too), payment history table
      with a PDF download link per row.
- [x] `payroll.service.spec.ts` — 12 tests (unpaidSummary, createPayment
      incl. the transaction/audit/negative-amount/no-unpaid-hours paths,
      summary, listPayments/getPayment).

## Phase 5 — Statistics/dashboard — DONE

- [x] `AttendanceStatsService.topEmployees()` — ranked by summed CLOSED-
      session minutes in a date range, never by salary (see design
      decision #23 from the original spec). Surfaced as a "Meilleurs
      employés" panel on `/admin/pointage` with a today/week/month
      toggle, linking each row to its employee profile.
- [x] `AttendanceStatsService.dailyBreakdown()` — per-employee
      date-ordered minutes, rendered as a horizontal bar list (not a
      chart library — consistent with keeping this isolated domain
      dependency-light) on the employee profile page.
- [x] `PayrollService.summary()` → Paie dashboard's paid/unpaid/total
      stat cards (see Phase 4).

## Final pass — DONE

- [x] Full backend suite: 427/427 passing (63 attendance-specific:
      attendance-pin 14, attendance-date 8, attendance.service 16,
      attendance-stats.service 21, payroll.service 14). Backend
      typecheck and lint both clean.
- [x] Frontend typecheck, lint, and `npm run build` all clean —
      `/admin/pointage`, `/admin/pointage/[id]`, `/admin/paie`, and the
      `/api/admin/attendance/[[...path]]` + `/api/admin/payroll/[[...path]]`
      BFF routes all present in the build output.
- [x] Sidebar: "Pointage" and "Paie" added under Équipe (previously
      deferred — their pages now exist).

### Known limitations (honest, not fixed in this pass)

- Same as Phase 1: `createPayment()`'s transaction (create payment +
  stamp N sessions atomically) is unit-tested with a mocked
  `withTransaction`, not against a live Mongo replica set (none running
  in this environment) — proves the business logic, not real
  cross-process atomicity under concurrent payment attempts for the same
  employee.
- No browser was available to click through the new UI — verified via
  typecheck/lint/build + backend unit tests only, same constraint noted
  throughout this repo's session history.
- Daily-hours visualization is a plain bar list, not a chart library
  (recharts is already a dependency elsewhere in admin, e.g.
  `PosAnalyticsView.tsx`, but wasn't pulled in here to keep this new
  domain's frontend footprint minimal — an easy upgrade later if wanted).
- `PayrollPayment` correction/void capability was explicitly out of scope
  for this pass (see the original design decision) — a payment is
  permanent once created.
