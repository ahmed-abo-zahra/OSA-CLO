'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useLanguage } from '@/context/LanguageContext';
import { DEMO_MODE } from '@/lib/demo-mode';
import { TRACKING_TOKEN_PATTERN } from '@/lib/tracking-token-format';

interface TrackedOrder {
  key: string;
  reference: string;
  status: string;
  customer: string;
  total: number;
  paid: number;
  remaining: number;
  created_at: string;
  updated_at: string;
}

export default function OrderTracking({ success = false }: { success?: boolean }) {
  const { lang, isRTL } = useLanguage();
  const [input, setInput] = useState('');
  const [orders, setOrders] = useState<TrackedOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const text = (en: string, ar: string) => lang === 'ar' ? ar : en;

  const labels: Record<string, string> = {
    pending: text('Order received', 'تم استلام الطلب'),
    processing: text('Preparing your order', 'جاري تجهيز الطلب'),
    shipped: text('Shipped', 'تم الشحن'),
    closed: text('Completed', 'مكتمل'),
  };

  const search = useCallback(async (raw: string, signal?: AbortSignal) => {
    const tokens = raw.split(',').map((value) => value.trim()).filter(Boolean);
    if (tokens.length < 1 || tokens.length > 8 || tokens.some((token) => !TRACKING_TOKEN_PATTERN.test(token))) {
      setOrders([]);
      setError('invalid');
      return;
    }

    setLoading(true);
    setError('');
    setOrders([]);
    try {
      const result = await Promise.all(tokens.map(async (token) => {
        const response = await fetch('/api/track', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
          signal,
          cache: 'no-store',
        });
        if (!response.ok) throw new Error(response.status === 404 ? 'not-found' : 'load-error');
        const order = await response.json() as Omit<TrackedOrder, 'key'>;
        return { ...order, key: token };
      }));
      setOrders(result);
    } catch (cause) {
      if (cause instanceof Error && cause.name === 'AbortError') return;
      setError(cause instanceof Error && cause.message === 'not-found' ? 'not-found' : 'load-error');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    let hashToken = '';
    if (success && window.location.hash.startsWith('#track=')) {
      try { hashToken = decodeURIComponent(window.location.hash.slice('#track='.length)); } catch { hashToken = ''; }
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
    }
    const initial = success ? hashToken : '';
    if (!initial) return;
    setInput(initial);
    const controller = new AbortController();
    void search(initial, controller.signal);
    return () => controller.abort();
  }, [search, success]);

  return (
    <section dir={isRTL ? 'rtl' : 'ltr'} className="max-w-xl mx-auto px-4 py-10 sm:py-16">
      <Link href="/" className="text-xs underline">{text('Back to shop', 'العودة للمتجر')}</Link>
      <h1 className="text-3xl font-black mt-6 mb-3">
        {success
          ? (DEMO_MODE ? text('Your demo order is received', 'تم استلام طلبك التجريبي') : text('Your order is received', 'تم استلام طلبك'))
          : text('Track your order', 'تتبع طلبك')}
      </h1>
      <p className="text-sm text-brand-muted mb-6">
        {text('Enter your private tracking code to see the latest status.', 'أدخل رمز التتبع الخاص لمعرفة آخر تحديث لحالة طلبك.')}
      </p>
      {DEMO_MODE && (
        <p className="border border-brand-border p-4 mb-6 text-sm">
          {text('Presentation only. No payment was collected. Do not transfer money.', 'للعرض فقط. لم يتم تحصيل أي مبلغ. لا تحوّل أي أموال.')}
        </p>
      )}
      <form className="flex flex-col sm:flex-row gap-2" onSubmit={(event) => { event.preventDefault(); void search(input); }}>
        <label htmlFor="order-reference" className="sr-only">{text('Private tracking code', 'رمز التتبع الخاص')}</label>
        <input
          id="order-reference"
          className="input-style w-full min-w-0 flex-1"
          dir="ltr"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={text('Private tracking code', 'رمز التتبع الخاص')}
          autoComplete="off"
        />
        <button disabled={loading || !input.trim()} className="px-6 py-3 bg-brand-black text-white dark:bg-offwhite dark:text-brand-black text-xs font-bold disabled:opacity-50">
          {loading ? text('Loading…', 'جاري التحميل…') : text('Track order', 'تتبع الطلب')}
        </button>
      </form>
      {loading && <p role="status" className="py-8 text-sm">{text('Loading order details…', 'جاري تحميل تفاصيل الطلب…')}</p>}
      {error && (
        <div role="alert" className="border p-4 mt-6 text-sm">
          {error === 'invalid'
            ? text('Enter a valid private tracking code.', 'أدخل رمز تتبع خاص صالحًا.')
            : error === 'not-found'
              ? text('No order found for this tracking code.', 'لم يتم العثور على طلب بهذا الرمز.')
              : text('Could not load your order. Please retry.', 'تعذر تحميل طلبك. حاول مرة أخرى.')}
          <button type="button" className="underline ms-2" onClick={() => void search(input)}>{text('Retry', 'إعادة المحاولة')}</button>
        </div>
      )}
      <div className="space-y-4 mt-6">
        {orders.map((order) => (
          <article key={order.key} className="border border-brand-border dark:border-brand-border/30 p-5">
            <p className="text-xs font-bold mb-4">{labels[order.status] ?? text('Status unavailable', 'الحالة غير متاحة')}</p>
            <dl className="text-sm space-y-3">
              {[
                [text('Reference', 'مرجع الطلب'), order.reference],
                [text('Customer', 'العميل'), order.customer],
                [text('Total', 'الإجمالي'), `${order.total.toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-EG')} ${text('EGP', 'ج.م')}`],
                [text('Payment collected', 'المبلغ المحصل'), `${order.paid.toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-EG')} ${text('EGP', 'ج.م')}`],
                [text('Remaining', 'المتبقي'), `${order.remaining.toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-EG')} ${text('EGP', 'ج.م')}`],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between items-start gap-4">
                  <dt className="shrink-0 text-brand-muted">{label}</dt>
                  <dd className="text-end break-all">{value}</dd>
                </div>
              ))}
            </dl>
            <ol className="flex flex-wrap gap-2 mt-5" aria-label={text('Order progress', 'مراحل الطلب')}>
              {Object.entries(labels).map(([status, label], index) => (
                <li key={status} className={`px-2 py-2 text-[10px] border ${Object.keys(labels).indexOf(order.status) >= index ? 'bg-brand-black text-white dark:bg-offwhite dark:text-brand-black' : 'text-brand-muted'}`}>
                  {label}
                </li>
              ))}
            </ol>
          </article>
        ))}
      </div>
    </section>
  );
}
