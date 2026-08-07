import assert from 'node:assert/strict';
import test from 'node:test';
import { getPrinterStatus, listPrinters, parsePrinterList, printRaw } from './printer.mjs';

test('parsePrinterList() maps a PowerShell array result', () => {
  const stdout = JSON.stringify([
    { Name: 'EPSON TM-T20III', PrinterStatus: 'Normal', Default: true },
    { Name: 'Microsoft Print to PDF', PrinterStatus: 'Normal', Default: false },
  ]);
  assert.deepEqual(parsePrinterList(stdout), [
    { name: 'EPSON TM-T20III', status: 'Normal', isDefault: true },
    { name: 'Microsoft Print to PDF', status: 'Normal', isDefault: false },
  ]);
});

test('parsePrinterList() wraps a single-object PowerShell result (ConvertTo-Json unwraps 1-item arrays)', () => {
  const stdout = JSON.stringify({ Name: 'EPSON TM-T20III', PrinterStatus: 'Normal', Default: true });
  assert.deepEqual(parsePrinterList(stdout), [{ name: 'EPSON TM-T20III', status: 'Normal', isDefault: true }]);
});

test('parsePrinterList() returns an empty list for empty/malformed output instead of throwing', () => {
  assert.deepEqual(parsePrinterList(''), []);
  assert.deepEqual(parsePrinterList('   '), []);
  assert.deepEqual(parsePrinterList('not json'), []);
  assert.deepEqual(parsePrinterList('null'), []);
});

test('listPrinters() never shells out on a non-Windows platform', async () => {
  let called = false;
  const result = await listPrinters({ platform: 'linux', execFileAsync: async () => { called = true; return { stdout: '[]' }; } });
  assert.deepEqual(result, []);
  assert.equal(called, false);
});

test('listPrinters() parses the mocked PowerShell response on win32', async () => {
  const result = await listPrinters({
    platform: 'win32',
    execFileAsync: async () => ({ stdout: JSON.stringify([{ Name: 'Thermal80', PrinterStatus: 'Normal', Default: true }]) }),
  });
  assert.deepEqual(result, [{ name: 'Thermal80', status: 'Normal', isDefault: true }]);
});

test('getPrinterStatus() reports NotConfigured for an empty printer name without listing anything', async () => {
  let called = false;
  const status = await getPrinterStatus('', { platform: 'win32', execFileAsync: async () => { called = true; return { stdout: '[]' }; } });
  assert.equal(status.status, 'NotConfigured');
  assert.equal(called, false);
});

test('getPrinterStatus() reports NotFound when the configured printer no longer exists', async () => {
  const status = await getPrinterStatus('Ghost Printer', {
    platform: 'win32',
    execFileAsync: async () => ({ stdout: JSON.stringify([{ Name: 'Other', PrinterStatus: 'Normal', Default: true }]) }),
  });
  assert.equal(status.status, 'NotFound');
});

test('getPrinterStatus() finds the matching printer by name', async () => {
  const status = await getPrinterStatus('Thermal80', {
    platform: 'win32',
    execFileAsync: async () => ({ stdout: JSON.stringify([{ Name: 'Thermal80', PrinterStatus: 'PaperOut', Default: false }]) }),
  });
  assert.equal(status.status, 'PaperOut');
});

test('printRaw() rejects an empty printer name before touching the filesystem or shelling out', async () => {
  let wrote = false;
  await assert.rejects(
    () => printRaw('', Buffer.from('x'), { writeFile: async () => { wrote = true; }, execFileAsync: async () => ({ stdout: '' }) }),
    /imprimante/i,
  );
  assert.equal(wrote, false);
});

test('printRaw() rejects an empty receipt buffer', async () => {
  await assert.rejects(() => printRaw('Thermal80', Buffer.alloc(0)), /vide/i);
});

test('printRaw() rejects on a non-Windows platform without writing a temp file', async () => {
  let wrote = false;
  await assert.rejects(
    () => printRaw('Thermal80', Buffer.from('x'), { platform: 'linux', writeFile: async () => { wrote = true; } }),
    /Windows/i,
  );
  assert.equal(wrote, false);
});

test('printRaw() writes the buffer to a temp file, passes printer name + file path via env (never string-interpolated), and cleans up on success', async () => {
  const writes = [];
  const unlinks = [];
  let capturedEnv = null;
  await printRaw('Thermal80', Buffer.from('hello'), {
    platform: 'win32',
    writeFile: async (path, buf) => { writes.push({ path, buf }); },
    unlink: async (path) => { unlinks.push(path); },
    execFileAsync: async (_cmd, _args, opts) => { capturedEnv = opts.env; return { stdout: '{"ok":true}' }; },
  });
  assert.equal(writes.length, 1);
  assert.equal(writes[0].buf.toString(), 'hello');
  assert.equal(capturedEnv.MZALI_PRINTER_NAME, 'Thermal80');
  assert.equal(capturedEnv.MZALI_PRINT_FILE, writes[0].path);
  assert.deepEqual(unlinks, [writes[0].path]);
});

test('printRaw() still cleans up the temp file when the print itself fails', async () => {
  const unlinks = [];
  await assert.rejects(() => printRaw('Thermal80', Buffer.from('hello'), {
    platform: 'win32',
    writeFile: async () => {},
    unlink: async (path) => { unlinks.push(path); },
    execFileAsync: async () => { const e = new Error('boom'); e.stderr = 'Imprimante hors ligne.'; throw e; },
  }));
  assert.equal(unlinks.length, 1);
});

test('printRaw() surfaces the PowerShell stderr as the error message when available', async () => {
  await assert.rejects(
    () => printRaw('Thermal80', Buffer.from('hello'), {
      platform: 'win32',
      writeFile: async () => {},
      unlink: async () => {},
      execFileAsync: async () => { const e = new Error('boom'); e.stderr = 'Imprimante hors ligne.'; throw e; },
    }),
    /Imprimante hors ligne/,
  );
});
