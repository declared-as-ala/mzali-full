import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeComPort, openCashDrawer, shouldOpenDrawer, USB_DRAWER_TRIGGER } from './drawer.mjs';
import { createRequestDeduplicator } from './dedupe.mjs';

test('USB drawer uses the verified trigger byte', () => {
  assert.equal(USB_DRAWER_TRIGGER, 0x07);
});

test('COM port is normalized and invalid device names are rejected', () => {
  assert.equal(normalizeComPort('com4'), 'COM4');
  assert.throws(() => normalizeComPort('USB001'));
});

test('only a cash payment opens the drawer automatically', () => {
  assert.equal(shouldOpenDrawer(['CASH']), true);
  assert.equal(shouldOpenDrawer(['CARD']), false);
  assert.equal(shouldOpenDrawer(['BANK_TRANSFER']), false);
});

test('openCashDrawer sends one trigger to the detected serial port', async () => {
  const observed = [];
  const result = await openCashDrawer('COM4', async (serialPort) => { observed.push(serialPort); });
  assert.deepEqual(observed, ['COM4']);
  assert.deepEqual(result, { serialPort: 'COM4', trigger: 0x07 });
});

test('same sale request executes the drawer action only once', async () => {
  const once = createRequestDeduplicator();
  let calls = 0;
  const action = async () => { calls += 1; return { ok: true }; };
  const [first, second] = await Promise.all([once('sale:42', action), once('sale:42', action)]);
  assert.equal(calls, 1);
  assert.equal(first.duplicate, false);
  assert.equal(second.duplicate, true);
});

test('failed manual opening can be retried', async () => {
  const once = createRequestDeduplicator();
  await assert.rejects(() => once('manual:1', async () => { throw new Error('offline'); }));
  const retried = await once('manual:1', async () => ({ ok: true }));
  assert.equal(retried.duplicate, false);
});

test('ambiguous sale failure is retained to prevent a second pulse', async () => {
  const once = createRequestDeduplicator(undefined, { retainFailures: true });
  let calls = 0;
  const action = async () => { calls += 1; throw new Error('response unknown'); };
  await assert.rejects(() => once('sale:ambiguous', action));
  await assert.rejects(() => once('sale:ambiguous', action));
  assert.equal(calls, 1);
});
