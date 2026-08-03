import { timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { openCashDrawer, shouldOpenDrawer } from './drawer.mjs';
import { createRequestDeduplicator } from './dedupe.mjs';
import { readSettings, saveSettings } from './settings.mjs';

const execFileAsync = promisify(execFile);
const host = '127.0.0.1';
const port = Number(process.env.POS_BRIDGE_PORT || 17890);
const token = process.env.POS_BRIDGE_TOKEN || '';
const allowedOrigins = new Set((process.env.POS_BRIDGE_ALLOWED_ORIGINS || 'http://localhost:3001,http://127.0.0.1:3001')
  .split(',').map((value) => value.trim()).filter(Boolean));
const saleOnce = createRequestDeduplicator(undefined, { retainFailures: true });
const manualOnce = createRequestDeduplicator();

if (token.length < 32) {
  console.error('POS_BRIDGE_TOKEN doit contenir au moins 32 caractères. Le pont ne démarrera pas sans secret local fort.');
  process.exit(1);
}

function json(response, status, body, origin) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...(origin ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {}),
  });
  response.end(JSON.stringify(body));
}

function authorized(request) {
  const supplied = request.headers.authorization?.replace(/^Bearer\s+/i, '') || '';
  const expectedBuffer = Buffer.from(token);
  const suppliedBuffer = Buffer.from(supplied);
  return expectedBuffer.length === suppliedBuffer.length && timingSafeEqual(expectedBuffer, suppliedBuffer);
}

async function body(request) {
  let raw = '';
  for await (const chunk of request) {
    raw += chunk;
    if (raw.length > 16_384) throw new Error('Payload trop volumineux.');
  }
  return raw ? JSON.parse(raw) : {};
}

async function listWindowsPrinters() {
  if (process.platform !== 'win32') return [];
  const command = 'Get-Printer | Select-Object -ExpandProperty Name | ConvertTo-Json -Compress';
  const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { windowsHide: true, timeout: 8000 });
  const parsed = stdout.trim() ? JSON.parse(stdout) : [];
  return (Array.isArray(parsed) ? parsed : [parsed]).filter((value) => typeof value === 'string');
}

const server = createServer(async (request, response) => {
  const origin = request.headers.origin || '';
  if (!allowedOrigins.has(origin)) return json(response, 403, { ok: false, error: 'Origine POS non autorisée.' });
  if (request.method === 'OPTIONS') {
    response.writeHead(204, {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Headers': 'authorization, content-type',
      'Access-Control-Allow-Methods': 'GET, PUT, POST, OPTIONS',
      'Access-Control-Max-Age': '600',
      Vary: 'Origin',
    });
    return response.end();
  }
  if (!authorized(request)) return json(response, 401, { ok: false, error: 'Authentification locale invalide.' }, origin);

  try {
    const url = new URL(request.url || '/', `http://${host}:${port}`);
    if (request.method === 'GET' && url.pathname === '/v1/health') {
      return json(response, 200, { ok: true, platform: process.platform }, origin);
    }
    if (request.method === 'GET' && url.pathname === '/v1/settings') {
      return json(response, 200, { ok: true, settings: await readSettings() }, origin);
    }
    if (request.method === 'PUT' && url.pathname === '/v1/settings') {
      return json(response, 200, { ok: true, settings: await saveSettings(await body(request)) }, origin);
    }
    if (request.method === 'GET' && url.pathname === '/v1/printers') {
      return json(response, 200, { ok: true, printers: await listWindowsPrinters() }, origin);
    }
    if (request.method === 'POST' && url.pathname === '/v1/sale-completed') {
      const input = await body(request);
      const requestId = String(input.requestId || '').slice(0, 200);
      const saleId = String(input.saleId || '').slice(0, 100);
      const paymentMethods = Array.isArray(input.paymentMethods)
        ? input.paymentMethods.filter((method) => ['CASH', 'CARD', 'BANK_TRANSFER', 'OTHER'].includes(method))
        : [];
      if (!requestId || !saleId || paymentMethods.length === 0) throw new Error('Requête de vente invalide.');
      const settings = await readSettings();
      const drawerAttempted = shouldOpenDrawer(settings, paymentMethods);
      const result = await saleOnce(requestId, async () => {
        if (!drawerAttempted) return { ok: true, drawerAttempted: false, drawerOpened: false, autoPrintReceipt: settings.autoPrintReceipt };
        const drawer = await openCashDrawer(settings);
        console.info(`[drawer] Vente ${saleId}: ouverture envoyée à ${drawer.printerName}`);
        return { ok: true, drawerAttempted: true, drawerOpened: true, autoPrintReceipt: settings.autoPrintReceipt };
      });
      return json(response, 200, result, origin);
    }
    if (request.method === 'POST' && url.pathname === '/v1/drawer/open') {
      const input = await body(request);
      const requestId = String(input.requestId || '').slice(0, 200);
      const reason = input.reason === 'test' ? 'test' : 'manual';
      if (!requestId) throw new Error('Identifiant de requête manquant.');
      const settings = await readSettings();
      const result = await manualOnce(requestId, async () => {
        const drawer = await openCashDrawer(settings);
        console.info(`[drawer] Ouverture ${reason} envoyée à ${drawer.printerName}`);
        return { ok: true, drawerAttempted: true, drawerOpened: true };
      });
      return json(response, 200, result, origin);
    }
    return json(response, 404, { ok: false, error: 'Opération locale inconnue.' }, origin);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur matérielle locale.';
    console.error(`[bridge] ${message}`);
    return json(response, 503, { ok: false, error: message }, origin);
  }
});

server.listen(port, host, () => console.info(`MZALI POS bridge actif sur http://${host}:${port}`));
