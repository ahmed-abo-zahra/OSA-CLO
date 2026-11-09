import test from 'node:test';
import assert from 'node:assert/strict';
import { readFormDataBody, readJsonBody } from '../src/lib/request-security.ts';

function jsonRequest(body, headers = {}) {
  return new Request('https://aso-clo.test/api', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body,
  });
}

test('parses valid JSON under the configured byte limit', async () => {
  const result = await readJsonBody(jsonRequest('{"ok":true}'), 32);
  assert.deepEqual(result, { ok: true, value: { ok: true } });
});

test('rejects an oversized streamed body even when Content-Length is absent', async () => {
  const result = await readJsonBody(jsonRequest(JSON.stringify({ value: 'x'.repeat(128) })), 32);
  assert.deepEqual(result, { ok: false, status: 413 });
});

test('rejects an oversized declared body before parsing', async () => {
  const request = jsonRequest('{}', { 'Content-Length': '4096' });
  const result = await readJsonBody(request, 32);
  assert.deepEqual(result, { ok: false, status: 413 });
});

test('rejects malformed JSON and requests without a body', async () => {
  assert.deepEqual(await readJsonBody(jsonRequest('{'), 32), { ok: false, status: 400 });
  const emptyRequest = new Request('https://aso-clo.test/api', { method: 'POST' });
  assert.deepEqual(await readJsonBody(emptyRequest, 32), { ok: false, status: 400 });
});

test('reads a bounded multipart upload and rejects oversized multipart streams', async () => {
  const form = new FormData();
  form.set('name', 'A small item');
  const request = new Request('https://aso-clo.test/api', { method: 'POST', body: form });
  const accepted = await readFormDataBody(request, 4096);
  assert.equal(accepted.ok, true);
  if (accepted.ok) assert.equal(accepted.value.get('name'), 'A small item');

  const oversizedForm = new FormData();
  oversizedForm.set('payload', 'x'.repeat(256));
  const oversizedRequest = new Request('https://aso-clo.test/api', { method: 'POST', body: oversizedForm });
  assert.deepEqual(await readFormDataBody(oversizedRequest, 64), { ok: false, status: 413 });
});
