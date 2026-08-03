import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { normalizeComPort, openCashDrawer, shouldOpenDrawer } from './drawer.mjs';
import { writeVfdPayment } from './display.mjs';
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
  const command = String.raw`$map = Get-ItemProperty 'HKLM:\HARDWARE\DEVICEMAP\SERIALCOMM' -ErrorAction SilentlyContinue; $entry = $map.PSObject.Properties | Where-Object { $_.Name -like '*ProlificSerial*' -and $_.Value -match '^COM\d+$' } | Select-Object -First 1; if ($null -ne $entry) { $entry.Value | ConvertTo-Json -Compress }`;
  const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { windowsHide: true, timeout: 8000 });
  if (!stdout.trim()) throw new Error('Tiroir USB non détecté. Vérifiez son câble USB.');
  return normalizeComPort(JSON.parse(stdout.trim()));
}

let drawerPortPromise = null;
async function getDrawerPort() {
  if (!drawerPortPromise) drawerPortPromise = detectUsbDrawerPort();
  try {
    return await drawerPortPromise;
  } catch {
    drawerPortPromise = null;
    throw new Error('Tiroir USB non détecté. Vérifiez son câble USB.');
  }
}

async function detectVfdPort(drawerPort) {
  if (process.env.POS_VFD_DISABLED === '1') return null;
  if (process.env.POS_VFD_COM_PORT) {
    const configured = normalizeComPort(process.env.POS_VFD_COM_PORT);
    if (configured === drawerPort) throw new Error('Le VFD et le tiroir ne peuvent pas partager le même port COM.');
    return configured;
  }
  if (process.platform !== 'win32') return null;
  const command = String.raw`$map = Get-ItemProperty 'HKLM:\HARDWARE\DEVICEMAP\SERIALCOMM' -ErrorAction SilentlyContinue; $entry = $map.PSObject.Properties | Where-Object { $_.Value -match '^COM\d+$' -and $_.Value -ne $env:MZALI_DRAWER_PORT } | Select-Object -First 1; if ($null -ne $entry) { $entry.Value | ConvertTo-Json -Compress }`;
  const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], {
    windowsHide: true,
    timeout: 8000,
    env: { ...process.env, MZALI_DRAWER_PORT: drawerPort },
  });
  return stdout.trim() ? normalizeComPort(JSON.parse(stdout.trim())) : null;
}

let vfdPortPromise = null;
async function getVfdPort() {
  if (!vfdPortPromise) {
    const pending = getDrawerPort().catch(() => null).then(detectVfdPort);
    vfdPortPromise = pending;
    void pending.then((detected) => {
      if (detected === null) setTimeout(() => { if (vfdPortPromise === pending) vfdPortPromise = null; }, 5000);
    }).catch(() => undefined);
  }
  try {
    return await vfdPortPromise;
  } catch {
    vfdPortPromise = null;
    return null;
  }
}

function paymentDisplayInput(input, phase = 'payment') {
  const method = ['CASH', 'CARD', 'BANK_TRANSFER', 'OTHER'].includes(input?.method) ? input.method : 'OTHER';
  const integer = (value) => Number.isInteger(value) && value >= 0 ? value : 0;
  return {
    phase: phase === 'completed' ? 'completed' : 'payment',
    method,
    totalMinor: integer(input?.totalMinor),
    cashReceivedMinor: integer(input?.cashReceivedMinor),
    changeMinor: integer(input?.changeMinor),
  };
}

async function showOnVfd(input, phase) {
  const vfdPort = await getVfdPort();
  if (!vfdPort) return false;
  await writeVfdPayment(vfdPort, paymentDisplayInput(input, phase), { baudRate: Number(process.env.POS_VFD_BAUD_RATE || 9600) });
  return true;
}

// Warm hardware discovery when the bridge starts so the first payment stays fast.
void getVfdPort();

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
      const drawerPort = await getDrawerPort().catch(() => null);
      return json(response, 200, { ok: true, platform: process.platform, drawerPort, vfdPort: await getVfdPort() });
    }
    if (request.method === 'POST' && url.pathname === '/v1/display/payment') {
      const input = await body(request);
      return json(response, 200, { ok: true, displayed: await showOnVfd(input, 'payment') });
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
        const displayPromise = showOnVfd(input.display, 'completed').catch((error) => {
          console.error(`[vfd] ${error instanceof Error ? error.message : 'Erreur VFD'}`);
          return false;
        });
        if (!drawerAttempted) return { ok: true, drawerAttempted: false, drawerOpened: false, autoPrintReceipt: false, displayed: await displayPromise };
        const drawer = await openCashDrawer(await getDrawerPort());
        console.info(`[drawer] Vente ${saleId}: ouverture USB envoyée à ${drawer.serialPort}`);
        return { ok: true, drawerAttempted: true, drawerOpened: true, autoPrintReceipt: false, displayed: await displayPromise };
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
