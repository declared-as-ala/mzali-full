import assert from 'node:assert/strict';
import test from 'node:test';
import { initialProductMedia, mediaPayload, productMediaReducer, ProductMediaItem } from '../lib/product-media';

const saved = (ids: string[]) => initialProductMedia(ids.map((id, position) => ({ id, url: `https://img/${id}.jpg`, position, isPrimary: position === 0 })));
const visibleIds = (state: ReturnType<typeof initialProductMedia>) => state.items.filter((item) => item.status !== 'removed').map((item) => item.mediaId);

test('removes exactly the requested stable identity', () => {
  const cases = [
    { remove: ['C'], expected: ['A', 'B', 'D', 'E'] },
    { remove: ['A'], expected: ['B', 'C', 'D', 'E'] },
    { remove: ['E'], expected: ['A', 'B', 'C', 'D'] },
    { remove: ['B', 'D'], expected: ['A', 'C', 'E'] },
  ];
  for (const scenario of cases) {
    let state = saved(['A', 'B', 'C', 'D', 'E']);
    for (const id of scenario.remove) state = productMediaReducer(state, { type: 'remove', clientId: `saved:${id}` });
    assert.deepEqual(visibleIds(state), scenario.expected);
  }
});

test('parallel completion order never changes selection order', () => {
  const pending = ['A', 'B', 'C', 'D'].map((id, position): ProductMediaItem => ({
    clientId: id, mediaId: null, url: '', position, isPrimary: position === 0, status: 'selected',
  }));
  let state = productMediaReducer(initialProductMedia([]), { type: 'add', items: pending });
  for (const id of ['C', 'A', 'D', 'B']) state = productMediaReducer(state, { type: 'upload-success', clientId: id, mediaId: id, url: `/${id}` });
  assert.deepEqual(visibleIds(state), ['A', 'B', 'C', 'D']);
});

test('one failure is isolated and retry restores the exact order', () => {
  const pending = ['A', 'B', 'C', 'D'].map((id, position): ProductMediaItem => ({
    clientId: id, mediaId: null, url: '', position, isPrimary: position === 0, status: 'selected',
  }));
  let state = productMediaReducer(initialProductMedia([]), { type: 'add', items: pending });
  for (const id of ['A', 'B', 'D']) state = productMediaReducer(state, { type: 'upload-success', clientId: id, mediaId: id, url: `/${id}` });
  state = productMediaReducer(state, { type: 'upload-failure', clientId: 'C', error: 'réseau' });
  assert.equal(state.items.find((item) => item.clientId === 'C')?.status, 'failed');
  state = productMediaReducer(state, { type: 'retry', clientId: 'C' });
  state = productMediaReducer(state, { type: 'upload-success', clientId: 'C', mediaId: 'C', url: '/C' });
  assert.deepEqual(visibleIds(state), ['A', 'B', 'C', 'D']);
});

test('removing the primary promotes the next valid image', () => {
  const state = productMediaReducer(saved(['A', 'B', 'C']), { type: 'remove', clientId: 'saved:A' });
  assert.equal(state.items.find((item) => item.mediaId === 'B')?.isPrimary, true);
  assert.equal(mediaPayload(state.items).filter((item) => item.isPrimary).length, 1);
});

test('reorder then remove persists normalized positions and explicit primary', () => {
  let state = saved(['A', 'B', 'C', 'D']);
  state = productMediaReducer(state, { type: 'reorder', clientIds: ['saved:D', 'saved:A', 'saved:B', 'saved:C'] });
  state = productMediaReducer(state, { type: 'set-primary', clientId: 'saved:B' });
  state = productMediaReducer(state, { type: 'remove', clientId: 'saved:A' });
  assert.deepEqual(mediaPayload(state.items), [
    { mediaId: 'D', position: 0, isPrimary: false },
    { mediaId: 'B', position: 1, isPrimary: true },
    { mediaId: 'C', position: 2, isPrimary: false },
  ]);
});

test('duplicate media ids are collapsed deterministically', () => {
  let state = saved(['A']);
  state = productMediaReducer(state, { type: 'add', items: [{ clientId: 'new-A', mediaId: null, url: '', position: 1, isPrimary: false, status: 'uploading' }] });
  state = productMediaReducer(state, { type: 'upload-success', clientId: 'new-A', mediaId: 'A', url: '/A' });
  assert.deepEqual(visibleIds(state), ['A']);
});

test('an upload completing after removal cannot resurrect the image', () => {
  let state = productMediaReducer(initialProductMedia([]), { type: 'add', items: [{ clientId: 'late', mediaId: null, url: '', position: 0, isPrimary: true, status: 'uploading' }] });
  state = productMediaReducer(state, { type: 'remove', clientId: 'late' });
  state = productMediaReducer(state, { type: 'upload-success', clientId: 'late', mediaId: 'persisted', url: '/late' });
  assert.deepEqual(visibleIds(state), []);
});
