"use client";

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { useLang } from '@/context/LanguageContext';
import { DEMO_MODE } from '@/lib/demo-mode';
import { getCustomerAuthClient } from '@/lib/supabase-auth-browser';

type AccountMode = 'sign-in' | 'sign-up' | 'request-reset' | 'set-password';
type OrderItem = {
  product_name_en: string | null;
  product_name_ar: string | null;
  image_url: string | null;
  quantity: number;
  size: string | null;
  color: string | null;
  unit_price: number | string;
};
type CustomerOrder = {
  id: string;
  status: string;
  total_amount: number | string;
  paid_amount: number | string;
  requested_payment_type: string;
  created_at: string;
  order_items: OrderItem[];
};

function callbackUrl(next: string) {
  const url = new URL('/auth/callback', window.location.origin);
  url.searchParams.set('next', next);
  return url.toString();
}

function errorMessage(error: unknown, isRTL: boolean) {
  const raw = error instanceof Error ? error.message.toLowerCase() : '';
  if (raw.includes('invalid login')) return isRTL ? 'البريد أو كلمة المرور غير صحيحة.' : 'Email or password is incorrect.';
  if (raw.includes('password')) return isRTL ? 'كلمة المرور لا تستوفي متطلبات الأمان.' : 'The password does not meet security requirements.';
  return isRTL ? 'تعذّر إكمال الطلب الآن. حاول مرة أخرى لاحقًا.' : 'We could not complete that request. Please try again later.';
}

