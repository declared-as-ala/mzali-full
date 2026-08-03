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
});
