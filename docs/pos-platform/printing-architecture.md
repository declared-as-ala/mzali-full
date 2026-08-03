# Thermal ticket printing and cash drawer

The POS uses one persisted sale contract and one `TicketPreview` component for
both on-screen preview and 80 mm output. A ticket is reproducible from the sale
record; printing and drawer I/O happen only after the backend confirms that the
sale transaction committed.

## Receipt rendering

`pos/components/TicketPreview.tsx` renders the ticket. The HTML print fallback
uses `window.print()` and dedicated 80 mm print CSS. Automatic receipt printing
is a local terminal preference; when enabled it opens the browser print flow
once for the confirmed sale ID.

The browser remains the receipt renderer. Cash-drawer control is never sent
through a public backend endpoint.

## Local hardware bridge

The bridge in `pos/bridge/` runs on the Windows till computer, outside the
public Docker deployment. The browser connects directly to its loopback URL.

```text
POS browser
  -> authenticated loopback request
  -> local bridge
  -> selected Windows receipt-printer queue (RAW)
  -> ESC/POS drawer pulse
  -> drawer connected to the printer
```

Security properties:

- binds only to `127.0.0.1`;
- requires a local bearer token of at least 32 characters;
- accepts only explicitly configured POS origins;
- accepts fixed operations, never arbitrary printer bytes;
- never accepts a printer name from an opening request;
- clamps pin and pulse values before constructing the command;
- keeps technical hardware failures local and does not log credentials.

`/v1/sale-completed` evaluates the configured payment policy and deduplicates
requests by `sale:<saleId>`. `/v1/drawer/open` handles authorized manual and
hardware-test operations. Both call `openCashDrawer()`, which sends exactly one
validated `ESC p m t1 t2` command through the configured printer.

Default pulse:

```text
1B 70 00 19 FA
```

Pin 5 changes only `m` from `00` to `01`.

## Payment sequence

1. The cashier confirms payment.
2. The backend transaction validates stock and payment totals, creates the
   completed sale and payment rows, applies stock movements and session totals,
   and commits.
3. Only after the successful response does the browser notify the local bridge.
4. Cash opens by default. Card, bank transfer, and other methods do not, unless
   `openForAllPaymentMethods` is enabled.
5. The receipt print flow starts according to the local preference.
6. The completed-sale receipt is shown.

Bridge or printer failure never reverses the committed sale. The cashier sees a
non-blocking warning and, when authorized, a manual “Ouvrir le tiroir” action.
Payment, manual, and test outcomes are written to the central audit log through
backend endpoints that record events but cannot operate hardware.

## Windows driver requirement

The selected printer queue must preserve RAW data. Use the printer vendor’s
ESC/POS-compatible driver or a suitable Generic/Text Only queue. Some Windows
drivers consume or transform control bytes; in that case the queue/driver must
be corrected before the drawer can open reliably.