export default function CustomerAccountPage() {
  const { isRTL } = useLang();
  const [mode, setMode] = useState<AccountMode>('sign-in');
  const [user, setUser] = useState<User | null>(null);
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [authReady, setAuthReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [errorText, setErrorText] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (DEMO_MODE) {
      setAuthReady(true);
      return;
    }

    let active = true;
    try {
      const client = getCustomerAuthClient();
      client.auth.getUser().then(({ data }) => {
        if (active) setUser(data.user);
      }).catch(() => {
        if (active) setErrorText(isRTL ? 'تعذّر التحقق من جلسة الحساب.' : 'Could not verify the account session.');
      }).finally(() => {
        if (active) setAuthReady(true);
      });

      const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
        if (active) setUser(session?.user ?? null);
      });
      const params = new URLSearchParams(window.location.search);
      if (params.get('recovery') === '1') setMode('set-password');
      if (params.get('auth_error')) setErrorText(isRTL ? 'تعذّر تأكيد البريد أو استعادة الحساب. أعد المحاولة.' : 'Email confirmation or account recovery failed. Please try again.');
      return () => {
        active = false;
        subscription.unsubscribe();
      };
    } catch {
      setErrorText(isRTL ? 'تسجيل دخول العملاء غير مهيأ بعد.' : 'Customer sign-in is not configured yet.');
      setAuthReady(true);
    }
  }, [isRTL]);

  useEffect(() => {
    if (!user || DEMO_MODE) {
      setOrders([]);
      return;
    }
    let active = true;
    setOrdersLoading(true);
    fetch('/api/account/orders', { cache: 'no-store', credentials: 'same-origin' })
      .then(async (response) => {
        if (!response.ok) throw new Error('orders unavailable');
        return response.json() as Promise<{ orders: CustomerOrder[] }>;
      })
      .then((result) => { if (active) setOrders(Array.isArray(result.orders) ? result.orders : []); })
      .catch(() => { if (active) setErrorText(isRTL ? 'تعذّر تحميل سجل الطلبات.' : 'Could not load your order history.'); })
      .finally(() => { if (active) setOrdersLoading(false); });
    return () => { active = false; };
  }, [user, isRTL]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setErrorText('');
    setMessage('');
    try {
      const client = getCustomerAuthClient();
      if (mode === 'sign-in') {
        const { data, error } = await client.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
        setUser(data.user);
        setMessage(isRTL ? 'تم تسجيل الدخول.' : 'You are signed in.');
      } else if (mode === 'sign-up') {
        if (password.length < 12) throw new Error('password too short');
        const { data, error } = await client.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: callbackUrl('/account') },
        });
        if (error) throw error;
        if (data.session && data.user) {
          setUser(data.user);
          setMessage(isRTL ? 'تم إنشاء الحساب وتسجيل الدخول.' : 'Your account is ready and you are signed in.');
        } else {
          setMessage(isRTL ? 'أرسلنا رسالة تأكيد إلى بريدك. أكّد البريد ثم سجّل الدخول.' : 'A confirmation email was sent. Confirm your address, then sign in.');
          setMode('sign-in');
        }
      } else if (mode === 'request-reset') {
        const { error } = await client.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: callbackUrl('/account?recovery=1'),
        });
        if (error) throw error;
        setMessage(isRTL ? 'إذا كان البريد مسجلًا، ستصلك رسالة استعادة.' : 'If the email is registered, a recovery message will arrive.');
      } else {
        if (newPassword.length < 12) throw new Error('password too short');
        const { data, error } = await client.auth.updateUser({ password: newPassword });
        if (error) throw error;
        setUser(data.user);
        window.history.replaceState({}, '', '/account');
        setMode('sign-in');
        setNewPassword('');
        setMessage(isRTL ? 'تم تحديث كلمة المرور.' : 'Your password has been updated.');
      }
    } catch (error) {
      setErrorText(errorMessage(error, isRTL));
    } finally {
      setLoading(false);
    }
  }

  async function signOut() {
    setLoading(true);
    setErrorText('');
    try {
      const { error } = await getCustomerAuthClient().auth.signOut();
      if (error) throw error;
      setUser(null);
      setOrders([]);
      setMessage(isRTL ? 'تم تسجيل الخروج.' : 'You are signed out.');
    } catch (error) {
      setErrorText(errorMessage(error, isRTL));
    } finally {
      setLoading(false);
    }
  }

  const title = isRTL ? 'حساب العميل' : 'Customer account';
  const statusLabel = (status: string) => ({ pending: isRTL ? 'قيد المراجعة' : 'Pending', processing: isRTL ? 'قيد التجهيز' : 'Processing', shipped: isRTL ? 'تم الشحن' : 'Shipped', closed: isRTL ? 'مكتمل' : 'Completed', cancelled: isRTL ? 'ملغي' : 'Cancelled' }[status] ?? status);

  return (
    <main className="min-h-screen px-4 pb-20 pt-28 sm:px-6" dir={isRTL ? 'rtl' : 'ltr'}>
      <div className="mx-auto max-w-3xl">
        <div className="mb-8 border-b border-brand-border/30 pb-5 dark:border-white/10">
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-brand-accent">ASO CLO</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            {isRTL ? 'تابع طلباتك واحفظ سجل الشراء داخل حسابك.' : 'Follow your orders and keep your purchase history in one account.'}
          </p>
        </div>

        {DEMO_MODE ? (
          <section className="rounded border border-amber-300 bg-amber-50 p-5 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100" role="status">
            {isRTL ? 'حسابات العملاء متاحة على النسخة الحية فقط؛ هذه بيئة Demo معزولة.' : 'Customer accounts are available on the live site only; this is an isolated Demo environment.'}
          </section>
        ) : !authReady ? (
          <p role="status" className="text-sm text-gray-500">{isRTL ? 'جارٍ التحقق من الحساب…' : 'Checking your account…'}</p>
        ) : user && mode !== 'set-password' ? (
          <section className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4 rounded border border-brand-border/30 bg-white/70 p-5 dark:border-white/10 dark:bg-white/5">
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">{isRTL ? 'مسجل الدخول بالبريد' : 'Signed in as'}</p>
                <p className="mt-1 break-all text-sm font-semibold" dir="ltr">{user.email}</p>
              </div>
              <button type="button" onClick={signOut} disabled={loading} className="rounded border border-brand-border px-4 py-2 text-sm hover:bg-black/5 disabled:opacity-50 dark:border-white/20 dark:hover:bg-white/10">
                {loading ? (isRTL ? 'جارٍ التنفيذ…' : 'Please wait…') : (isRTL ? 'تسجيل الخروج' : 'Sign out')}
              </button>
            </div>

            <div>
              <div className="mb-3 flex items-end justify-between gap-3">
                <h2 className="text-xl font-semibold">{isRTL ? 'طلباتي' : 'My orders'}</h2>
                <Link href="/" className="text-sm text-brand-accent underline underline-offset-4">{isRTL ? 'متابعة التسوق' : 'Continue shopping'}</Link>
              </div>
              {ordersLoading ? <p role="status" className="py-6 text-sm text-gray-500">{isRTL ? 'جارٍ تحميل الطلبات…' : 'Loading orders…'}</p> : orders.length === 0 ? (
                <p className="rounded border border-brand-border/30 p-5 text-sm text-gray-500 dark:border-white/10">{isRTL ? 'لا توجد طلبات مرتبطة بهذا الحساب بعد.' : 'No orders are linked to this account yet.'}</p>
              ) : (
                <div className="space-y-3">
                  {orders.map((order) => (
                    <article key={order.id} className="rounded border border-brand-border/30 bg-white/70 p-4 dark:border-white/10 dark:bg-white/5">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-brand-border/20 pb-3 dark:border-white/10">
                        <div>
                          <p className="text-sm font-semibold">{isRTL ? 'طلب' : 'Order'} #{order.id.slice(0, 8)}</p>
                          <time className="mt-1 block text-xs text-gray-500" dateTime={order.created_at}>{new Date(order.created_at).toLocaleDateString(isRTL ? 'ar-EG' : 'en-US')}</time>
                        </div>
                        <span className="rounded-full bg-black/5 px-3 py-1 text-xs dark:bg-white/10">{statusLabel(order.status)}</span>
                      </div>
                      <ul className="space-y-2 py-3">
                        {(order.order_items ?? []).map((item, index) => (
                          <li key={`${order.id}-${index}`} className="flex flex-wrap justify-between gap-2 text-xs">
                            <span>{isRTL ? (item.product_name_ar || item.product_name_en) : item.product_name_en} × {item.quantity}{item.size ? ` · ${item.size}` : ''}{item.color ? ` · ${item.color}` : ''}</span>
                            <span>{(Number(item.unit_price) * item.quantity).toFixed(2)} {isRTL ? 'ج.م' : 'EGP'}</span>
                          </li>
                        ))}
                      </ul>
                      <div className="flex justify-between border-t border-brand-border/20 pt-3 text-sm dark:border-white/10">
                        <span>{isRTL ? 'الإجمالي' : 'Total'}</span>
                        <span className="font-semibold">{Number(order.total_amount).toFixed(2)} {isRTL ? 'ج.م' : 'EGP'}</span>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </section>
        ) : (
          <form onSubmit={handleSubmit} className="mx-auto max-w-md space-y-4 rounded border border-brand-border/30 bg-white/80 p-5 shadow-sm dark:border-white/10 dark:bg-white/5 sm:p-7">
            <div>
              <h2 className="text-xl font-semibold">
                {mode === 'sign-up' ? (isRTL ? 'إنشاء حساب' : 'Create account') : mode === 'request-reset' ? (isRTL ? 'استعادة كلمة المرور' : 'Reset password') : mode === 'set-password' ? (isRTL ? 'كلمة مرور جديدة' : 'Choose a new password') : (isRTL ? 'تسجيل الدخول' : 'Sign in')}
              </h2>
              <p className="mt-1 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                {isRTL ? 'استخدم بريدًا تملكه. تأكيد البريد مطلوب قبل تفعيل الحساب، وCheckout للضيف ما زال متاحًا.' : 'Use an email address you own. Email confirmation is required; guest checkout remains available.'}
              </p>
            </div>

            {mode !== 'set-password' && <label className="block space-y-1.5 text-xs font-medium">
              <span>{isRTL ? 'البريد الإلكتروني' : 'Email address'}</span>
              <input type="email" autoComplete="email" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} className="input-style" dir="ltr" />
            </label>}

            {(mode === 'sign-in' || mode === 'sign-up') && <label className="block space-y-1.5 text-xs font-medium">
              <span>{isRTL ? 'كلمة المرور' : 'Password'}</span>
              <input type="password" autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'} required minLength={mode === 'sign-up' ? 12 : 1} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} className="input-style" dir="ltr" />
              {mode === 'sign-up' && <span className="block font-normal text-gray-500">{isRTL ? '12 حرفًا على الأقل.' : 'At least 12 characters.'}</span>}
            </label>}

            {mode === 'set-password' && <label className="block space-y-1.5 text-xs font-medium">
              <span>{isRTL ? 'كلمة المرور الجديدة' : 'New password'}</span>
              <input type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} className="input-style" dir="ltr" />
              <span className="block font-normal text-gray-500">{isRTL ? '12 حرفًا على الأقل.' : 'At least 12 characters.'}</span>
            </label>}

            {errorText && <p role="alert" className="rounded border border-red-300 bg-red-50 p-3 text-xs text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">{errorText}</p>}
            {message && <p role="status" className="rounded border border-green-300 bg-green-50 p-3 text-xs text-green-900 dark:border-green-900 dark:bg-green-950/30 dark:text-green-200">{message}</p>}

            <button type="submit" disabled={loading} className="w-full rounded bg-brand-black px-4 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50 dark:bg-offwhite dark:text-brand-black">
              {loading ? (isRTL ? 'جارٍ التنفيذ…' : 'Please wait…') : mode === 'sign-up' ? (isRTL ? 'إنشاء الحساب' : 'Create account') : mode === 'request-reset' ? (isRTL ? 'إرسال رابط الاستعادة' : 'Send recovery link') : mode === 'set-password' ? (isRTL ? 'حفظ كلمة المرور' : 'Save password') : (isRTL ? 'تسجيل الدخول' : 'Sign in')}
            </button>

            {mode === 'sign-in' && <div className="flex flex-wrap justify-between gap-3 text-xs">
              <button type="button" onClick={() => { setMode('sign-up'); setErrorText(''); setMessage(''); }} className="underline underline-offset-4">{isRTL ? 'إنشاء حساب جديد' : 'Create an account'}</button>
              <button type="button" onClick={() => { setMode('request-reset'); setErrorText(''); setMessage(''); }} className="underline underline-offset-4">{isRTL ? 'نسيت كلمة المرور؟' : 'Forgot password?'}</button>
            </div>}
            {mode !== 'sign-in' && mode !== 'set-password' && <button type="button" onClick={() => { setMode('sign-in'); setErrorText(''); setMessage(''); }} className="w-full text-xs underline underline-offset-4">{isRTL ? 'العودة لتسجيل الدخول' : 'Back to sign in'}</button>}
            {mode === 'set-password' && <p className="text-center text-xs text-gray-500">{isRTL ? 'افتح رابط الاستعادة الذي وصلك بالبريد أولًا.' : 'Open the recovery link sent to your email first.'}</p>}
          </form>
        )}
      </div>
    </main>
  );
}
