# MZALI USB cash-drawer bridge

This loopback-only Windows service opens the directly connected USB cash drawer.
It auto-detects the verified Prolific PL2303GL virtual serial device and sends one
`0x07` trigger byte at `9600 8-N-1` after a successful cash payment.

No printer, secret, URL, CORS, or POS hardware settings are required. On the
Windows cashier PC physically connected to the drawer, double-click:

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

The service listens only on the local PC. Because this zero-configuration mode
has no local secret, use it only on a dedicated, trusted cashier terminal.
