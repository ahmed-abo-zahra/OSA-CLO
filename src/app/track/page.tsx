import {Suspense} from 'react';
import OrderTracking from '@/components/OrderTracking';
export default function TrackPage(){return <Suspense fallback={<p className="p-8" role="status">Loading… / جاري التحميل…</p>}><OrderTracking /></Suspense>;}
