import test from 'node:test';
import assert from 'node:assert/strict';

let fetchHandler = async () => new Response('{}', { status: 500 });
globalThis.window = {
  location: { href: 'https://admin.example.test/products', origin: 'https://admin.example.test' },
  dispatchEvent() {},
  fetch: (...args) => fetchHandler(...args),
};
const imported = await import('../lib/session-client.ts');
const sessionFetch = imported.sessionFetch ?? imported.default?.sessionFetch ?? imported['module.exports']?.sessionFetch;

test('concurrent Admin 401 responses perform one refresh and retry each request once', async () => {
  let refreshCalls = 0;
  let apiCalls = 0;
  fetchHandler = async (input) => {
    const url = String(input);
    if (url === '/api/auth') {
      refreshCalls += 1;
      await new Promise((resolve) => setTimeout(resolve, 10));
      return new Response('{}', { status: 200 });
    }
    apiCalls += 1;
    return new Response('{}', { status: apiCalls <= 2 ? 401 : 200 });
  };

  const responses = await Promise.all([sessionFetch('/api/a'), sessionFetch('/api/b')]);
  assert.deepEqual(responses.map((response) => response.status), [200, 200]);
  assert.equal(refreshCalls, 1);
  assert.equal(apiCalls, 4);
});

test('Admin retry stops after one replay and never loops on a second 401', async () => {
  let refreshCalls = 0;
  let apiCalls = 0;
  fetchHandler = async (input) => {
    if (String(input) === '/api/auth') {
      refreshCalls += 1;
      return new Response('{}', { status: 200 });
    }
    apiCalls += 1;
    return new Response('{}', { status: 401 });
  };

  const response = await sessionFetch('/api/orders', { method: 'PUT', body: '{}' });
  assert.equal(response.status, 401);
  assert.equal(refreshCalls, 1);
  assert.equal(apiCalls, 2);
});

