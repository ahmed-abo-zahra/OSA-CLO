# OSA-CLO Refactor — Migration Guide

## Files Delivered

| File | Action |
|------|--------|
| `src/app/api/auth/google/callback/route.ts` | **NEW** — Google OAuth callback handler |
| `src/components/GoogleLogin.tsx` | **NEW** — Google sign-in button component |
| `src/components/WhatsAppLogin.tsx` | **REPLACE** — now re-exports GoogleLogin (safe redirect) |
| `src/app/api/checkout/route.ts` | **REPLACE** — manual-only flow, always `pending` |
| `src/app/order/success/page.tsx` | **REPLACE** — 20-min timer + real-time sync |
| `src/app/track/page.tsx` | **REPLACE** — tracking with embedded timer |
| `src/i18n/ar.additions.json` | **MERGE** into `ar.json` |
| `src/i18n/en.additions.json` | **MERGE** into `en.json` |

---

## Step 1 — Supabase: Enable Google OAuth Provider

1. Go to **Supabase Dashboard → Authentication → Providers → Google**
2. Enable Google, paste your **Client ID** and **Client Secret** from [Google Cloud Console](https://console.cloud.google.com/)
3. Add to **Authorized redirect URIs** in Google Cloud:
   ```
   https://espqrrunhekvjsoxdfbx.supabase.co/auth/v1/callback
   ```
4. Add to **Supabase Redirect URLs** (under Auth → URL Configuration):
   ```
   https://osa-clo.vercel.app/api/auth/google/callback
   http://localhost:3000/api/auth/google/callback
   ```

---

## Step 2 — Supabase: Fix RLS on `partners` table ⚠️

The `partners` table has no Row Level Security — anyone with the anon key can read/write it.

Run this SQL in Supabase → SQL Editor **after** adding your read policy:

```sql
-- Enable RLS
ALTER TABLE public.partners ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read partners (for storefront display)
CREATE POLICY "partners_public_read"
  ON public.partners FOR SELECT
  USING (true);

-- Only authenticated admins can insert/update/delete
CREATE POLICY "partners_admin_write"
  ON public.partners FOR ALL
  USING (auth.role() = 'authenticated');
```

---

## Step 3 — Supabase: Add `decrement_stock` RPC (if not already present)

The checkout route calls `supabase.rpc('decrement_stock', ...)`. Add this function if missing:

```sql
CREATE OR REPLACE FUNCTION decrement_stock(p_product_id uuid, p_quantity int)
RETURNS void AS $$
BEGIN
  UPDATE public.products
  SET stock_quantity = GREATEST(0, stock_quantity - p_quantity)
  WHERE id = p_product_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

## Step 4 — Vercel: Add Environment Variables

In Vercel → Project Settings → Environment Variables, ensure these exist:

```
NEXT_PUBLIC_SUPABASE_URL=https://espqrrunhekvjsoxdfbx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
```

No new env vars are needed for Google OAuth — it's handled by Supabase.

---

## Step 5 — Deprecate WhatsApp API Routes

The following files can be **deleted** after confirming no other code imports them:

```
src/app/api/auth/whatsapp/send-otp/route.ts
src/app/api/auth/whatsapp/verify-otp/route.ts
```

The `WhatsAppLogin.tsx` stub re-exports `GoogleLogin` so any existing imports
won't break builds during transition. Remove it once all usages are updated.

---

## Step 6 — Merge i18n Files

Open your existing `src/i18n/ar.json` and `src/i18n/en.json` and merge in the
top-level keys from `ar.additions.json` and `en.additions.json` respectively.

Replace `"YOUR_SUPPORT_NUMBER"` in both success/track pages with your actual WhatsApp number
(format: country code without +, e.g. `201012345678`).

---

## Step 7 — Checkout Page (`src/app/checkout/page.tsx`)

The checkout API now splits orders by partner and returns an array of IDs:

```json
// POST /api/checkout response:
{ "success": true, "orderIds": ["uuid-1", "uuid-2"], "createdAt": "..." }
```

Update the checkout page to handle multiple order IDs:

```tsx
// After successful POST to /api/checkout:
const { orderIds } = await res.json();
router.push(`/order/success?ids=${orderIds.join(',')}`);
```

Remove any Paymob integration code (payment intent creation, webhook references, etc.)
from the checkout page. The checkout flow is now: **form → pending orders (split by vendor) → collective timer**.

---

## Step 8 — Replace Login UI

Find wherever `<WhatsAppLogin />` is rendered in your login modal/page and
replace with (or let the stub handle it):

```tsx
import GoogleLogin from '@/components/GoogleLogin';

// In your login modal/page:
<GoogleLogin redirectTo="https://osa-clo.vercel.app/api/auth/google/callback" />
```

---

## Architecture Summary

```
Customer places order (may contain products from Safia, Aisha, etc.)
        │
        ▼
POST /api/checkout
  ├─ Groups items by partner_id
  ├─ Creates one order PER partner (each with own total + deposit)
  ├─ All orders start with payment_status = "pending"
  └─ Returns { orderIds: ["id1","id2"], createdAt }
        │
        ▼
/order/success?ids=id1,id2
  ├─ Fetches ALL orders from Supabase
  ├─ Computes collective state:
  │    • ALL confirmed → "confirmed"
  │    • ANY pending + expired → "expired"
  │    • Otherwise → "countdown" (earliest pending order's window)
  ├─ Subscribes to real-time updates on ALL orders
  │
  ├─ If ALL orders confirmed → "✓ Booking Confirmed" UI
  │
  └─ If timer expires on earliest pending order → "Expired" UI
         └─ WhatsApp support link

/track?ids=id1,id2
  └─ Same collective timer + individual order cards with status badges
```
