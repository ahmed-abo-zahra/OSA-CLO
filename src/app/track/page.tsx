'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { useLanguage } from '@/context/LanguageContext';
import Link from 'next/link';

// ─── Constants ────────────────────────────────────────────────────────────────
const BOOKING_WINDOW_SECONDS = 20 * 60;
const CONFIRMED_STATUSES = new Set(['processing', 'shipped', 'closed']);

type TimerState = 'idle' | 'loading' | 'countdown' | 'confirmed' | 'expired' | 'not_found';

interface OrderRow {
  id: string;
  payment_status: string;
  created_at: string;
  customer_name: string;
  customer_phone: string;
  total_amount: number;
  deposit_amount: number;
  shipping_address: string;
}

function computeSecondsLeft(createdAt: string): number {
  const elapsed = Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000);
  return Math.max(0, BOOKING_WINDOW_SECONDS - elapsed);
}

function formatMMSS(s: number): string {
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

const STATUS_LABEL_MAP: Record<string, string> = {
  pending: 'order.status.pending',
  processing: 'order.status.processing',
  shipped: 'order.status.shipped',
  closed: 'order.status.closed',
};

export default function TrackPage() {
  const searchParams = useSearchParams();
  const { t, language } = useLanguage();
  const supabase = createClientComponentClient();
  const isRTL = language === 'ar';

  const [inputId, setInputId] = useState(searchParams.get('orderId') ?? '');
  const [order, setOrder] = useState<OrderRow | null>(null);
  const [timerState, setTimerState] = useState<TimerState>('idle');
  const [secondsLeft, setSecondsLeft] = useState(BOOKING_WINDOW_SECONDS);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const stopTimer = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const startTimer = useCallback(
    (createdAt: string) => {
      stopTimer();
      const tick = () => {
        const left = computeSecondsLeft(createdAt);
        setSecondsLeft(left);
        if (left === 0) {
          stopTimer();
          setTimerState((prev) => (prev === 'countdown' ? 'expired' : prev));
        }
      };
      tick();
      intervalRef.current = setInterval(tick, 1000);
    },
    [stopTimer]
  );

  const resolveState = useCallback(
    (row: OrderRow) => {
      if (CONFIRMED_STATUSES.has(row.payment_status)) {
        stopTimer();
        setTimerState('confirmed');
        return;
      }
      const left = computeSecondsLeft(row.created_at);
      if (left === 0) {
        setTimerState('expired');
      } else {
        setTimerState('countdown');
        startTimer(row.created_at);
      }
    },
    [startTimer, stopTimer]
  );

  const subscribeToOrder = useCallback(
    (orderId: string) => {
      // Remove previous channel
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }

      channelRef.current = supabase
        .channel(`track-order-${orderId}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'orders',
            filter: `id=eq.${orderId}`,
          },
          (payload) => {
            const updated = payload.new as OrderRow;
            setOrder((prev) => ({ ...(prev ?? updated), ...updated }));
            if (CONFIRMED_STATUSES.has(updated.payment_status)) {
              stopTimer();
              setTimerState('confirmed');
            }
          }
        )
        .subscribe();
    },
    [supabase, stopTimer]
  );

  const fetchOrder = useCallback(
    async (id: string) => {
      if (!id.trim()) return;
      setTimerState('loading');
      setOrder(null);
      stopTimer();

      const { data, error } = await supabase
        .from('orders')
        .select(
          'id, payment_status, created_at, customer_name, customer_phone, total_amount, deposit_amount, shipping_address'
        )
        .eq('id', id.trim())
        .single();

      if (error || !data) {
        setTimerState('not_found');
        return;
      }

      setOrder(data as OrderRow);
      resolveState(data as OrderRow);
      subscribeToOrder(data.id);
    },
    [supabase, resolveState, subscribeToOrder, stopTimer]
  );

  // Auto-fetch if orderId in URL
  useEffect(() => {
    const id = searchParams.get('orderId');
    if (id) {
      setInputId(id);
      fetchOrder(id);
    }
    return () => {
      stopTimer();
      if (channelRef.current) supabase.removeChannel(channelRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputId.trim()) fetchOrder(inputId.trim());
  };

  const percentage = (secondsLeft / BOOKING_WINDOW_SECONDS) * 100;
  const circumference = 2 * Math.PI * 54;
  const urgency = secondsLeft < 120;

  return (
    <main
      className="min-h-screen flex flex-col items-center justify-center px-4 py-16 bg-background text-foreground"
      dir={isRTL ? 'rtl' : 'ltr'}
    >
      <div className="w-full max-w-lg space-y-8">

        {/* ── Page header ── */}
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-bold text-zinc-800 dark:text-zinc-100">
            {t('track.heading')}
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {t('track.subheading')}
          </p>
        </div>

        {/* ── Search form ── */}
        <form onSubmit={handleSearch} className="flex gap-2">
          <input
            type="text"
            value={inputId}
            onChange={(e) => setInputId(e.target.value)}
            placeholder={t('track.inputPlaceholder')}
            className="
              flex-1 px-4 py-3 rounded-xl
              border border-zinc-200 dark:border-zinc-700
              bg-white dark:bg-zinc-900
              text-zinc-800 dark:text-zinc-100
              placeholder:text-zinc-400
              focus:outline-none focus:ring-2 focus:ring-zinc-400
              text-sm font-mono
            "
            aria-label={t('track.inputLabel')}
          />
          <button
            type="submit"
            disabled={timerState === 'loading' || !inputId.trim()}
            className="
              px-5 py-3 rounded-xl
              bg-zinc-800 dark:bg-zinc-100
              text-white dark:text-zinc-900
              font-medium text-sm
              hover:bg-zinc-700 dark:hover:bg-zinc-200
              disabled:opacity-50 disabled:cursor-not-allowed
              transition-colors
            "
          >
            {timerState === 'loading' ? '...' : t('track.searchButton')}
          </button>
        </form>

        {/* ── States ── */}

        {timerState === 'not_found' && (
          <div className="text-center py-8 text-zinc-400 dark:text-zinc-500">
            {t('track.notFound')}
          </div>
        )}

        {order && timerState !== 'idle' && timerState !== 'loading' && timerState !== 'not_found' && (
          <div className="flex flex-col items-center gap-6 w-full">

            {/* ── Status badge ── */}
            <StatusBadge status={order.payment_status} t={t} />

            {/* ── Countdown clock (only when pending) ── */}
            {timerState === 'countdown' && (
              <div className="flex flex-col items-center gap-3">
                <div className="relative w-36 h-36" role="timer" aria-live="polite">
                  <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
                    <circle cx="60" cy="60" r="54" fill="none"
                      stroke="currentColor" strokeWidth="6"
                      className="text-zinc-200 dark:text-zinc-700"
                    />
                    <circle cx="60" cy="60" r="54" fill="none"
                      strokeWidth="6" strokeLinecap="round"
                      stroke={urgency ? '#ef4444' : '#22c55e'}
                      strokeDasharray={circumference}
                      strokeDashoffset={circumference * (1 - percentage / 100)}
                      className="transition-all duration-1000 ease-linear"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className={`text-3xl font-mono font-bold tabular-nums ${urgency ? 'text-red-500 animate-pulse' : 'text-zinc-800 dark:text-zinc-100'}`}>
                      {formatMMSS(secondsLeft)}
                    </span>
                    <span className="text-xs text-zinc-400">{t('order.timer.minutes')}</span>
                  </div>
                </div>
                <p className="text-sm text-center text-zinc-500 dark:text-zinc-400 max-w-xs">
                  {t('order.timer.description')}
                </p>
              </div>
            )}

            {/* ── Confirmed banner ── */}
            {timerState === 'confirmed' && (
              <div className="w-full rounded-xl bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 p-4 text-center space-y-1">
                <p className="font-bold text-green-700 dark:text-green-400 text-lg">
                  ✓ {t('order.confirmed.heading')}
                </p>
                <p className="text-sm text-green-600 dark:text-green-500">
                  {t('order.confirmed.description')}
                </p>
              </div>
            )}

            {/* ── Expired banner ── */}
            {timerState === 'expired' && (
              <div className="w-full rounded-xl bg-orange-50 dark:bg-orange-900/30 border border-orange-200 dark:border-orange-800 p-4 text-center space-y-2">
                <p className="font-bold text-orange-700 dark:text-orange-400">
                  {t('order.expired.heading')}
                </p>
                <p className="text-sm text-orange-600 dark:text-orange-400">
                  {t('order.expired.description')}
                </p>
                <a
                  href="https://wa.me/YOUR_SUPPORT_NUMBER"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block mt-2 px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-medium transition-colors"
                >
                  {t('order.expired.contactSupport')}
                </a>
              </div>
            )}

            {/* ── Order details card ── */}
            <div className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 divide-y divide-zinc-200 dark:divide-zinc-700">
              {[
                { label: 'order.summary.orderId', value: order.id, mono: true },
                { label: 'order.summary.customer', value: order.customer_name },
                { label: 'order.summary.phone', value: order.customer_phone },
                { label: 'order.summary.address', value: order.shipping_address },
                { label: 'order.summary.total', value: `${order.total_amount} ${t('currency')}`, bold: true },
                { label: 'order.summary.deposit', value: `${order.deposit_amount} ${t('currency')}` },
              ].map(({ label, value, mono, bold }) => (
                <div key={label} className="flex items-start justify-between px-4 py-3 text-sm gap-4">
                  <span className="text-zinc-500 dark:text-zinc-400 shrink-0">{t(label)}</span>
                  <span className={`text-right break-all ${mono ? 'font-mono text-xs' : ''} ${bold ? 'font-bold' : 'font-medium'} text-zinc-800 dark:text-zinc-100`}>
                    {value}
                  </span>
                </div>
              ))}
            </div>

            <Link
              href={`/order/success?orderId=${order.id}`}
              className="text-sm text-zinc-400 underline underline-offset-4 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
            >
              {t('track.viewSuccess')}
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}

function StatusBadge({ status, t }: { status: string; t: (k: string) => string }) {
  const colorMap: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300 border-yellow-200 dark:border-yellow-700',
    processing: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 border-blue-200 dark:border-blue-700',
    shipped: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300 border-purple-200 dark:border-purple-700',
    closed: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300 border-green-200 dark:border-green-700',
  };
  const color = colorMap[status] ?? 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700';

  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-semibold ${color}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" aria-hidden="true" />
      {t(STATUS_LABEL_MAP[status] ?? 'order.status.unknown')}
    </span>
  );
}
