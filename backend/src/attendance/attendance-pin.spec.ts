import { hashPin, isValidPinFormat, verifyPin } from './attendance-pin';

describe('attendance-pin', () => {
  it('hashes and verifies a correct PIN', async () => {
    const hash = await hashPin('4821');
    expect(await verifyPin(hash, '4821')).toBe(true);
  });

  it('rejects an incorrect PIN against a valid hash', async () => {
    const hash = await hashPin('4821');
    expect(await verifyPin(hash, '1234')).toBe(false);
  });

  it('never stores the PIN in plain text (hash does not contain the digits)', async () => {
    const hash = await hashPin('4821');
    expect(hash).not.toContain('4821');
    expect(hash.startsWith('$argon2id')).toBe(true);
  });

  it('verifyPin never throws on a malformed hash — returns false instead', async () => {
    expect(await verifyPin('not-a-real-hash', '4821')).toBe(false);
  });

  it.each(['1234', '12345', '123456'])('accepts a %s-digit numeric PIN', (pin) => {
    expect(isValidPinFormat(pin)).toBe(true);
  });

  it.each(['123', '1234567', 'abcd', '12a4', ''])('rejects an invalid PIN format: %p', (pin) => {
    expect(isValidPinFormat(pin)).toBe(false);
  });
});
