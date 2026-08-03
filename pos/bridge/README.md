# MZALI local printer bridge

This loopback-only Windows service sends the validated ESC/POS cash-drawer
pulse through the configured receipt-printer queue. It never accepts arbitrary
printer bytes and is not part of the public Docker deployment.

Set these environment variables on the till computer:

```powershell
$env:POS_BRIDGE_TOKEN = '<random secret of at least 32 characters>'
$env:POS_BRIDGE_ALLOWED_ORIGINS = 'https://your-pos-origin.example'
$env:POS_BRIDGE_PORT = '17890'
node .\bridge\server.mjs
```

The same token and bridge URL are entered locally in the POS hardware settings
page. Use a printer driver that preserves RAW spool data; “generic/text only”
or the printer vendor's ESC/POS-compatible driver is usually required.
