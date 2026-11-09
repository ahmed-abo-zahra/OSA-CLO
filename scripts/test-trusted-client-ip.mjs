import test from 'node:test';
import assert from 'node:assert/strict';
import { getTrustedClientIp } from '../src/lib/trusted-client-ip.ts';

function withVercel(value, callback) {
  const original = process.env.VERCEL;
  if (value === undefined) delete process.env.VERCEL;
  else process.env.VERCEL = value;
  try {
    callback();
  } finally {
    if (original === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = original;
  }
}

test('ignores forwarding headers outside the trusted Vercel runtime', () => {
  withVercel(undefined, () => {
    const headers = new Headers({ 'x-forwarded-for': '198.51.100.24' });
    assert.equal(getTrustedClientIp(headers), null);
  });
});

test('uses only a valid Vercel-normalized x-forwarded-for IP', () => {
  withVercel('1', () => {
    const headers = new Headers({
      'x-real-ip': '192.0.2.55',
      'x-forwarded-for': '203.0.113.10',
    });
    assert.equal(getTrustedClientIp(headers), '203.0.113.10');
  });
});

test('fails closed when the trusted IP header is missing, malformed, or a chain', () => {
  withVercel('1', () => {
    assert.equal(getTrustedClientIp(new Headers({ 'x-real-ip': '203.0.113.10' })), null);
    assert.equal(getTrustedClientIp(new Headers({ 'x-forwarded-for': 'attacker-controlled' })), null);
    assert.equal(getTrustedClientIp(new Headers({ 'x-forwarded-for': '192.0.2.1, 203.0.113.10' })), null);
  });
});
