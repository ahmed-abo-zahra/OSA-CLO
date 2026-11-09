# ASO CLO — Security Policy & Technical Hardening Architecture

This document describes the security posture, threat model, vulnerability mitigations, and defensive controls implemented across the ASO CLO multi-tenant e-commerce platform.

---

## 1. Threat Model & Trust Boundaries

The system enforces strict zero-trust boundaries between client browsers and server-side services:

| Layer | Trust Boundary | Primary Defensive Mitigations |
| :--- | :--- | :--- |
| **Storefront (Browser)** | Untrusted | All state, pricing, discount calculation, and stock deductions are derived server-side. |
| **Client DevTools (Fn + F12)** | Untrusted / Inspected | Zero customer PII in public responses, CSP headers, console anti-tampering notice, no sourcemap exposure. |
| **Partner Admin Dashboard** | Authenticated Role-Bounded | HttpOnly HMAC signed session cookies, IP-based & account-based persistent rate limiting, partner category isolation. |
| **Customer Accounts** | Authenticated User-Bounded | Supabase SSR cookie sessions, row-level security (RLS) restricting order history to verified `auth.uid()`. |
| **PostgreSQL Database** | Secure Data Tier | Row Level Security (RLS) on all 11 tables, column-level SELECT grants, security definer RPCs, triggers. |

---

## 2. Injection & Bypass Defenses

### 2.1 SQL Injection Prevention (`1=1`, `' OR '1'='1`)
- **No String Interpolation:** No database query is constructed using string concatenation or template literals.
- **Parameterized RPCs:** Storefront checkout, order updates, and rate limiting execute exclusively via PostgreSQL `SECURITY DEFINER` functions with strongly-typed parameters (`uuid`, `text`, `numeric`, `jsonb`).
- **Admin Password Verification:** Password verification does not query database tables. It hashes provided input with SHA-256 and compares it against environment secrets using `crypto.timingSafeEqual()`. String injection inputs such as `1=1` or `' OR 1=1 --` produce a cryptographic hash mismatch and are safely rejected with `401 Unauthorized`.
- **Character Whitelisting:** Admin partner names are strictly constrained to `^[a-zA-Z0-9_\s-]{1,60}$`, immediately rejecting special injection tokens.

### 2.2 Replay Attacks & Idempotency
- Every checkout submission requires a client-generated UUID in the `Idempotency-Key` HTTP header.
- The `checkout_idempotency` table caches checkout responses keyed by idempotency key and a SHA-256 HMAC request fingerprint.
- Duplicate requests return the cached order confirmation without executing duplicate stock decrements or creating duplicate orders.

---

## 3. Client Inspection (Fn + F12 / DevTools) & Anti-Scraping

### 3.1 Zero Data Leakage in Network Requests
- **No Customer PII in Public APIs:** Public catalog endpoints (`GET /api/products`) return only essential display properties:
  - Excluded from public responses: wholesale cost (`cost_price`), partner UUIDs (`partner_id`), and exact inventory quantities (`stock_quantity`).
  - Exposed safely: boolean availability (`in_stock: true/false`).
- **Customer Order Masking:** Authenticated customer order history (`GET /api/account/orders`) excludes delivery phone numbers, full addresses, and cost prices.
- **Opaque Tracking Tokens:** Public order tracking uses AES-256-GCM / HMAC encrypted tokens that expire after 90 days. Raw order UUIDs are never exposed in URLs or client storage.

### 3.2 Browser Console Warnings & Self-XSS Protection
- A client-side security monitor issues an immediate warning in the browser console when DevTools is opened, notifying users that pasting untrusted code or attempting client-side modifications cannot bypass server-side database checks.
- Production browser sourcemaps are disabled (`productionBrowserSourceMaps: false`) to avoid leaking unminified development code.

---

## 4. Security Headers & Content Security Policy (CSP)

The following HTTP response headers are enforced across all routes via `next.config.mjs`:

```http
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.vercel.app; frame-ancestors 'none';
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
Strict-Transport-Security: max-age=31536000 (Production)
```

---

## 5. Partner Multi-Tenant Isolation

The platform hosts three distinct partner stores within a unified dashboard:
1. **Partner A:** `abayas`, `dresses`, `isdals`, `pants`, `tshirts` (50 products)
2. **Partner B:** `heels`, `slippers`, `sneakers` (30 products)
3. **Partner C:** `accessories`, `girls_bags`, `home_appliances`, `makeup` (40 products)

Database-level triggers (`products_enforce_partner_category` and `order_items_enforce_partner_category`) abort any INSERT or UPDATE transaction if a product or order item does not match the partner's designated category assignment table.

---

## 6. Secrets & Environment Variable Policy

- Secret keys (`SUPABASE_SECRET_KEY`, `ADMIN_SESSION_SECRET`, `ADMIN_PASSWORD_PARTNER_*`) are never prefixed with `NEXT_PUBLIC_` and are never bundled into client JavaScript.
- All secrets reside exclusively in server-side environment variables managed via Vercel Project Settings.
- `.env.example` contains only non-sensitive template keys and placeholders.
