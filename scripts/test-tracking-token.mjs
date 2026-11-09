import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NEXT_PUBLIC_DEMO_MODE = 'false';
process.env.ORDER_TRACKING_SECRET = 'test-secret-with-at-least-32-characters';
const { createTrackingToken, verifyTrackingToken } = await import('../src/lib/tracking-token.ts');

const orderId = '431f6fd0-c6bb-5f4c-b32c-7f78b48c081f';

test('creates an opaque signed token and resolves it to the matching order ID', () => {
  const token = createTrackingToken(orderId);
  assert.notEqual(token, orderId);
  assert(!token.includes(orderId));
  assert.equal(verifyTrackingToken(token), orderId);
});

test('rejects unsigned UUIDs, malformed values, and modified signatures', () => {
  const token = createTrackingToken(orderId);
  assert.equal(verifyTrackingToken(orderId), null);
  assert.equal(verifyTrackingToken('not-a-token'), null);
  const parts = token.split('.');
  const changed = `${parts[0]}.${parts[1].slice(0, -1)}${parts[1].endsWith('A') ? 'B' : 'A'}.${parts[2]}`;
  assert.equal(verifyTrackingToken(changed), null);
});

test('rejects expired tracking credentials', () => {
  const now = Date.now();
  const expired = createTrackingToken(orderId, now - 91 * 24 * 60 * 60 * 1000);
  assert.equal(verifyTrackingToken(expired, now), null);
});
