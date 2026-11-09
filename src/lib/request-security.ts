import type { NextRequest } from 'next/server';

export type JsonBodyResult =
  | { ok: true; value: unknown }
  | { ok: false; status: 400 | 413 };

export type FormDataBodyResult =
  | { ok: true; value: FormData }
  | { ok: false; status: 400 | 413 };

type BytesResult =
  | { ok: true; value: Uint8Array }
  | { ok: false; status: 400 | 413 };

/** Browser mutation requests must prove their source origin. */
export function hasSameOrigin(request: NextRequest): boolean {
  const source = request.headers.get('origin') ?? request.headers.get('referer');
  if (!source) return false;

  try {
    return new URL(source).origin === request.nextUrl.origin;
  } catch {
    return false;
  }
}

async function readLimitedBytes(request: Request, maxBytes: number): Promise<BytesResult> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || !request.body) {
    return { ok: false, status: 400 };
  }

  const declaredLength = request.headers.get('content-length');
  if (declaredLength !== null) {
    if (!/^\d+$/.test(declaredLength)) return { ok: false, status: 400 };
    if (Number(declaredLength) > maxBytes) return { ok: false, status: 413 };
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        try { await reader.cancel(); } catch { /* body is already oversized */ }
        return { ok: false, status: 413 };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, status: 400 };
  } finally {
    try { reader.releaseLock(); } catch { /* reader already released */ }
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { ok: true, value: bytes };
}

/** Read and parse JSON while enforcing a byte limit on the actual stream. */
export async function readJsonBody(request: Request, maxBytes: number): Promise<JsonBodyResult> {
  const contentType = request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase();
  if (contentType !== 'application/json' && !contentType?.endsWith('+json')) {
    return { ok: false, status: 400 };
  }

  const body = await readLimitedBytes(request, maxBytes);
  if (!body.ok) return body;

  try {
    return { ok: true, value: JSON.parse(new TextDecoder().decode(body.value)) as unknown };
  } catch {
    return { ok: false, status: 400 };
  }
}

/** Read bounded multipart bytes before invoking the platform FormData parser. */
export async function readFormDataBody(request: Request, maxBytes: number): Promise<FormDataBodyResult> {
  const contentType = request.headers.get('content-type');
  if (!contentType || !/^multipart\/form-data\s*;/i.test(contentType)) {
    return { ok: false, status: 400 };
  }

  const body = await readLimitedBytes(request, maxBytes);
  if (!body.ok) return body;

  try {
    const formPayload = new ArrayBuffer(body.value.byteLength);
    new Uint8Array(formPayload).set(body.value);
    const boundedRequest = new Request(request.url, {
      method: 'POST',
      headers: { 'content-type': contentType },
      body: formPayload,
    });
    return { ok: true, value: await boundedRequest.formData() };
  } catch {
    return { ok: false, status: 400 };
  }
}
