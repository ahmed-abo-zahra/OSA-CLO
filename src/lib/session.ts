import 'server-only';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { getPartnerById } from './partners';
import { DEMO_MODE } from './demo-mode';

export const COOKIE_NAME = 'aso_admin_session';
export const COOKIE_MAX_AGE = 60 * 60 * 12;

export interface SessionPayload {
  partnerId: string;
  partnerName: string;
}

type DemoSecretScope = typeof globalThis & { asoDemoSecret?: string };
const scope = globalThis as DemoSecretScope;
if (DEMO_MODE) scope.asoDemoSecret ??= randomBytes(32).toString('base64url');

function getSecret(): string {
  const value = process.env.ADMIN_SESSION_SECRET ?? (DEMO_MODE ? scope.asoDemoSecret : undefined);
  if (!value || value.length < 32) {
    throw new Error('ADMIN_SESSION_SECRET must contain at least 32 characters.');
  }
  return value;
}

function sign(value: string): Buffer {
  return createHmac('sha256', getSecret()).update(value).digest();
}

export function encodeSession(payload: SessionPayload): string {
  const body = Buffer.from(
    JSON.stringify({ ...payload, expiresAt: Date.now() + COOKIE_MAX_AGE * 1000 }),
  ).toString('base64url');
  return `${body}.${sign(body).toString('base64url')}`;
}

export function decodeSessionValue(value: string | undefined): SessionPayload | null {
  if (!value) return null;

  try {
    const [body, signature, ...extra] = value.split('.');
    if (!body || !signature || extra.length > 0) return null;

    const expected = sign(body);
    const actual = Buffer.from(signature, 'base64url');
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;

    const payload: unknown = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload || typeof payload !== 'object') return null;

    const candidate = payload as Partial<SessionPayload> & { expiresAt?: unknown };
    if (
      typeof candidate.partnerId !== 'string' ||
      typeof candidate.partnerName !== 'string' ||
      typeof candidate.expiresAt !== 'number' ||
      !Number.isFinite(candidate.expiresAt) ||
      candidate.expiresAt < Date.now()
    ) {
      return null;
    }

    const partner = getPartnerById(candidate.partnerId);
    if (!partner || partner.name !== candidate.partnerName) return null;
    return { partnerId: partner.id, partnerName: partner.name };
  } catch {
    return null;
  }
}

export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  return decodeSessionValue(cookieStore.get(COOKIE_NAME)?.value);
}
