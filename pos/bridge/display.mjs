import { execFile } from 'node:child_process';
import { open } from 'node:fs/promises';
import { promisify } from 'node:util';
import { normalizeComPort } from './drawer.mjs';

const execFileAsync = promisify(execFile);
const DISPLAY_WIDTH = 20;
const configuredPorts = new Set();
const writeQueues = new Map();

function ascii(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7e]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function fit(value) {
  return ascii(value).slice(0, DISPLAY_WIDTH).padEnd(DISPLAY_WIDTH, ' ');
}

function amount(minor) {
  return `${(Math.max(0, Number(minor) || 0) / 1000).toFixed(3)} DT`;
}

function methodLabel(method) {
  return ({ CASH: 'ESPECES', CARD: 'CARTE', BANK_TRANSFER: 'VIREMENT', OTHER: 'AUTRE' })[method] || 'PAIEMENT';
}

export function formatVfdLines(input) {
  const total = amount(input.totalMinor);
  if (input.phase === 'completed') {
    return [fit(`PAYE ${total}`), fit(input.method === 'CASH' ? `MONNAIE ${amount(input.changeMinor)}` : `MERCI - ${methodLabel(input.method)}`)];
  }
  return [fit(`TOTAL ${total}`), fit(input.method === 'CASH' ? `RECU ${amount(input.cashReceivedMinor)}` : `PAIEMENT ${methodLabel(input.method)}`)];
}

export function encodeVfdFrame(input) {
  const [line1, line2] = formatVfdLines(input);
  return Buffer.concat([Buffer.from([0x0c]), Buffer.from(`${line1}\r\n${line2}`, 'ascii')]);
}

async function configureVfdPort(port, baudRate) {
  const key = `${port}:${baudRate}`;
  if (configuredPorts.has(key)) return;
  await execFileAsync('mode.com', [`${port}:`, `BAUD=${baudRate}`, 'PARITY=n', 'DATA=8', 'STOP=1'], {
    windowsHide: true,
    timeout: 2000,
  });
  configuredPorts.add(key);
}

export async function writeVfdPayment(serialPort, input, options = {}) {
  const port = normalizeComPort(serialPort);
  const baudRate = Number(options.baudRate || 9600);
  const writer = options.writer;
  const frame = encodeVfdFrame(input);
  if (writer) return writer(port, frame);
  if (process.platform !== 'win32') throw new Error('Afficheur VFD disponible uniquement sous Windows.');
  const previous = writeQueues.get(port) || Promise.resolve();
  const queued = previous.catch(() => undefined).then(async () => {
    await configureVfdPort(port, baudRate);
    const handle = await open(`\\\\.\\${port}`, 'r+');
    try {
      const result = await handle.write(frame);
      if (result.bytesWritten !== frame.length) throw new Error(`Afficheur VFD sans réponse sur ${port}.`);
    } finally {
      await handle.close();
    }
    return { serialPort: port, bytesWritten: frame.length };
  });
  writeQueues.set(port, queued);
  try {
    return await queued;
  } finally {
    if (writeQueues.get(port) === queued) writeQueues.delete(port);
  }
}
