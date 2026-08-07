import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import test from 'node:test';

test('loopback bridge works without setup and exposes safe defaults', async (context) => {
  const port = 18000 + Math.floor(Math.random() * 1000);
  const child = spawn(process.execPath, ['bridge/server.mjs'], {
    cwd: new URL('..', import.meta.url),
    env: { ...process.env, POS_BRIDGE_PORT: String(port), POS_DRAWER_COM_PORT: 'COM4', POS_VFD_DISABLED: '1' },
    stdio: 'ignore',
  });
  context.after(() => child.kill());

  const url = `http://127.0.0.1:${port}`;
  let response;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      response = await fetch(`${url}/v1/health`, { headers: { Origin: 'https://pos.example' } });
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
  assert.equal(response?.status, 200);
  assert.equal(response.headers.get('access-control-allow-origin'), '*');
  assert.equal(response.headers.get('access-control-allow-private-network'), 'true');
  const health = await response.json();
  assert.equal(health.ok, true);
  assert.equal(health.drawerPort, 'COM4');
  assert.equal(health.vfdPort, null);

  const preflight = await fetch(`${url}/v1/health`, {
    method: 'OPTIONS',
    headers: {
      Origin: 'https://pos.example',
      'Access-Control-Request-Method': 'GET',
      'Access-Control-Request-Private-Network': 'true',
    },
  });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-private-network'), 'true');

  const displayResponse = await fetch(`${url}/v1/display/payment`, {
    method: 'POST',
    headers: { Origin: 'https://pos.example', 'Content-Type': 'application/json' },
    body: JSON.stringify({ method: 'CASH', totalMinor: 12000, cashReceivedMinor: 20000 }),
  });
  assert.deepEqual(await displayResponse.json(), { ok: true, displayed: false });

  const removedSettings = await fetch(`${url}/v1/settings`, { headers: { Origin: 'https://pos.example' } });
  assert.equal(removedSettings.status, 404);

  const printers = await fetch(`${url}/v1/printers`, { headers: { Origin: 'https://pos.example' } });
  assert.equal(printers.status, 200);
  assert.deepEqual(await printers.json(), { ok: true, printers: [] }); // no real printer on the CI runner

  const printerStatus = await fetch(`${url}/v1/printer/status?name=Thermal80`, { headers: { Origin: 'https://pos.example' } });
  assert.equal(printerStatus.status, 200);
  const statusBody = await printerStatus.json();
  assert.equal(statusBody.ok, true);
  assert.equal(statusBody.printer.name, 'Thermal80');

  const printMissingFields = await fetch(`${url}/v1/print`, {
    method: 'POST',
    headers: { Origin: 'https://pos.example', 'Content-Type': 'application/json' },
    body: JSON.stringify({ requestId: 'print:1' }),
  });
  assert.equal(printMissingFields.status, 503);
  assert.match((await printMissingFields.json()).error, /ticket/i);

  const minimalSale = {
    saleNumber: 1, createdAt: new Date().toISOString(), completedAt: new Date().toISOString(),
    lines: [], subtotalMinor: 0, discountMinor: 0, totalMinor: 0, payments: [],
    loyaltyPointsEarned: 0, loyaltyPointsRedeemed: 0,
  };
  const printSettings = { paperWidthMm: 80, printLogo: true, printQr: false };
  const printResponse = await fetch(`${url}/v1/print`, {
    method: 'POST',
    headers: { Origin: 'https://pos.example', 'Content-Type': 'application/json' },
    body: JSON.stringify({ requestId: 'print:2', printerName: 'Thermal80', sale: minimalSale, settings: printSettings }),
  });
  // This test runner isn't Windows, so the receipt still builds correctly
  // (proves the endpoint wiring end to end) but the actual OS-level print
  // call correctly refuses — exercised for real on the Windows install.
  assert.equal(printResponse.status, 503);
  assert.match((await printResponse.json()).error, /Windows/i);
});
