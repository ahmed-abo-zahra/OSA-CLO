import type { NextRequest } from 'next/server';

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
