'use client';

import { useEffect, useState, useCallback, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useLanguage } from '@/context/LanguageContext';
import { supabase } from '@/lib/supabase';

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
  partner_id?: string;
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

/**
 * Compute collective timer state from multiple orders.
 */
function resolveCollectiveState(orders: OrderRow[]): {
  state: 'confirmed' | 'expired' | 'countdown';
  anchorCreatedAt: string | null;
} {
  if (orders.length === 0) return { state: 'expired', anchorCreatedAt: null };

  const pending = orders.filter((o) => !CONFIRMED_STATUSES.has(o.payment_status));

  if (pending.length === 0) {
    return { state: 'confirmed', anchorCreatedAt: null };
  }

  const earliest = pending.reduce((earliest, o) =>
    o.created_at < earliest.created_at ? o : earliest
  );

  if (computeSecondsLeft(earliest.created_at) === 0) {
    return { state: 'expired', anchorCreatedAt: null };
  }

  return { state: 'countdown', anchorCreatedAt: earliest.created_at };
}

function TrackContent() {
  const searchParams = useSearchParams();
  const { t, isRTL } = useLanguage();

  // Support both single and multi-ID: ?orderId=xxx OR ?ids=id1,id2
  const initialIds = searchParams.get('ids')?.split(',').filter(Boolean) ?? [];
  const singleId = searchParams.get('orderId');
  const initialRaw = initialIds.length > 0
    ? initialIds.join(',')
    : (singleId ?? '');

  const [inputRaw, setInputRaw] = useState(initialRaw);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [timerState, setTimerState] = useState<TimerState>(
    initialRaw ? 'loading' : 'idle'
  );
  const [secondsLeft, setSecondsLeft] = useState(BOOKING_WINDOW_SECONDS);
  const [confirmedCount, setConfirmedCount] = useState(0);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const channelsRef = useRef<ReturnType<typeof supabase.channel>[]>([]);

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
          setTimerState('expired');
        }
      };
      tick();
      intervalRef.current = setInterval(tick, 1000);
    },
    [stopTimer]
  );

  const initFromOrders = useCallback(
    (fetchedOrders: OrderRow[]) => {
      const { state, anchorCreatedAt } = resolveCollectiveState(fetchedOrders);
      setConfirmedCount(
        fetchedOrders.filter((o) => CONFIRMED_STATUSES.has(o.payment_status)).length
      );

      if (state === 'confirmed') {
        stopTimer();
        setTimerState('confirmed');
      } else if (state === 'expired') {
        stopTimer();
        setTimerState('expired');
      } else if (state === 'countdown' && anchorCreatedAt) {
        setTimerState('countdown');
        startTimer(anchorCreatedAt);
      }
    },
    [startTimer, stopTimer]
  );

  const subscribeToOrders = useCallback(
    (ids: string[]) => {
      // Clean up previous channels
      channelsRef.current.forEach((ch) => supabase.removeChannel(ch));
      channelsRef.current = [];

      const channels = ids.map((id) =>
        supabase
          .channel(`track-order-${id}`)
          .on(
            'postgres_changes',
            {
              event: 'UPDATE',
              schema: 'public',
              table: 'orders',
              filter: `id=eq.${id}`,
            },
            (payload) => {
              const updated = payload.new as OrderRow;
              setOrders((prev) => {
                const next = prev.map((o) =>
                  o.id === updated.id ? { ...o, ...updated } : o
                );
                if (!prev.find((o) => o.id === updated.id)) {
                  next.push(updated);
                }

                const { state, anchorCreatedAt } = resolveCollectiveState(next);
                setConfirmedCount(
                  next.filter((o) => CONFIRMED_STATUSES.has(o.payment_status)).length
                );

                if (state === 'confirmed') {
                  stopTimer();
                  setTimerState('confirmed');
                } else if (state === 'expired') {
                  stopTimer();
                  setTimerState('expired');
                } else if (state === 'countdown' && anchorCreatedAt && !intervalRef.current) {
                  setTimerState('countdown');
                  startTimer(anchorCreatedAt);
                }

                return next;
              });
            }
          )
          .subscribe()
      );

      channelsRef.current = channels;
    },
    [stopTimer, startTimer]
  );

  const fetchOrders = useCallback(
    async (raw: string) => {
      const ids = raw.split(',').map((s) => s.trim()).filter(Boolean);
      if (ids.length === 0) return;

      setTimerState('loading');
      setOrders([]);
      stopTimer();
      channelsRef.current.forEach((ch) => supabase.removeChannel(ch));

      const { data, error } = await supabase
        .from('orders')
        .select(
          'id, payment_status, created_at, customer_name, customer_phone, total_amount, deposit_amount, shipping_address, partner_id'
        )
        .in('id', ids);

      if (error || !data || data.length === 0) {
        setTimerState('not_found');
        return;
      }

      setOrders(data as OrderRow[]);
      initFromOrders(data as OrderRow[]);
      subscribeToOrders(data.map((o: OrderRow) => o.id));
    },
    [initFromOrders, subscribeToOrders, stopTimer]
  );

  // Auto-fetch if IDs provided in URL
  useEffect(() => {
    if (initialRaw) {
      setInputRaw(initialRaw);
      fetchOrders(initialRaw);
    }
    return () => {
      stopTimer();
      channelsRef.current.forEach((ch) => supabase.removeChannel(ch));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputRaw.trim()) fetchOrders(inputRaw.trim());
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
            value={inputRaw}
            onChange={(e) => setInputRaw(e.target.value)}
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
            disabled={timerState === 'loading' || !inputRaw.trim()}
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

        {orders.length > 0 && timerState !== 'idle' && timerState !== 'loading' && timerState !== 'not_found' && (
          <div className="flex flex-col items-center gap-6 w-full">

            {/* ── Collective progress: confirmed / total ── */}
            {orders.length > 1 && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-green-600 dark:text-green-400 font-semibold">
                  {confirmedCount}/{orders.length}
                </span>
                <span className="text-zinc-400">{t('order.confirmedCount')}</span>
              </div>
            )}

            {/* ── Countdown clock (only when some pending) ── */}
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
                  {orders.length > 1
                    ? t('order.timer.descriptionMulti')
                        .replace('{count}', String(orders.length - confirmedCount))
                    : t('order.timer.description')}
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
                  {orders.length > 1
                    ? t('order.confirmed.descriptionMulti').replace('{count}', String(orders.length))
                    : t('order.confirmed.description')}
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

            {/* ── Individual order cards ── */}
            {orders.map((order) => (
              <div key={order.id} className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 divide-y divide-zinc-200 dark:divide-zinc-700">
                {/* Status badge */}
                <div className="px-4 py-2 flex items-center justify-between">
                  <StatusBadge status={order.payment_status} t={t} />
                  {order.partner_id && (
                    <span className="text-xs text-zinc-400 font-mono">
                      {order.partner_id}
                    </span>
                  )}
                </div>
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
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

export default function TrackPage() {
  return (
    <Suspense fallback={<main className="min-h-screen flex items-center justify-center bg-background text-foreground" />}>
      <TrackContent />
    </Suspense>
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
