import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';
import { TRACKING_TOKEN_PATTERN } from './tracking-token-format.ts';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOKEN_LIFETIME_MS = 90 * 24 * 60 * 60 * 1000;
const AAD = Buffer.from('aso-clo:order-tracking:v1');
const LOCAL_DEMO_SECRET = 'local-demo-only-tracking-secret-never-use-in-production';

function getTrackingKey(): Buffer {
  const configuredTrackingSecret = process.env.ORDER_TRACKING_SECRET?.trim();
  let sourceSecret = configuredTrackingSecret || process.env.ADMIN_SESSION_SECRET;
  if ((!sourceSecret || sourceSecret.length < 32) && process.env.NEXT_PUBLIC_DEMO_MODE === 'true' && process.env.NODE_ENV !== 'production') {
    sourceSecret = LOCAL_DEMO_SECRET;
  }
  if (!sourceSecret || sourceSecret.length < 32) {
    throw new Error('A tracking signing secret of at least 32 characters is required.');
  }
  return createHmac('sha256', sourceSecret).update('aso-clo:order-tracking:key:v1').digest();
}

export function assertTrackingTokenConfigured(): void {
  getTrackingKey();
}

/** Encrypts the internal order reference so the bearer token reveals no UUID. */
export function createTrackingToken(orderId: string, issuedAt = Date.now()): string {
  if (!UUID_PATTERN.test(orderId) || !Number.isSafeInteger(issuedAt) || issuedAt < 0) {
    throw new Error('Invalid tracking token payload.');
  }

  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getTrackingKey(), iv);
  cipher.setAAD(AAD);
  const payload = Buffer.from(JSON.stringify({ v: 1, orderId, issuedAt, expiresAt: issuedAt + TOKEN_LIFETIME_MS }));
  const ciphertext = Buffer.concat([cipher.update(payload), cipher.final()]);
  return [iv.toString('base64url'), ciphertext.toString('base64url'), cipher.getAuthTag().toString('base64url')].join('.');
}

/** Returns the internal order UUID only after authenticated decryption and expiry checks. */
export function verifyTrackingToken(token: string, now = Date.now()): string | null {
  if (token.length > 256 || !TRACKING_TOKEN_PATTERN.test(token)) return null;
  const [ivPart, ciphertextPart, tagPart] = token.split('.');

  try {
    const iv = Buffer.from(ivPart, 'base64url');
    const ciphertext = Buffer.from(ciphertextPart, 'base64url');
    const tag = Buffer.from(tagPart, 'base64url');
    if (
      iv.length !== 12 || tag.length !== 16 ||
      iv.toString('base64url') !== ivPart ||
      ciphertext.toString('base64url') !== ciphertextPart ||
      tag.toString('base64url') !== tagPart
    ) return null;

    const decipher = createDecipheriv('aes-256-gcm', getTrackingKey(), iv);
    decipher.setAAD(AAD);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
    const payload: unknown = JSON.parse(plaintext);
    if (!payload || typeof payload !== 'object') return null;
    const value = payload as { v?: unknown; orderId?: unknown; issuedAt?: unknown; expiresAt?: unknown };
    if (
      value.v !== 1 || typeof value.orderId !== 'string' || !UUID_PATTERN.test(value.orderId) ||
      typeof value.issuedAt !== 'number' || !Number.isSafeInteger(value.issuedAt) ||
      typeof value.expiresAt !== 'number' || !Number.isSafeInteger(value.expiresAt) ||
      value.issuedAt > now + 60_000 || value.expiresAt <= now ||
      value.expiresAt - value.issuedAt !== TOKEN_LIFETIME_MS
    ) return null;
    return value.orderId;
  } catch {
    return null;
  }
}
