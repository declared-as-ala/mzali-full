import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { normalizeComPort, openCashDrawer, shouldOpenDrawer } from './drawer.mjs';
import { createRequestDeduplicator } from './dedupe.mjs';

const execFileAsync = promisify(execFile);
const host = '127.0.0.1';
const port = Number(process.env.POS_BRIDGE_PORT || 17890);
const saleOnce = createRequestDeduplicator(undefined, { retainFailures: true });
const manualOnce = createRequestDeduplicator();

function json(response, status, body) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Private-Network': 'true',
  });
  response.end(JSON.stringify(body));
}

async function body(request) {
  let raw = '';
  for await (const chunk of request) {
    raw += chunk;
    if (raw.length > 16_384) throw new Error('Payload trop volumineux.');
  }
  return raw ? JSON.parse(raw) : {};
}

async function detectUsbDrawerPort() {
  if (process.env.POS_DRAWER_COM_PORT) return normalizeComPort(process.env.POS_DRAWER_COM_PORT);
  if (process.platform !== 'win32') throw new Error('Détection du tiroir USB disponible uniquement sous Windows.');
  const command = String.raw`$device = Get-CimInstance Win32_PnPEntity | Where-Object { $_.Status -eq 'OK' -and $_.DeviceID -like 'USB\VID_067B&PID_23A3*' -and $_.Name -match '\(COM\d+\)' } | Select-Object -First 1; if ($null -ne $device -and $device.Name -match '\((COM\d+)\)') { $Matches[1] | ConvertTo-Json -Compress }`;
  const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { windowsHide: true, timeout: 8000 });
  if (!stdout.trim()) throw new Error('Tiroir USB non détecté. Vérifiez son câble USB.');
  return normalizeComPort(JSON.parse(stdout.trim()));
}

let drawerPortPromise = detectUsbDrawerPort();
async function getDrawerPort() {
  try {
    return await drawerPortPromise;
  } catch {
    drawerPortPromise = detectUsbDrawerPort();
    return drawerPortPromise;
  }
}

const server = createServer(async (request, response) => {
  if (request.method === 'OPTIONS') {
    response.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Private-Network': 'true',
      'Access-Control-Allow-Headers': 'content-type',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Max-Age': '600',
    });
    return response.end();
  }

  try {
    const url = new URL(request.url || '/', `http://${host}:${port}`);
    if (request.method === 'GET' && url.pathname === '/v1/health') {
      return json(response, 200, { ok: true, platform: process.platform, drawerPort: await getDrawerPort() });
    }
    if (request.method === 'POST' && url.pathname === '/v1/sale-completed') {
      const input = await body(request);
      const requestId = String(input.requestId || '').slice(0, 200);
      const saleId = String(input.saleId || '').slice(0, 100);
      const paymentMethods = Array.isArray(input.paymentMethods)
        ? input.paymentMethods.filter((method) => ['CASH', 'CARD', 'BANK_TRANSFER', 'OTHER'].includes(method))
        : [];
      if (!requestId || !saleId || paymentMethods.length === 0) throw new Error('Requête de vente invalide.');
      const drawerAttempted = shouldOpenDrawer(paymentMethods);
      const result = await saleOnce(requestId, async () => {
        if (!drawerAttempted) return { ok: true, drawerAttempted: false, drawerOpened: false, autoPrintReceipt: false };
        const drawer = await openCashDrawer(await getDrawerPort());
        console.info(`[drawer] Vente ${saleId}: ouverture USB envoyée à ${drawer.serialPort}`);
        return { ok: true, drawerAttempted: true, drawerOpened: true, autoPrintReceipt: false };
      });
      return json(response, 200, result);
    }
    if (request.method === 'POST' && url.pathname === '/v1/drawer/open') {
      const input = await body(request);
      const requestId = String(input.requestId || '').slice(0, 200);
      if (!requestId) throw new Error('Identifiant de requête manquant.');
      const result = await manualOnce(requestId, async () => {
        const drawer = await openCashDrawer(await getDrawerPort());
        console.info(`[drawer] Ouverture manuelle USB envoyée à ${drawer.serialPort}`);
        return { ok: true, drawerAttempted: true, drawerOpened: true };
      });
      return json(response, 200, result);
    }
    return json(response, 404, { ok: false, error: 'Opération locale inconnue.' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur matérielle locale.';
    console.error(`[bridge] ${message}`);
    return json(response, 503, { ok: false, error: message });
  }
});

server.listen(port, host, () => console.info(`MZALI POS bridge actif sur http://${host}:${port}`));
