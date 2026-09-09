import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = { location: { href: 'https://example.test/' } };
const { normalizePresencePayload, normalizePresenceRecord, safeHttpUrl } = await import('./communityPresence.js');

test('normalizes common social presence fields', () => {
  assert.deepEqual(normalizePresenceRecord({
    user_id: '42', username: 'Ada', lat: '51.5', lng: '-0.12', profile_url: '/@ada',
  }), { id: '42', name: 'Ada', latitude: 51.5, longitude: -0.12,
    avatarUrl: null, profileUrl: 'https://example.test/@ada' });
});

test('rejects invalid coordinates and unsafe URLs', () => {
  assert.equal(normalizePresenceRecord({ id: 'x', lat: 91, lon: 0 }), null);
  assert.equal(safeHttpUrl('javascript:alert(1)'), null);
});

test('accepts arrays and people envelopes', () => {
  const person = { id: 'x', name: 'X', latitude: 1, longitude: 2 };
  assert.equal(normalizePresencePayload([person]).length, 1);
  assert.equal(normalizePresencePayload({ people: [person] }).length, 1);
  assert.deepEqual(normalizePresencePayload({ features: [] }), []);
});
