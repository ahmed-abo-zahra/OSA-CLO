'use client';

import { useEffect, useState, useCallback, useRef, useMemo, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useLanguage } from '@/context/LanguageContext';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';

// ─── Constants ────────────────────────────────────────────────────────────────
const BOOKING_WINDOW_SECONDS = 20 * 60;
const CONFIRMED_STATUSES = new Set(['processing', 'shipped', 'closed']);

// ─── Types ────────────────────────────────────────────────────────────────────
type TimerState = 'loading' | 'countdown' | 'confirmed' | 'expired';

interface OrderRow {
  id: string;
  payment_status: string;
  created_at: string;
  customer_name: string;
  total_amount: number;
  deposit_amount: number;
  partner_id?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function computeSecondsLeft(createdAt: string): number {
  const createdMs = new Date(createdAt).getTime();
  const elapsedSeconds = Math.floor((Date.now() - createdMs) / 1000);
  return Math.max(0, BOOKING_WINDOW_SECONDS - elapsedSeconds);
}

function formatMMSS(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * Compute collective timer state across multiple orders.
 *
 * Rules:
 *  - ALL confirmed → "confirmed"
 *  - ANY pending + beyond window → "expired"
 *  - Otherwise → "countdown" (using the earliest pending order's created_at)
 */
function resolveCollectiveState(orders: OrderRow[]): {
  state: 'confirmed' | 'expired' | 'countdown';
  anchorCreatedAt: string | null;
} {
  if (orders.length === 0) return { state: 'expired', anchorCreatedAt: null };

  const pending = orders.filter((o) => !CONFIRMED_STATUSES.has(o.payment_status));

  if (pending.length === 0) {
    // All confirmed
    return { state: 'confirmed', anchorCreatedAt: null };
  }

  // Find the earliest pending order
  const earliest = pending.reduce((earliest, o) =>
    o.created_at < earliest.created_at ? o : earliest
  );

  if (computeSecondsLeft(earliest.created_at) === 0) {
    return { state: 'expired', anchorCreatedAt: null };
  }

  return { state: 'countdown', anchorCreatedAt: earliest.created_at };
}

// ─── Component ────────────────────────────────────────────────────────────────
function OrderSuccessContent() {
  const searchParams = useSearchParams();
  const idsParam = searchParams.get('ids');
  const orderIds = useMemo(
    () => (idsParam ? idsParam.split(',').filter(Boolean) : []),
    [idsParam]
  );
  const { t, isRTL } = useLanguage();

  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [timerState, setTimerState] = useState<TimerState>('loading');
  const [secondsLeft, setSecondsLeft] = useState(BOOKING_WINDOW_SECONDS);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [confirmedCount, setConfirmedCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const channelsRef = useRef<ReturnType<typeof supabase.channel>[]>([]);

  // ── Stop the countdown interval ───────────────────────────────────────────
  const stopTimer = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // ── Start the countdown interval ──────────────────────────────────────────
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

  // ── Initialize timer from collective state ────────────────────────────────
  const initFromOrders = useCallback(
    (fetchedOrders: OrderRow[]) => {
      const { state, anchorCreatedAt } = resolveCollectiveState(fetchedOrders);

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

  // ── Fetch all orders on mount ─────────────────────────────────────────────
  useEffect(() => {
    if (orderIds.length === 0) {
      setFetchError('no_order_id');
      setTimerState('expired');
      return;
    }

    (async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('id, payment_status, created_at, customer_name, total_amount, deposit_amount, partner_id')
        .in('id', orderIds);

      if (error || !data || data.length === 0) {
        setFetchError('fetch_failed');
        setTimerState('expired');
        return;
      }

      const rows = data as OrderRow[];
      setOrders(rows);
      setTotalCount(rows.length);
      setConfirmedCount(rows.filter((o) => CONFIRMED_STATUSES.has(o.payment_status)).length);
      initFromOrders(rows);
    })();
  }, [orderIds, initFromOrders]);

  // ── Real-time subscriptions for ALL order IDs ─────────────────────────────
  useEffect(() => {
    if (orderIds.length === 0) return;

    const channels = orderIds.map((id) =>
      supabase
        .channel(`order-status-${id}`)
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
              const next = prev.map((o) => (o.id === updated.id ? { ...o, ...updated } : o));
              // Add newly appearing orders (shouldn't happen, but safe)
              if (!prev.find((o) => o.id === updated.id)) {
                next.push(updated);
              }

              // Re-compute collective state from the updated list
              const { state, anchorCreatedAt } = resolveCollectiveState(next);
              setConfirmedCount(next.filter((o) => CONFIRMED_STATUSES.has(o.payment_status)).length);

              if (state === 'confirmed') {
                stopTimer();
                setTimerState('confirmed');
              } else if (state === 'countdown' && anchorCreatedAt) {
                setTimerState('countdown');
                // Only restart timer if anchor changed or timer was stopped
                const currentAnchor = intervalRef.current ? null : anchorCreatedAt;
                if (currentAnchor) startTimer(anchorCreatedAt);
              }
              // expired stays expired — don't transition back

              return next;
            });
          }
        )
        .subscribe()
    );

    channelsRef.current = channels;

    return () => {
      channels.forEach((ch) => supabase.removeChannel(ch));
      channelsRef.current = [];
    };
  }, [orderIds, stopTimer, startTimer]);

  // ── Cleanup on unmount ────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      stopTimer();
      channelsRef.current.forEach((ch) => supabase.removeChannel(ch));
    };
  }, [stopTimer]);

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <main
      className="min-h-screen flex flex-col items-center justify-center px-4 py-16 bg-background text-foreground"
      dir={isRTL ? 'rtl' : 'ltr'}
    >
      <div className="w-full max-w-md flex flex-col items-center gap-8">

        {/* ── LOADING ── */}
        {timerState === 'loading' && (
          <div className="flex flex-col items-center gap-4 animate-pulse">
            <div className="w-20 h-20 rounded-full bg-zinc-200 dark:bg-zinc-700" />
            <div className="h-4 w-40 rounded bg-zinc-200 dark:bg-zinc-700" />
          </div>
        )}

        {/* ── COUNTDOWN ── */}
        {timerState === 'countdown' && (
          <CountdownView
            secondsLeft={secondsLeft}
            orders={orders}
            confirmedCount={confirmedCount}
            totalCount={totalCount}
            t={t}
            isRTL={isRTL}
          />
        )}

        {/* ── CONFIRMED ── */}
        {timerState === 'confirmed' && (
          <ConfirmedView orders={orders} t={t} isRTL={isRTL} />
        )}

        {/* ── EXPIRED ── */}
        {timerState === 'expired' && (
          <ExpiredView fetchError={fetchError} orders={orders} t={t} isRTL={isRTL} />
        )}

        {/* ── Track orders link ── */}
        {orderIds.length > 0 && timerState !== 'loading' && (
          <Link
            href={`/track?ids=${orderIds.join(',')}`}
            className="text-sm text-zinc-500 dark:text-zinc-400 underline underline-offset-4 hover:text-zinc-800 dark:hover:text-zinc-100 transition-colors"
          >
            {t('order.trackOrder')}
          </Link>
        )}
      </div>
    </main>
  );
}

