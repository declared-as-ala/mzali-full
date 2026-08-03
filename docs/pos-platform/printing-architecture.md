# Thermal ticket printing and USB cash drawer

The POS uses one persisted sale contract and one `TicketPreview` component for
both on-screen preview and 80 mm browser printing. Printing and drawer I/O happen
only after the backend confirms that the sale transaction committed.

## Direct USB drawer bridge

The bridge in `pos/bridge/` runs on the Windows till computer outside the public
deployment. The browser connects to its loopback URL. No hardware settings page
is required.

```text
Successful cash sale
  -> POS browser calls 127.0.0.1:17890
  -> bridge auto-detects Prolific PL2303GL virtual COM port
  -> configure 9600 baud, 8 data bits, no parity, 1 stop bit
  -> write one 0x07 trigger byte
  -> directly connected USB drawer opens
```

The bridge binds only to `127.0.0.1`, exposes fixed operations rather than
arbitrary serial data, and deduplicates automatic requests by sale ID. It has no
secret or origin setup and is intended for a dedicated trusted cashier PC.

## Payment sequence

1. The cashier confirms payment.
2. The backend validates and commits the sale, payments, stock movements, and
   session totals.
3. Only after success does the browser notify the local bridge.
4. A payment containing `CASH` sends exactly one direct USB trigger. Card, bank
   transfer, and other non-cash payments do not open the drawer.
5. The completed-sale receipt is shown and remains printable in the browser.

A bridge failure never reverses a committed sale. The cashier receives a clear
warning and can use the visible “Ouvrir le tiroir” action. Manual openings are
available to employee, cashier, store-manager, and admin roles and remain
recorded in the central audit log. Backend endpoints authorize and audit these
events but cannot directly operate local hardware.

## Customer VFD

The same local bridge auto-detects a second serial device while excluding the
cash drawer COM port. The payment modal sends best-effort, debounced 2×20 ASCII
frames containing `TOTAL` and either the received cash amount or payment method.
After the committed sale, the VFD shows `PAYE` and either `MONNAIE` or the final
payment method. VFD absence or failure never blocks checkout or drawer opening.

`POS_VFD_COM_PORT` and `POS_VFD_BAUD_RATE` provide deployment-only overrides;
there is intentionally no cashier-facing hardware settings screen.
