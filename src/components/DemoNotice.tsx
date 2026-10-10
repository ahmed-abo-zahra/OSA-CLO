'use client';
import { useLanguage } from '@/context/LanguageContext';
import { DEMO_MODE } from '@/lib/demo-mode';
export default function DemoNotice(){const {lang}=useLanguage();return DEMO_MODE?<div className="mt-16 px-4 py-2 text-center text-[11px] bg-[#ece7de] text-[#5f564c] dark:bg-brand-gray dark:text-offwhite">{lang==='ar'?'نسخة عرض بمنتجات وطلبات تجريبية — الدفع الإلكتروني غير مفعّل.':'Demo store · Sample products and orders · Online payment is disabled.'}</div>:null;}
