'use client';
import {useEffect,useState} from 'react';
import {useSearchParams} from 'next/navigation';
import Link from 'next/link';
import {useLanguage} from '@/context/LanguageContext';
import {DEMO_MODE} from '@/lib/demo-mode';
interface Order {id:string;status:string;customer:string;total:number;paid:number;remaining:number;created_at:string}
export default function OrderTracking({success=false}:{success?:boolean}){
 const {lang,isRTL}=useLanguage();const params=useSearchParams();
 const initial=params.get('ids')??params.get('orderId')??'';
 const [input,setInput]=useState(initial),[orders,setOrders]=useState<Order[]>([]),[loading,setLoading]=useState(false),[error,setError]=useState('');
 const text=(en:string,ar:string)=>lang==='ar'?ar:en;
 const labels:Record<string,string>={pending:text('Order received','تم استلام الطلب'),processing:text('Preparing your order','جاري تجهيز الطلب'),shipped:text('Shipped','تم الشحن'),closed:text('Completed','مكتمل')};
 async function search(raw:string,signal?:AbortSignal){const ids=raw.split(',').map(x=>x.trim()).filter(Boolean);if(!ids.length)return;setLoading(true);setError('');setOrders([]);
 try{const result=await Promise.all(ids.slice(0,8).map(async id=>{if(!/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(id))throw new Error('not-found');const response=await fetch(`/api/track/${encodeURIComponent(id)}`,{signal});if(!response.ok)throw new Error(response.status===404?'not-found':'load-error');return response.json() as Promise<Order>;}));setOrders(result);}catch(e){if(e instanceof Error&&e.name==='AbortError')return;setError(e instanceof Error&&e.message==='not-found'?'not-found':'load-error');}finally{if(!signal?.aborted)setLoading(false);}}
 useEffect(()=>{const controller=new AbortController();if(initial)search(initial,controller.signal);return()=>controller.abort();},[initial]);
 return <section dir={isRTL?'rtl':'ltr'} className="max-w-xl mx-auto px-4 py-10 sm:py-16">
  <Link href="/" className="text-xs underline">{text('Back to shop','العودة للمتجر')}</Link>
  <h1 className="text-3xl font-black mt-6 mb-3">{success?(DEMO_MODE?text('Your demo order is received','تم استلام طلبك التجريبي'):text('Your order is received','تم استلام طلبك')):text('Track your order','تتبع طلبك')}</h1>
  <p className="text-sm text-brand-muted mb-6">{text('Enter the full order reference to see its latest status.','أدخل رقم الطلب كاملًا لمعرفة آخر تحديث لحالته.')}</p>
  {DEMO_MODE&&<p className="border border-brand-border p-4 mb-6 text-sm">{text('Presentation only. No payment was collected. Do not transfer money.','للعرض فقط. لم يتم تحصيل أي مبلغ. لا تحوّل أي أموال.')}</p>}
  <form className="flex flex-col sm:flex-row gap-2" onSubmit={e=>{e.preventDefault();search(input);}}>
   <label htmlFor="order-reference" className="sr-only">{text('Order reference','رقم الطلب')}</label>
   <input id="order-reference" className="input-style w-full min-w-0 flex-1" dir="ltr" value={input} onChange={e=>setInput(e.target.value)} placeholder={text('Order reference','رقم الطلب')} />
   <button disabled={loading||!input.trim()} className="px-6 py-3 bg-brand-black text-white dark:bg-offwhite dark:text-brand-black text-xs font-bold disabled:opacity-50">{loading?text('Loading…','جاري التحميل…'):text('Track order','تتبع الطلب')}</button>
  </form>
  {loading&&<p role="status" className="py-8 text-sm">{text('Loading order details…','جاري تحميل تفاصيل الطلب…')}</p>}
  {error&&<div role="alert" className="border p-4 mt-6 text-sm">{error==='not-found'?text('No order found. Check the reference and try again.','لم يتم العثور على الطلب. راجع الرقم وحاول مرة أخرى.'):text('Could not load your order. Please retry.','تعذر تحميل الطلب. حاول مرة أخرى.')}<button className="underline ms-2" onClick={()=>search(input)}>{text('Retry','إعادة المحاولة')}</button></div>}
  <div className="space-y-4 mt-6">{orders.map(order=><article key={order.id} className="border border-brand-border dark:border-brand-border/30 p-5">
   <p className="text-xs font-bold mb-4">{labels[order.status]??text('Status unavailable','الحالة غير متاحة')}</p>
   <dl className="text-sm space-y-3">{[[text('Order reference','رقم الطلب'),order.id],[text('Customer','العميل'),order.customer],[text('Total','الإجمالي'),`${order.total.toLocaleString(lang==='ar'?'ar-EG':'en-EG')} ${text('EGP','ج.م')}`],[text('Payment collected','المبلغ المحصل'),`${order.paid} ${text('EGP','ج.م')}`]].map(([label,value])=><div key={label} className="flex justify-between items-start gap-4"><dt className="shrink-0 text-brand-muted">{label}</dt><dd className="text-end break-all">{value}</dd></div>)}</dl>
   <ol className="flex flex-wrap gap-2 mt-5" aria-label={text('Order progress','مراحل الطلب')}>{Object.keys(labels).map((status,index)=><li key={status} className={`px-2 py-2 text-[10px] border ${Object.keys(labels).indexOf(order.status)>=index?'bg-brand-black text-white dark:bg-offwhite dark:text-brand-black':'text-brand-muted'}`}>{labels[status]}</li>)}</ol>
  </article>)}</div>
 </section>;
}
