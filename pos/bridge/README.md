# MZALI local printer bridge

This loopback-only Windows service sends the validated ESC/POS cash-drawer
pulse through the receipt-printer queue. It never accepts arbitrary printer
bytes and is not part of the public Docker deployment.

No secret, URL, or CORS configuration is required. On the till computer, set
the thermal receipt printer as the Windows default printer, then run:

```powershell
node .\bridge\server.mjs
```

The POS connects automatically to `127.0.0.1:17890`. Run `npm run bridge:install`
once to start the bridge now and at every Windows login. Use a printer driver
that preserves RAW spool data; "generic/text only"
or the printer vendor's ESC/POS-compatible driver is usually required.

The service listens only on the local PC. Because this zero-configuration mode
has no local secret, only use it on a dedicated, trusted cashier terminal.
