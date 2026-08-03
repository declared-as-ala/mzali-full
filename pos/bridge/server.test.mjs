import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import test from 'node:test';

test('loopback bridge enforces origin and token and exposes safe defaults', async (context) => {
  const port = 18000 + Math.floor(Math.random() * 1000);
  const token = 'test-only-bridge-token-1234567890-abcd';
  const origin = 'http://127.0.0.1:3001';
  const child = spawn(process.execPath, ['bridge/server.mjs'], {
    cwd: new URL('..', import.meta.url),
    env: { ...process.env, POS_BRIDGE_PORT: String(port), POS_BRIDGE_TOKEN: token, POS_BRIDGE_ALLOWED_ORIGINS: origin },
    stdio: 'ignore',
  });
  context.after(() => child.kill());

  const url = `http://127.0.0.1:${port}`;
  let response;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      response = await fetch(`${url}/v1/health`, { headers: { Origin: origin, Authorization: `Bearer ${token}` } });
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
  assert.equal(response?.status, 200);
  assert.equal((await response.json()).ok, true);

  const unauthorized = await fetch(`${url}/v1/settings`, { headers: { Origin: origin, Authorization: 'Bearer wrong' } });
  assert.equal(unauthorized.status, 401);
  const wrongOrigin = await fetch(`${url}/v1/settings`, { headers: { Origin: 'https://evil.example', Authorization: `Bearer ${token}` } });
  assert.equal(wrongOrigin.status, 403);

  const settingsResponse = await fetch(`${url}/v1/settings`, { headers: { Origin: origin, Authorization: `Bearer ${token}` } });
  const settings = (await settingsResponse.json()).settings;
  assert.equal(settings.autoOpenEnabled, true);
  assert.equal(settings.openOnCashPayment, true);
  assert.equal(settings.openForAllPaymentMethods, false);
  assert.equal(settings.drawerPin, 0);
});
