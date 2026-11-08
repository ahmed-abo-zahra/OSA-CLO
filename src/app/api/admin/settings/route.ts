import { getSession } from '@/lib/session';
import { hasSameOrigin } from '@/lib/request-security';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { NextResponse, type NextRequest } from 'next/server';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isText(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && value.length <= maxLength;
}

function relativeLuminance(hex: string): number {
  const channels = [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255);
  const linear = channels.map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrastRatio(first: string, second: string): number {
  const values = [relativeLuminance(first), relativeLuminance(second)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabaseAdmin
    .from('store_settings')
    .select('value')
    .eq('key', 'promotional_popup')
    .maybeSingle();

  if (error) {
    console.error('[settings] read failed:', { code: error.code });
    return NextResponse.json({ error: 'Could not load store settings.' }, { status: 500 });
  }
  return NextResponse.json({ value: data?.value ?? null }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function PUT(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.partnerId !== 'partner-a') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (!hasSameOrigin(request)) return NextResponse.json({ error: 'Cross-origin requests are not allowed.' }, { status: 403 });

  try {
    const value: unknown = await request.json();
    if (!isRecord(value)) return NextResponse.json({ error: 'Invalid settings.' }, { status: 400 });

    const fields = [
      'title_en', 'title_ar', 'message_en', 'message_ar',
      'button_text_en', 'button_text_ar', 'button_link', 'bg_color', 'text_color',
    ] as const;
    const allowedFields = new Set<string>(['enabled', ...fields]);
    if (
      Object.keys(value).some((key) => !allowedFields.has(key)) ||
      typeof value.enabled !== 'boolean' ||
      fields.some((key) => !isText(value[key], key.includes('message') ? 500 : 160) || value[key].trim().length === 0)
    ) {
      return NextResponse.json({ error: 'Invalid settings.' }, { status: 400 });
    }
    if (
      typeof value.button_link !== 'string' || !value.button_link.startsWith('/') || value.button_link.startsWith('//') ||
      typeof value.bg_color !== 'string' || !/^#[0-9A-Fa-f]{6}$/.test(value.bg_color) ||
      typeof value.text_color !== 'string' || !/^#[0-9A-Fa-f]{6}$/.test(value.text_color)
    ) {
      return NextResponse.json({ error: 'Invalid link or colors.' }, { status: 400 });
    }
    const safeLink = new URL(value.button_link, request.nextUrl.origin);
    if (safeLink.origin !== request.nextUrl.origin) {
      return NextResponse.json({ error: 'Invalid link or colors.' }, { status: 400 });
    }
    if (contrastRatio(value.text_color, value.bg_color) < 4.5) {
      return NextResponse.json({ error: 'Text and background colors must have a contrast ratio of at least 4.5:1.' }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from('store_settings')
      .upsert({ key: 'promotional_popup', value, updated_at: new Date().toISOString() }, { onConflict: 'key' });

    if (error) {
      console.error('[settings] write failed:', { code: error.code });
      return NextResponse.json({ error: 'Could not save store settings.' }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof SyntaxError) return NextResponse.json({ error: 'Invalid JSON request.' }, { status: 400 });
    console.error('[settings] unexpected server error');
    return NextResponse.json({ error: 'Could not save store settings.' }, { status: 500 });
  }
}
