import assert from 'node:assert/strict';
import test from 'node:test';
import { encodeVfdFrame, encodeVfdLines, formatVfdLines, writeVfdPayment } from './display.mjs';

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

test('plain VFD frame clears the display and contains ASCII only', () => {
  const frame = encodeVfdFrame({ phase: 'completed', method: 'CARD', totalMinor: 5000 }, { protocol: 'plain' });
  assert.equal(frame[0], 0x0c);
  assert.equal(frame.subarray(1).toString('ascii'), 'PAYE 5.000 DT       \r\nMERCI - CARTE       ');
});

test('CD5220 frame resets the factory screen and addresses both rows', () => {
  const frame = encodeVfdLines('MZALI POS', 'CAISSE PRETE', { protocol: 'cd5220' });
  assert.deepEqual([...frame.subarray(0, 6)], [0x1b, 0x40, 0x0c, 0x1b, 0x51, 0x41]);
  assert.equal(frame.subarray(6, 26).toString('ascii'), 'MZALI POS           ');
  assert.deepEqual([...frame.subarray(27, 30)], [0x1b, 0x51, 0x42]);
  assert.equal(frame.subarray(30, 50).toString('ascii'), 'CAISSE PRETE        ');
});

test('Logic Controls frame clears and writes positions 0 and 20', () => {
  const frame = encodeVfdLines('MZALI POS', 'CAISSE PRETE');
  assert.deepEqual([...frame.subarray(0, 5)], [0x11, 0x1e, 0x14, 0x10, 0x00]);
  assert.equal(frame.subarray(5, 25).toString('ascii'), 'MZALI POS           ');
  assert.deepEqual([...frame.subarray(25, 27)], [0x10, 0x14]);
  assert.equal(frame.subarray(27, 47).toString('ascii'), 'CAISSE PRETE        ');
});

test('writer receives VFD bytes on a port separate from the drawer', async () => {
  let observed;
  await writeVfdPayment('COM7', { phase: 'payment', method: 'OTHER', totalMinor: 1000 }, {
    writer: async (port, bytes) => { observed = { port, bytes }; },
  });
  assert.equal(observed.port, 'COM7');
  assert.equal(observed.bytes[0], 0x11);
});
