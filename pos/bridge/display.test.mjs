import assert from 'node:assert/strict';
import test from 'node:test';
import { encodeVfdFrame, formatVfdLines, writeVfdPayment } from './display.mjs';

test('cash payment displays total and received amount on two 20-character lines', () => {
  const lines = formatVfdLines({ phase: 'payment', method: 'CASH', totalMinor: 12345, cashReceivedMinor: 20000 });
  assert.deepEqual(lines, ['TOTAL 12.345 DT     ', 'RECU 20.000 DT      ']);
  assert.equal(lines[0].length, 20);
  assert.equal(lines[1].length, 20);
});

test('completed cash payment displays change', () => {
  assert.deepEqual(
    formatVfdLines({ phase: 'completed', method: 'CASH', totalMinor: 12345, changeMinor: 7655 }),
    ['PAYE 12.345 DT      ', 'MONNAIE 7.655 DT    '],
  );
});

test('VFD frame clears the display and contains ASCII only', () => {
  const frame = encodeVfdFrame({ phase: 'completed', method: 'CARD', totalMinor: 5000 });
  assert.equal(frame[0], 0x0c);
  assert.equal(frame.subarray(1).toString('ascii'), 'PAYE 5.000 DT       \r\nMERCI - CARTE       ');
});

test('writer receives VFD bytes on a port separate from the drawer', async () => {
  let observed;
  await writeVfdPayment('COM7', { phase: 'payment', method: 'OTHER', totalMinor: 1000 }, {
    writer: async (port, bytes) => { observed = { port, bytes }; },
  });
  assert.equal(observed.port, 'COM7');
  assert.equal(observed.bytes[0], 0x0c);
});
