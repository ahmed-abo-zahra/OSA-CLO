import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveInternalRedirect } from '../src/lib/internal-redirect.ts';

const origin = 'https://store.example';

test('allows an internal path and preserves its query string', () => {
  const target = resolveInternalRedirect('/account?recovery=1', origin);
  assert.equal(target.origin, origin);
  assert.equal(target.pathname, '/account');
  assert.equal(target.search, '?recovery=1');
});

test('rejects scheme-relative and external absolute redirects', () => {
  for (const input of ['//evil.example/path', 'https://evil.example/path', 'javascript:alert(1)']) {
    assert.equal(resolveInternalRedirect(input, origin).href, `${origin}/account`);
  }
});

test('rejects the backslash URL-normalization open-redirect bypass', () => {
  for (const input of ['/\\\\evil.example/path', '/\\evil.example/path']) {
    const target = resolveInternalRedirect(input, origin);
    assert.equal(target.origin, origin);
    assert.equal(target.pathname, '/account');
  }
});

test('rejects control characters and malformed values to the same-origin fallback', () => {
  for (const input of ['/account\n//evil.example', '/%00evil', '']) {
    const target = resolveInternalRedirect(input, origin);
    assert.equal(target.origin, origin);
    assert.equal(target.pathname, '/account');
  }
});
