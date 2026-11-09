import { createHmac } from 'node:crypto';
import { DEMO_MODE } from '@/lib/demo-mode';

/** Fingerprint a normalized checkout payload without storing customer data. */
export function createCheckoutRequestHash(value: unknown): string {
  const secret = process.env.ADMIN_SESSION_SECRET
    ?? (DEMO_MODE ? 'local-demo-only-checkout-idempotency-key' : '');
  if (!secret || secret.length < 32) {
    throw new Error('A server-side secret is required to fingerprint checkout requests.');
  }
  const serialized = JSON.stringify(value);
  if (typeof serialized !== 'string') throw new Error('Checkout request cannot be fingerprinted.');

  return createHmac('sha256', secret)
    .update('aso-clo:checkout-request:v1\0')
    .update(serialized)
    .digest('hex');
}
