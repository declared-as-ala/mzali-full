import { spawn } from 'node:child_process';

export const DEFAULT_DRAWER_SETTINGS = Object.freeze({
  autoOpenEnabled: true,
  openOnCashPayment: true,
  openForAllPaymentMethods: false,
  drawerPin: 0,
  pulseOnMs: 25,
  pulseOffMs: 250,
  printerName: '',
  autoPrintReceipt: false,
});

export function normalizeDrawerSettings(value = {}) {
  const integer = (candidate, fallback) => {
    const parsed = Number(candidate);
    return Number.isInteger(parsed) ? Math.min(255, Math.max(1, parsed)) : fallback;
  };
  return {
    autoOpenEnabled: value.autoOpenEnabled !== false,
    openOnCashPayment: value.openOnCashPayment !== false,
    openForAllPaymentMethods: value.openForAllPaymentMethods === true,
    drawerPin: Number(value.drawerPin) === 1 ? 1 : 0,
    pulseOnMs: integer(value.pulseOnMs, DEFAULT_DRAWER_SETTINGS.pulseOnMs),
    pulseOffMs: integer(value.pulseOffMs, DEFAULT_DRAWER_SETTINGS.pulseOffMs),
    printerName: typeof value.printerName === 'string' ? value.printerName.trim().slice(0, 250) : '',
    autoPrintReceipt: value.autoPrintReceipt === true,
  };
}

export function buildDrawerPulse(settings) {
  const safe = normalizeDrawerSettings(settings);
  return Buffer.from([0x1b, 0x70, safe.drawerPin, safe.pulseOnMs, safe.pulseOffMs]);
}

export function shouldOpenDrawer(settings, paymentMethods) {
  const safe = normalizeDrawerSettings(settings);
  if (!safe.autoOpenEnabled) return false;
  if (safe.openForAllPaymentMethods) return true;
  return safe.openOnCashPayment && paymentMethods.includes('CASH');
}

const WINDOWS_RAW_PRINT_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
$printer = Get-CimInstance Win32_Printer | Where-Object { $_.Name -eq $env:MZALI_RAW_PRINTER } | Select-Object -First 1
if ($null -eq $printer) {
  throw "Imprimante introuvable: $env:MZALI_RAW_PRINTER"
}
if ($printer.WorkOffline -eq $true -or $printer.PrinterStatus -eq 7) {
  throw "L'imprimante $env:MZALI_RAW_PRINTER est hors connexion. Allumez-la et désactivez 'Utiliser l'imprimante hors connexion' dans Windows."
}
if ($printer.PrinterStatus -eq 6) {
  throw "L'imprimante $env:MZALI_RAW_PRINTER est en pause. Reprenez l'impression dans la file Windows."
}
if ($printer.Status -eq 'Error' -or $printer.ExtendedPrinterStatus -eq 9) {
  throw "Windows signale une erreur pour l'imprimante $env:MZALI_RAW_PRINTER. Vérifiez son alimentation, le câble USB et le port sélectionné."
}
Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;

public static class MzaliRawPrinter {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public class DOCINFO {
    [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
    [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
    [MarshalAs(UnmanagedType.LPWStr)] public string pDataType;
  }

  [DllImport("winspool.drv", SetLastError = true, CharSet = CharSet.Unicode)]
  static extern bool OpenPrinter(string name, out IntPtr handle, IntPtr defaults);
  [DllImport("winspool.drv", SetLastError = true)] static extern bool ClosePrinter(IntPtr handle);
  [DllImport("winspool.drv", SetLastError = true, CharSet = CharSet.Unicode)] static extern int StartDocPrinter(IntPtr handle, int level, [In] DOCINFO info);
  [DllImport("winspool.drv", SetLastError = true)] static extern bool EndDocPrinter(IntPtr handle);
  [DllImport("winspool.drv", SetLastError = true)] static extern bool StartPagePrinter(IntPtr handle);
  [DllImport("winspool.drv", SetLastError = true)] static extern bool EndPagePrinter(IntPtr handle);
  [DllImport("winspool.drv", SetLastError = true)] static extern bool WritePrinter(IntPtr handle, byte[] bytes, int count, out int written);

  public static void Send(string printerName, byte[] bytes) {
    IntPtr handle;
    if (!OpenPrinter(printerName, out handle, IntPtr.Zero)) throw new Win32Exception(Marshal.GetLastWin32Error());
    try {
      var info = new DOCINFO { pDocName = "MZALI Cash Drawer", pDataType = "RAW" };
      if (StartDocPrinter(handle, 1, info) == 0) throw new Win32Exception(Marshal.GetLastWin32Error());
      try {
        if (!StartPagePrinter(handle)) throw new Win32Exception(Marshal.GetLastWin32Error());
        try {
          int written;
          if (!WritePrinter(handle, bytes, bytes.Length, out written) || written != bytes.Length) throw new Win32Exception(Marshal.GetLastWin32Error());
        } finally { EndPagePrinter(handle); }
      } finally { EndDocPrinter(handle); }
    } finally { ClosePrinter(handle); }
  }
}
'@
[MzaliRawPrinter]::Send($env:MZALI_RAW_PRINTER, [Convert]::FromBase64String($env:MZALI_RAW_BYTES))
`;

export async function sendRawToPrinter(printerName, bytes, platform = process.platform) {
  if (!printerName) throw new Error('Aucune imprimante de tickets n’est sélectionnée.');
  if (platform !== 'win32') throw new Error('Le pont d’impression RAW est actuellement disponible uniquement sous Windows.');

  const encodedScript = Buffer.from(WINDOWS_RAW_PRINT_SCRIPT, 'utf16le').toString('base64');
  await new Promise((resolve, reject) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encodedScript], {
      windowsHide: true,
      env: {
        ...process.env,
        MZALI_RAW_PRINTER: printerName,
        MZALI_RAW_BYTES: bytes.toString('base64'),
      },
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let errorText = '';
    const timeout = setTimeout(() => child.kill(), 8000);
    child.stderr.on('data', (chunk) => { errorText += String(chunk).slice(0, 2000); });
    child.on('error', (error) => { clearTimeout(timeout); reject(error); });
    child.on('exit', (code) => {
      clearTimeout(timeout);
      if (code === 0) resolve();
      else reject(new Error(errorText.trim() || `Échec de l’impression RAW (code ${code ?? 'inconnu'}).`));
    });
  });
}

export async function openCashDrawer(options, rawSender = sendRawToPrinter) {
  const settings = normalizeDrawerSettings(options);
  const pulse = buildDrawerPulse(settings);
  await rawSender(settings.printerName, pulse);
  return { printerName: settings.printerName, drawerPin: settings.drawerPin, pulse: pulse.toString('hex') };
}
