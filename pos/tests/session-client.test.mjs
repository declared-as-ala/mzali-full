import test from 'node:test';
import assert from 'node:assert/strict';

let fetchHandler = async () => new Response('{}', { status: 500 });
globalThis.window = {
  dispatchEvent() {},
  fetch: (...args) => fetchHandler(...args),
};
const imported = await import('../lib/session-client.ts');
const sessionFetch = imported.sessionFetch ?? imported.default?.sessionFetch ?? imported['module.exports']?.sessionFetch;

test('POS payment refresh retry keeps the same idempotency key and creates no second logical payment', async () => {
  const seenKeys = [];
  let refreshCalls = 0;
  fetchHandler = async (input, init = {}) => {
    if (String(input) === '/api/auth') {
      refreshCalls += 1;
      return new Response('{}', { status: 200 });
    }
    seenKeys.push(new Headers(init.headers).get('Idempotency-Key'));
    return new Response('{}', { status: seenKeys.length === 1 ? 401 : 200 });
  };

  const response = await sessionFetch('/api/sales', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'sale-123' },
    body: JSON.stringify({ payments: [{ method: 'CASH', amountMinor: 1000 }] }),
  });
  assert.equal(response.status, 200);
  assert.equal(refreshCalls, 1);
  assert.deepEqual(seenKeys, ['sale-123', 'sale-123']);
});

test('POS concurrent failures share one refresh', async () => {
  let refreshCalls = 0;
  let apiCalls = 0;
  fetchHandler = async (input) => {
    if (String(input) === '/api/auth') {
      refreshCalls += 1;
      await new Promise((resolve) => setTimeout(resolve, 10));
      return new Response('{}', { status: 200 });
    }
    apiCalls += 1;
    return new Response('{}', { status: apiCalls <= 2 ? 401 : 200 });
  };
  const responses = await Promise.all([sessionFetch('/api/catalog'), sessionFetch('/api/sessions')]);
  assert.deepEqual(responses.map((response) => response.status), [200, 200]);
  assert.equal(refreshCalls, 1);
});
