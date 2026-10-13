import {Suspense} from 'react';
import OrderTracking from '@/components/OrderTracking';
export default function SuccessPage(){return <Suspense fallback={<p className="p-8" role="status">Loading… / جاري التحميل…</p>}><OrderTracking success /></Suspense>;}
