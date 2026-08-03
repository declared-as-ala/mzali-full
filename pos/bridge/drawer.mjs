import { execFile } from 'node:child_process';
import { open } from 'node:fs/promises';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export const USB_DRAWER_TRIGGER = 0x07;

export function normalizeComPort(value) {
  const port = String(value || '').trim().toUpperCase();
  if (!/^COM[1-9]\d{0,2}$/.test(port)) throw new Error('Port USB du tiroir invalide.');
  return port;
}

export function shouldOpenDrawer(paymentMethods) {
  return Array.isArray(paymentMethods) && paymentMethods.includes('CASH');
}

const configuredPorts = new Set();

async function configureSerialPort(port) {
  if (configuredPorts.has(port)) return;
  await execFileAsync('mode.com', [`${port}:`, 'BAUD=9600', 'PARITY=n', 'DATA=8', 'STOP=1'], {
    windowsHide: true,
    timeout: 2000,
  });
  configuredPorts.add(port);
}

export async function sendUsbDrawerTrigger(serialPort, platform = process.platform) {
  const port = normalizeComPort(serialPort);
  if (platform !== 'win32') throw new Error('Le tiroir USB est disponible uniquement sous Windows.');
  await configureSerialPort(port);
  const handle = await open(`\\\\.\\${port}`, 'r+');
  try {
    const result = await handle.write(Buffer.from([USB_DRAWER_TRIGGER]));
    if (result.bytesWritten !== 1) throw new Error(`Le tiroir USB ne répond pas sur ${port}.`);
  } finally {
    await handle.close();
  }
}

export async function openCashDrawer(serialPort, sender = sendUsbDrawerTrigger) {
  const port = normalizeComPort(serialPort);
  await sender(port);
  return { serialPort: port, trigger: USB_DRAWER_TRIGGER };
}
