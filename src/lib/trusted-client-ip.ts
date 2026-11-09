import { isIP } from 'node:net';

/**
 * Vercel documents x-forwarded-for as the public client IP and overwrites it
 * on direct deployments. Do not trust forwarding headers on other runtimes.
 * A comma-separated chain is rejected rather than choosing an ambiguous hop.
 */
export function getTrustedClientIp(headers: Headers): string | null {
  if (process.env.VERCEL !== '1') return null;

  const candidate = headers.get('x-forwarded-for')?.trim();
  if (!candidate || candidate.includes(',') || isIP(candidate) === 0) return null;
  return candidate;
}
