import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import test from 'node:test';

test('loopback bridge works without setup and exposes safe defaults', async (context) => {
  const port = 18000 + Math.floor(Math.random() * 1000);
  const child = spawn(process.execPath, ['bridge/server.mjs'], {
    cwd: new URL('..', import.meta.url),
    env: { ...process.env, POS_BRIDGE_PORT: String(port) },
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
  assert.equal((await response.json()).ok, true);

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

  const settingsResponse = await fetch(`${url}/v1/settings`, { headers: { Origin: 'https://pos.example' } });
  assert.equal(settingsResponse.status, 200);
  const settings = (await settingsResponse.json()).settings;
  assert.equal(settings.autoOpenEnabled, true);
  assert.equal(settings.openOnCashPayment, true);
  assert.equal(settings.openForAllPaymentMethods, false);
  assert.equal(settings.drawerPin, 0);
});
