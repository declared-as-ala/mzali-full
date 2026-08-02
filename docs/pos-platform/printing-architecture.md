# Thermal Ticket Printing

Covers master-prompt §15. Fully net-new
(`current-state-audit.md` §7). HTML fallback ships in Sprint 2 (part of
the core sale flow); the local ESC/POS bridge is an **optional** Sprint 9
stretch per `PLAN.md` decision D6 — the POS must be fully usable without
it.

## Ticket content (80mm)

Boutique logo/name/address/phone/tax info (from `settings.company`, same
snapshot pattern as invoices' `companySnapshot`) · ticket number · date/
time · cashier · register · lines (product/variant/qty/unit price/
discount/line total) · subtotal/discount/tax/total · payment methods ·
cash received/change · customer name + loyalty card/points-earned/new-
balance when applicable · return policy text (settings-configurable) ·
thank-you message · QR/barcode encoding the ticket number for lookup.

Rendered from a single `TicketPreview` React component
(`pos/components/TicketPreview.tsx`) used for **both** the on-screen
preview and the print output — one template, not two, so the printed
ticket never drifts from what the cashier saw before printing.

## Strategy 1 — HTML print (ships first, Sprint 2)

`window.print()` on a dedicated `@media print` stylesheet sized for 80mm
stock, triggered from the ticket-preview modal after a sale completes.
Reprint (`GET /api/v1/pos/sales/:id/ticket`) re-renders the same component
from the persisted sale document — a ticket is always reproducible from
data, never a one-shot render that's lost if the browser tab closes.

Limitations accepted for Sprint 2: cashier must confirm the browser print
dialog (not silent), no automatic cash-drawer kick, printer must be set as
the OS default or selected manually. These are exactly the trade-offs
master-prompt §15 accepts for the fallback tier — acceptable for going
live, not acceptable as the permanent state if ticket volume is high.

## Strategy 2 — local printing bridge (optional, Sprint 9)

A small local service (Node.js, or a compiled Go/Rust binary if startup
time on boutique hardware matters) installed on the boutique's till
computer, **not part of the public Docker Compose stack** — it runs
outside the deployed infrastructure entirely, matching master-prompt §48's
"print-bridge as a separate local installation, not public
infrastructure."

```
pos (browser) ──HTTPS, local auth token──▶ print-bridge (localhost:PORT)
                                              │
                                              ▼
                                          ESC/POS over USB/network to the thermal printer
                                              │
                                              ▼
                                          optional cash-drawer kick (same ESC/POS command channel)
```

Bridge responsibilities: accept print requests **only** from the
approved POS origin (CORS locked to `https://pos.ahmedmzaliboutique.com`,
or `http://localhost:3001` in dev), require a local bearer token
(generated once at bridge install time, entered into POS settings, never
transmitted anywhere except this local link), validate the ticket payload
against a strict schema (reject anything that isn't a well-formed ticket —
never accept arbitrary ESC/POS byte sequences from the browser), log
printer errors to a local file (not shipped anywhere sensitive by
default), expose a `/status` endpoint the POS can poll for the
online/offline printer indicator.

Not built until Sprint 9, and only if the business's actual ticket volume
or "silent printing" requirement justifies the extra deployed component —
confirm with the user before starting this piece; it's real effort
(printer driver quirks, ESC/POS command-set differences between printer
models) that shouldn't be speculative.

## What's explicitly out of scope

- Cloud print services (Google Cloud Print-style relays) — unnecessary
  complexity for a single boutique.
- Printing from the admin console (invoices/quotes/POs print via PDF, see
  `invoicing-and-quotes.md` and `supplier-management.md` — a completely
  different rendering path, A4 not 80mm thermal).
