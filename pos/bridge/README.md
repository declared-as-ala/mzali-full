# MZALI POS hardware bridge

This loopback-only Windows service gives the POS direct access to the till's
physical hardware: it opens the USB cash drawer (auto-detecting the verified
Prolific PL2303GL virtual serial device and sending one `0x07` trigger byte at
`9600 8-N-1` after a successful cash payment) and prints receipts straight to
a configured Windows printer with no browser print dialog (see "Receipt
printing" below).

No secret, URL, or CORS setting needs to be entered by hand to install it. On
the Windows cashier PC physically connected to the drawer/printer, double-click:

```text
INSTALL-ON-POS-PC.cmd
```

The one-click installer installs Node.js LTS through Windows Package Manager
when needed. It then copies the bridge to `%LOCALAPPDATA%\MZALI POS Bridge`,
starts it immediately, and configures automatic startup at every Windows login.

The equivalent command-line installation is:

```powershell
npm run bridge:install
```

The POS connects automatically to `127.0.0.1:17890`. For service diagnostics
only, the detected COM port can be overridden with `POS_DRAWER_COM_PORT`.

The boutique customer display is detected on `COM3` and stored as
`POS_VFD_COM_PORT` by the installer; the Prolific USB drawer port is excluded.

## Optional customer VFD

When a second serial customer display is connected, the bridge excludes the
drawer port and auto-detects the VFD COM port. It sends standard two-line,
20-character ASCII frames showing total, received amount, payment method, and
change. Deployment overrides are available for hardware that uses a nonstandard
assignment:

```powershell
$env:POS_VFD_COM_PORT = 'COM7'
$env:POS_VFD_BAUD_RATE = '9600'
```

If no VFD is connected, display updates are skipped without affecting payment
or drawer opening.

## Receipt printing

The bridge exposes `GET /v1/printers` (lists installed Windows printers),
`GET /v1/printer/status?name=...`, and `POST /v1/print` (renders an ESC/POS
ticket with `receipt.mjs` and sends it straight to the spooler via a raw
`RAW`-datatype Win32 print job — no `window.print()`, no print dialog). It
requires no configuration of its own: which printer to use, paper width,
copy count, and the auto-print/auto-drawer/logo/QR toggles are all chosen
from the POS app's own **Réglages** page and stored per terminal on the
backend, not on this PC. If **Réglages** reports "Pont matériel introuvable",
this service isn't installed or isn't running on the PC you're viewing that
page from — (re)run `INSTALL-ON-POS-PC.cmd` there and refresh the page.

The service listens only on the local PC. Because this zero-configuration mode
has no local secret, use it only on a dedicated, trusted cashier terminal.
