// Windows printer discovery + raw ESC/POS dispatch. Same execFile-based
// PowerShell pattern as drawer.mjs's COM port detection — no npm
// dependencies (the bridge has none by design; see README.md).
//
// Security note: printer names and receipt bytes never get interpolated
// into a PowerShell *command string* — the list script is fully static,
// and the print script reads the printer name/file path via environment
// variables ($env:...), which PowerShell treats as plain data, never
// re-parsed as syntax. A printer named `x"; Remove-Item C:\ -Recurse; "`
// (or any receipt content — a product name, a customer name) cannot break
// out of the command this way.

import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const LIST_PRINTERS_SCRIPT = String.raw`
try {
  $printers = @(Get-Printer -ErrorAction Stop | Select-Object Name, PrinterStatus, Default)
  ,$printers | ConvertTo-Json -Compress
} catch {
  '[]'
}
`;

/** Sends a byte buffer to the Windows spooler with datatype "RAW" — the
 *  standard way to push raw ESC/POS bytes straight to a thermal printer
 *  with no driver-side reinterpretation and no print dialog. Adapted from
 *  Microsoft KB322091's C# RawPrinterHelper, via Add-Type so it needs
 *  nothing beyond what Windows/PowerShell already ships with. Printer name
 *  and file path arrive as environment variables, not string-interpolated.
 */
const RAW_PRINT_SCRIPT = String.raw`
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public class MzaliRawPrinter {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
    public class DOCINFOA {
        [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
        [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
        [MarshalAs(UnmanagedType.LPStr)] public string pDataType;
    }

    [DllImport("winspool.drv", EntryPoint = "OpenPrinterA", SetLastError = true, CharSet = CharSet.Ansi, ExactSpelling = true)]
    public static extern bool OpenPrinter(string szPrinter, out IntPtr hPrinter, IntPtr pd);
    [DllImport("winspool.drv", SetLastError = true, ExactSpelling = true)]
    public static extern bool ClosePrinter(IntPtr hPrinter);
    [DllImport("winspool.drv", EntryPoint = "StartDocPrinterA", SetLastError = true, CharSet = CharSet.Ansi, ExactSpelling = true)]
    public static extern bool StartDocPrinter(IntPtr hPrinter, int level, DOCINFOA di);
    [DllImport("winspool.drv", SetLastError = true, ExactSpelling = true)]
    public static extern bool EndDocPrinter(IntPtr hPrinter);
    [DllImport("winspool.drv", SetLastError = true, ExactSpelling = true)]
    public static extern bool StartPagePrinter(IntPtr hPrinter);
    [DllImport("winspool.drv", SetLastError = true, ExactSpelling = true)]
    public static extern bool EndPagePrinter(IntPtr hPrinter);
    [DllImport("winspool.drv", SetLastError = true, ExactSpelling = true)]
    public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, int dwCount, out int dwWritten);

    public static bool Send(string printerName, byte[] bytes) {
        IntPtr hPrinter;
        DOCINFOA di = new DOCINFOA();
        di.pDocName = "MZALI Receipt";
        di.pDataType = "RAW";
        if (!OpenPrinter(printerName, out hPrinter, IntPtr.Zero)) return false;
        try {
            if (!StartDocPrinter(hPrinter, 1, di)) return false;
            try {
                if (!StartPagePrinter(hPrinter)) return false;
                IntPtr unmanaged = Marshal.AllocHGlobal(bytes.Length);
                try {
                    Marshal.Copy(bytes, 0, unmanaged, bytes.Length);
                    int written;
                    if (!WritePrinter(hPrinter, unmanaged, bytes.Length, out written)) return false;
                    if (written != bytes.Length) return false;
                } finally {
                    Marshal.FreeHGlobal(unmanaged);
                }
                EndPagePrinter(hPrinter);
            } finally {
                EndDocPrinter(hPrinter);
            }
        } finally {
            ClosePrinter(hPrinter);
        }
        return true;
    }
}
"@ -ErrorAction Stop

$bytes = [System.IO.File]::ReadAllBytes($env:MZALI_PRINT_FILE)
$ok = [MzaliRawPrinter]::Send($env:MZALI_PRINTER_NAME, $bytes)
if (-not $ok) { throw "Envoi a l'imprimante refuse par Windows." }
'{"ok":true}'
`;

export async function listPrinters(deps = {}) {
  const exec = deps.execFileAsync ?? execFileAsync;
  const platform = deps.platform ?? process.platform;
  if (platform !== 'win32') return [];
  const { stdout } = await exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', LIST_PRINTERS_SCRIPT], {
    windowsHide: true,
    timeout: 8000,
  });
  return parsePrinterList(stdout);
}

export function parsePrinterList(stdout) {
  const trimmed = String(stdout ?? '').trim();
  if (!trimmed) return [];
  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return [];
  }
  const list = Array.isArray(parsed) ? parsed : [parsed];
  return list
    .filter((p) => p && typeof p === 'object' && typeof p.Name === 'string')
    .map((p) => ({
      name: p.Name,
      status: typeof p.PrinterStatus === 'string' ? p.PrinterStatus : 'Unknown',
      isDefault: Boolean(p.Default),
    }));
}

export async function getPrinterStatus(printerName, deps = {}) {
  if (!printerName) return { name: '', status: 'NotConfigured', isDefault: false };
  const printers = await listPrinters(deps);
  return printers.find((p) => p.name === printerName) ?? { name: printerName, status: 'NotFound', isDefault: false };
}

export async function printRaw(printerName, buffer, deps = {}) {
  const exec = deps.execFileAsync ?? execFileAsync;
  const write = deps.writeFile ?? writeFile;
  const remove = deps.unlink ?? unlink;
  const platform = deps.platform ?? process.platform;

  if (!printerName || !printerName.trim()) throw new Error('Aucune imprimante configurée pour ce terminal.');
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw new Error('Ticket vide — rien à imprimer.');
  if (buffer.length > 512 * 1024) throw new Error('Ticket trop volumineux.');
  if (platform !== 'win32') throw new Error("L'impression directe est disponible uniquement sous Windows.");

  const tempFile = join(tmpdir(), `mzali-print-${randomUUID()}.bin`);
  await write(tempFile, buffer);
  try {
    await exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', RAW_PRINT_SCRIPT], {
      windowsHide: true,
      timeout: 15000,
      env: { ...process.env, MZALI_PRINT_FILE: tempFile, MZALI_PRINTER_NAME: printerName },
    });
  } catch (error) {
    const stderr = error && typeof error === 'object' && 'stderr' in error ? String(error.stderr).trim() : '';
    throw new Error(stderr || "Échec de l'impression — vérifiez que l'imprimante est allumée et prête.");
  } finally {
    await remove(tempFile).catch(() => undefined);
  }
}
