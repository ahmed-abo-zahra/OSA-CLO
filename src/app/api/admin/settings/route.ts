import { getSession } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { NextResponse, type NextRequest } from 'next/server';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isText(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && value.length <= maxLength;
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
  if (session.partnerId !== 'safia') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  try {
    const value: unknown = await request.json();
    if (!isRecord(value)) return NextResponse.json({ error: 'Invalid settings.' }, { status: 400 });

    const fields = [
      'title_en', 'title_ar', 'message_en', 'message_ar',
      'button_text_en', 'button_text_ar', 'button_link', 'bg_color', 'text_color',
    ] as const;
    if (typeof value.enabled !== 'boolean' || fields.some((key) => !isText(value[key], key.includes('message') ? 500 : 160))) {
      return NextResponse.json({ error: 'Invalid settings.' }, { status: 400 });
    }
    if (
      typeof value.button_link !== 'string' || !value.button_link.startsWith('/') || value.button_link.startsWith('//') ||
      typeof value.bg_color !== 'string' || !/^#[0-9A-Fa-f]{6}$/.test(value.bg_color) ||
      typeof value.text_color !== 'string' || !/^#[0-9A-Fa-f]{6}$/.test(value.text_color)
    ) {
      return NextResponse.json({ error: 'Invalid link or colors.' }, { status: 400 });
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