export default function OrderSuccessPage() {
  return (
    <Suspense fallback={<main className="min-h-screen flex items-center justify-center bg-background text-foreground" />}>
      <OrderSuccessContent />
    </Suspense>
  );
}

// ─── Sub-views ────────────────────────────────────────────────────────────────

interface ViewProps {
  orders: OrderRow[];
  t: (key: string) => string;
  isRTL: boolean;
}

// Countdown view with premium clock display
function CountdownView({
  secondsLeft,
  orders,
  confirmedCount,
  totalCount,
  t,
}: ViewProps & {
  secondsLeft: number;
  confirmedCount: number;
  totalCount: number;
}) {
  const urgency = secondsLeft < 120;
  const percentage = (secondsLeft / BOOKING_WINDOW_SECONDS) * 100;
  const circumference = 2 * Math.PI * 54;
  const pendingCount = totalCount - confirmedCount;

  return (
    <div className="flex flex-col items-center gap-6 w-full">
      {/* Progress indicator: confirmed / total */}
      {totalCount > 1 && (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-green-600 dark:text-green-400 font-semibold">
            {confirmedCount}/{totalCount}
          </span>
          <span className="text-zinc-400">{t('order.confirmedCount')}</span>
        </div>
      )}

      {/* Circular countdown clock */}
      <div className="relative w-40 h-40" role="timer" aria-live="polite">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
          <circle
            cx="60" cy="60" r="54"
            fill="none"
            stroke="currentColor"
            strokeWidth="6"
            className="text-zinc-200 dark:text-zinc-700"
          />
          <circle
            cx="60" cy="60" r="54"
            fill="none"
            strokeWidth="6"
            strokeLinecap="round"
            stroke={urgency ? '#ef4444' : '#22c55e'}
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - percentage / 100)}
            className="transition-all duration-1000 ease-linear"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className={`text-3xl font-mono font-bold tabular-nums tracking-tight ${
              urgency
                ? 'text-red-500 animate-pulse'
                : 'text-zinc-800 dark:text-zinc-100'
            }`}
          >
            {formatMMSS(secondsLeft)}
          </span>
          <span className="text-xs text-zinc-400 mt-0.5">
            {t('order.timer.minutes')}
          </span>
        </div>
      </div>

      {/* Heading */}
      <div className="text-center space-y-2">
        <h1 className="text-xl font-bold text-zinc-800 dark:text-zinc-100">
          {t('order.timer.heading')}
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed max-w-sm">
          {totalCount > 1
            ? t('order.timer.descriptionMulti')
                .replace('{count}', String(pendingCount))
            : t('order.timer.description')}
        </p>
      </div>

      {/* Order summary cards */}
      {orders.map((order) => (
        <OrderSummaryCard key={order.id} order={order} t={t} />
      ))}

      {/* Manual payment instructions */}
      <div className="w-full rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 p-4 space-y-1.5">
        <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
          {t('order.payment.instructions.title')}
        </p>
        <p className="text-sm text-amber-700 dark:text-amber-400">
          {t('order.payment.instructions.body')}
        </p>
      </div>
    </div>
  );
}

