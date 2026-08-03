import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDrawerPulse, openCashDrawer, shouldOpenDrawer } from './drawer.mjs';
import { createRequestDeduplicator } from './dedupe.mjs';

test('default pulse uses ESC p, pin 2, 25/250 duration bytes', () => {
  assert.deepEqual([...buildDrawerPulse({})], [0x1b, 0x70, 0x00, 0x19, 0xfa]);
});

test('alternative pin changes only m to pin 5', () => {
  assert.deepEqual([...buildDrawerPulse({ drawerPin: 1 })], [0x1b, 0x70, 0x01, 0x19, 0xfa]);
});

test('cash opens by default while card and bank transfer do not', () => {
  assert.equal(shouldOpenDrawer({}, ['CASH']), true);
  assert.equal(shouldOpenDrawer({}, ['CARD']), false);
  assert.equal(shouldOpenDrawer({}, ['BANK_TRANSFER']), false);
});

test('all-method setting opens for electronic payments', () => {
  assert.equal(shouldOpenDrawer({ openForAllPaymentMethods: true }, ['CARD']), true);
});

test('disabled automatic opening overrides payment method settings', () => {
  assert.equal(shouldOpenDrawer({ autoOpenEnabled: false, openForAllPaymentMethods: true }, ['CASH']), false);
});

test('openCashDrawer sends only the validated pulse to the selected printer', async () => {
  let observed;
  const result = await openCashDrawer({ printerName: 'POS-80', drawerPin: 1 }, async (printerName, bytes) => {
    observed = { printerName, bytes: [...bytes] };
  });
  assert.deepEqual(observed, { printerName: 'POS-80', bytes: [0x1b, 0x70, 0x01, 0x19, 0xfa] });
  assert.equal(result.printerName, 'POS-80');
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

test('failed drawer action can be retried', async () => {
  const once = createRequestDeduplicator();
  await assert.rejects(() => once('manual:1', async () => { throw new Error('offline'); }));
  const retried = await once('manual:1', async () => ({ ok: true }));
  assert.equal(retried.duplicate, false);
});

test('ambiguous sale failure is retained to prevent a second automatic pulse', async () => {
  const once = createRequestDeduplicator(undefined, { retainFailures: true });
  let calls = 0;
  const action = async () => { calls += 1; throw new Error('spooler response unknown'); };
  await assert.rejects(() => once('sale:ambiguous', action));
  await assert.rejects(() => once('sale:ambiguous', action));
  assert.equal(calls, 1);
});

test('receipt-print preference does not disable the cash drawer policy', () => {
  assert.equal(shouldOpenDrawer({ autoPrintReceipt: false }, ['CASH']), true);
});
