'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { useLanguage } from '@/context/LanguageContext';
import Link from 'next/link';

// ─── Constants ────────────────────────────────────────────────────────────────
const BOOKING_WINDOW_SECONDS = 20 * 60; // 20 minutes
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

// ─── Component ────────────────────────────────────────────────────────────────
export default function OrderSuccessPage() {
  const searchParams = useSearchParams();
  const orderId = searchParams.get('orderId');
  const { t, language } = useLanguage();
  const supabase = createClientComponentClient();
  const isRTL = language === 'ar';

  const [order, setOrder] = useState<OrderRow | null>(null);
  const [timerState, setTimerState] = useState<TimerState>('loading');
  const [secondsLeft, setSecondsLeft] = useState(BOOKING_WINDOW_SECONDS);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
          setTimerState((prev) =>
            prev === 'countdown' ? 'expired' : prev
          );
        }
      };
      tick(); // run immediately
      intervalRef.current = setInterval(tick, 1000);
    },
    [stopTimer]
  );

  // ── Resolve initial timer state from order ────────────────────────────────
  const resolveTimerState = useCallback(
    (row: OrderRow) => {
      if (CONFIRMED_STATUSES.has(row.payment_status)) {
        stopTimer();
        setTimerState('confirmed');
        return;
      }
      // Still pending — start countdown
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

  // ── Fetch order on mount ───────────────────────────────────────────────────
  useEffect(() => {
    if (!orderId) {
      setFetchError('no_order_id');
      setTimerState('expired');
      return;
    }

    (async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('id, payment_status, created_at, customer_name, total_amount, deposit_amount')
        .eq('id', orderId)
        .single();

      if (error || !data) {
        setFetchError('fetch_failed');
        setTimerState('expired');
        return;
      }

      setOrder(data as OrderRow);
      resolveTimerState(data as OrderRow);
    })();
  }, [orderId, supabase, resolveTimerState]);

  // ── Real-time subscription — admin status changes ─────────────────────────
  useEffect(() => {
    if (!orderId) return;

    const channel = supabase
      .channel(`order-status-${orderId}`)
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

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orderId, supabase, stopTimer]);

  // ── Cleanup on unmount ────────────────────────────────────────────────────
  useEffect(() => {
    return () => stopTimer();
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
            order={order}
            t={t}
            isRTL={isRTL}
          />
        )}

        {/* ── CONFIRMED ── */}
        {timerState === 'confirmed' && (
          <ConfirmedView order={order} t={t} isRTL={isRTL} />
        )}

        {/* ── EXPIRED ── */}
        {timerState === 'expired' && (
          <ExpiredView fetchError={fetchError} order={order} t={t} isRTL={isRTL} />
        )}

        {/* ── Track order link ── */}
        {orderId && timerState !== 'loading' && (
          <Link
            href={`/track?orderId=${orderId}`}
            className="text-sm text-zinc-500 dark:text-zinc-400 underline underline-offset-4 hover:text-zinc-800 dark:hover:text-zinc-100 transition-colors"
          >
            {t('order.trackOrder')}
          </Link>
        )}
      </div>
    </main>
  );
}

// ─── Sub-views ────────────────────────────────────────────────────────────────

interface ViewProps {
  order: OrderRow | null;
  t: (key: string) => string;
  isRTL: boolean;
}

// Countdown view with premium clock display
function CountdownView({
  secondsLeft,
  order,
  t,
  isRTL,
}: ViewProps & { secondsLeft: number }) {
  const urgency = secondsLeft < 120; // last 2 minutes
  const percentage = (secondsLeft / BOOKING_WINDOW_SECONDS) * 100;
  const circumference = 2 * Math.PI * 54; // r=54

  return (
    <div className="flex flex-col items-center gap-6 w-full">
      {/* Circular countdown clock */}
      <div className="relative w-40 h-40" role="timer" aria-live="polite">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
          {/* Track */}
          <circle
            cx="60" cy="60" r="54"
            fill="none"
            stroke="currentColor"
            strokeWidth="6"
            className="text-zinc-200 dark:text-zinc-700"
          />
          {/* Progress */}
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
        {/* Time text */}
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
          {t('order.timer.description')}
        </p>
      </div>

      {/* Order summary card */}
      {order && (
        <OrderSummaryCard order={order} t={t} isRTL={isRTL} />
      )}

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

// Confirmed view — admin approved
function ConfirmedView({ order, t, isRTL }: ViewProps) {
  return (
    <div className="flex flex-col items-center gap-6 w-full">
      {/* Success icon */}
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
          {t('order.confirmed.description')}
        </p>
      </div>

      {order && <OrderSummaryCard order={order} t={t} isRTL={isRTL} />}
    </div>
  );
}

// Expired view — timeout or error
function ExpiredView({ fetchError, order, t, isRTL }: ViewProps & { fetchError: string | null }) {
  return (
    <div className="flex flex-col items-center gap-6 w-full">
      {/* Warning icon */}
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

      {order && <OrderSummaryCard order={order} t={t} isRTL={isRTL} />}

      {/* Support CTA */}
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
function OrderSummaryCard({ order, t }: Omit<ViewProps, 'isRTL'>) {
  return (
    <div className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 p-4 space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="text-zinc-500 dark:text-zinc-400">{t('order.summary.orderId')}</span>
        <span className="font-mono text-xs text-zinc-700 dark:text-zinc-300 truncate max-w-[140px]">
          {order.id}
        </span>
      </div>
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
