import test from 'node:test';
import assert from 'node:assert/strict';
import { isValidPhone, normalizePhone } from '../lib/phone.ts';

test('normalizePhone handles Tunisian numbers with prefixes', () => {
  assert.equal(normalizePhone('20 123 456'), '20123456');
  assert.equal(normalizePhone('+216 20 123 456'), '20123456');
  assert.equal(normalizePhone('00216 20123456'), '20123456');
  assert.equal(normalizePhone('21620123456'), '20123456');
  assert.equal(normalizePhone(''), '');
  assert.equal(normalizePhone(null), '');
  assert.equal(normalizePhone(undefined), '');
});

test('isValidPhone validates 8-digit Tunisian phone numbers', () => {
  assert.equal(isValidPhone('20123456'), true);
  assert.equal(isValidPhone('55123456'), true);
  assert.equal(isValidPhone('98123456'), true);
  assert.equal(isValidPhone('20 123 456'), true);
  assert.equal(isValidPhone('+216 20 123 456'), true);
  assert.equal(isValidPhone('00216 20 123 456'), true);

  // Invalid numbers
  assert.equal(isValidPhone(''), false);
  assert.equal(isValidPhone('123'), false);
  assert.equal(isValidPhone('1234567'), false);
  assert.equal(isValidPhone('abcdefgh'), false);
  assert.equal(isValidPhone(null), false);
  assert.equal(isValidPhone(undefined), false);
});
