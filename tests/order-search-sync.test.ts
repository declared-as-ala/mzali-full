import assert from 'node:assert/strict';
import test from 'node:test';
import { reconcileSearchQuery } from '../lib/order-search-sync';

// Regression coverage for the Admin → Commandes search input bug: fast
// typing ("99999") must never lose digits, and an older/stale search
// navigation resolving after the user has typed further must never
// overwrite the newer local value — see lib/order-search-sync.ts.

test('does nothing when the URL already matches the displayed value', () => {
  const result = reconcileSearchQuery({ qParam: '99999', currentQuery: '99999', ownedByUser: false });
  assert.deepEqual(result, { action: 'noop' });
});

test('adopts the URL value on a genuine external change before the user has typed anything', () => {
  const result = reconcileSearchQuery({ qParam: '20123456', currentQuery: '', ownedByUser: false });
  assert.deepEqual(result, { action: 'adopt', value: '20123456' });
});

test('ignores a stale URL echo once the user owns the field — fast typing keeps every digit', () => {
  // User typed "999", it was pushed, then the user kept typing to "99999"
  // before that navigation's slower/out-of-order result ("999") arrived.
  const result = reconcileSearchQuery({ qParam: '999', currentQuery: '99999', ownedByUser: true });
  assert.deepEqual(result, { action: 'ignore' });
  // Simulating the full sequence a user might type: no step ever loses a digit.
  const typed = ['9', '99', '999', '9999', '99999'];
  let query = '';
  for (const step of typed) {
    query = step; // the input's own onChange always applies immediately, unconditionally
    // an arbitrary, possibly-stale qParam echo arriving mid-sequence must never win
    const decision = reconcileSearchQuery({ qParam: typed[0], currentQuery: query, ownedByUser: true });
    if (decision.action === 'adopt') query = decision.value;
  }
  assert.equal(query, '99999');
});

test('ignores an out-of-order-resolving older navigation even after a newer one already matched', () => {
  // Push "999" (in flight), then push "99999" which resolves first and
  // matches — then the stale "999" resolution finally arrives.
  let decision = reconcileSearchQuery({ qParam: '99999', currentQuery: '99999', ownedByUser: true });
  assert.deepEqual(decision, { action: 'noop' });
  decision = reconcileSearchQuery({ qParam: '999', currentQuery: '99999', ownedByUser: true });
  assert.deepEqual(decision, { action: 'ignore' });
});

test('clearing the search field is a local edit that also becomes owned', () => {
  // After Effacer, currentQuery is '' and ownedByUser is true (set by the
  // click handler) — a lingering non-empty qParam echo must be ignored.
  const result = reconcileSearchQuery({ qParam: '99999', currentQuery: '', ownedByUser: true });
  assert.deepEqual(result, { action: 'ignore' });
});

test('once ownedByUser is true, only a qParam equal to the current query is ever a noop', () => {
  for (const qParam of ['', '1', '12', '123456789', 'anything']) {
    const result = reconcileSearchQuery({ qParam, currentQuery: 'unrelated', ownedByUser: true });
    assert.equal(result.action, 'ignore');
  }
});