// Confirmed view — all orders approved
function ConfirmedView({ orders, t }: ViewProps) {
  return (
    <div className="flex flex-col items-center gap-6 w-full">
      <div className="w-20 h-20 rounded-full bg-green-100 dark:bg-green-900/40 flex items-center justify-center">
        <svg
          className="w-10 h-10 text-green-600 dark:text-green-400"
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </div>

      <div className="text-center space-y-2">
        <h1 className="text-2xl font-bold text-green-700 dark:text-green-400">
          {t('order.confirmed.heading')}
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          {orders.length > 1
            ? t('order.confirmed.descriptionMulti').replace('{count}', String(orders.length))
            : t('order.confirmed.description')}
        </p>
      </div>

      {orders.map((order) => (
        <OrderSummaryCard key={order.id} order={order} t={t} />
      ))}
    </div>
  );
}

// Expired view — timeout or error
function ExpiredView({ fetchError, orders, t }: ViewProps & { fetchError: string | null }) {
  return (
    <div className="flex flex-col items-center gap-6 w-full">
      <div className="w-20 h-20 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
        <svg
          className="w-10 h-10 text-orange-500 dark:text-orange-400"
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round"
            d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
          />
        </svg>
      </div>

      <div className="text-center space-y-2 px-2">
        <h1 className="text-xl font-bold text-zinc-800 dark:text-zinc-100">
          {t('order.expired.heading')}
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed">
          {fetchError
            ? t('order.expired.fetchError')
            : t('order.expired.description')}
        </p>
      </div>

      {orders.map((order) => (
        <OrderSummaryCard key={order.id} order={order} t={t} />
      ))}

      <a
        href="https://wa.me/YOUR_SUPPORT_NUMBER"
        target="_blank"
        rel="noopener noreferrer"
        className="
          inline-flex items-center gap-2 px-6 py-3 rounded-xl
          bg-green-600 hover:bg-green-700 text-white
          font-medium text-sm transition-colors
        "
      >
        <WhatsAppIcon />
        {t('order.expired.contactSupport')}
      </a>
    </div>
  );
}

// Shared order summary card
function OrderSummaryCard({ order, t }: { order: OrderRow; t: (k: string) => string }) {
  return (
    <div className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 p-4 space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="text-zinc-500 dark:text-zinc-400">{t('order.summary.orderId')}</span>
        <span className="font-mono text-xs text-zinc-700 dark:text-zinc-300 truncate max-w-[140px]">
          {order.id}
        </span>
      </div>
      {order.partner_id && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-zinc-500 dark:text-zinc-400">{t('order.summary.partner')}</span>
          <span className="font-medium text-zinc-800 dark:text-zinc-100 text-xs">
            {order.partner_id}
          </span>
        </div>
      )}
      <div className="flex items-center justify-between text-sm">
        <span className="text-zinc-500 dark:text-zinc-400">{t('order.summary.customer')}</span>
        <span className="font-medium text-zinc-800 dark:text-zinc-100">{order.customer_name}</span>
      </div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-zinc-500 dark:text-zinc-400">{t('order.summary.total')}</span>
        <span className="font-bold text-zinc-800 dark:text-zinc-100">
          {order.total_amount} {t('currency')}
        </span>
      </div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-zinc-500 dark:text-zinc-400">{t('order.summary.deposit')}</span>
        <span className="font-medium text-zinc-600 dark:text-zinc-300">
          {order.deposit_amount} {t('currency')}
        </span>
      </div>
    </div>
  );
}

function WhatsAppIcon() {
  return (
    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
      <path d="M12 0C5.373 0 0 5.373 0 12c0 2.124.556 4.118 1.528 5.846L0 24l6.335-1.652A11.954 11.954 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.818 9.818 0 01-5.015-1.375l-.359-.213-3.735.979.994-3.632-.234-.374A9.818 9.818 0 0112 2.182c5.42 0 9.818 4.398 9.818 9.818 0 5.421-4.398 9.818-9.818 9.818z"/>
    </svg>
  );
}
